import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, notificationLogs, payments, persons, pgs, rooms } from "../db/schema";
import { authMiddleware, roleMiddleware } from "../middleware/auth";
import { resolvePgScope } from "../services/pgScope";
import { getManualReminderTargetSummary, sendManualUnpaidReminders, sendScheduledReminders } from "../services/cron";
import { buildReminderMessage, sendWhatsAppMessage } from "../services/fast2sms";
import { fail, ok, type AppVariables, type EnvBindings } from "../types";
import { buildPaginationMeta, parsePaginationParams } from "../utils/pagination";
import { getEnabledWhatsAppConfig } from "../services/whatsappSettings";

type AppEnv = { Bindings: EnvBindings; Variables: AppVariables };

const triggerSchema = z.object({
  paymentId: z.string().uuid(),
  messageType: z.enum(["reminder_1", "reminder_2", "reminder_3"])
});

const triggerAutoSchema = z.object({
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2000).max(3000).optional(),
  mode: z.enum(["scheduled", "all_unpaid"]).optional().default("all_unpaid")
});

const triggerAutoStatusQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(3000),
  startedAt: z.string().min(1),
  reminderType: z.enum(["reminder_1", "reminder_2", "reminder_3"]),
  totalTargets: z.coerce.number().int().min(0)
});

const runInBackground = (context: { executionCtx?: ExecutionContext }, task: Promise<unknown>) => {
  if (context.executionCtx) {
    context.executionCtx.waitUntil(task);
    return;
  }

  void task;
};

const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.use("*", authMiddleware);

notificationRoutes.get("/logs", roleMiddleware(["superadmin"]), async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const month = c.req.query("month");
    const year = c.req.query("year");
    const status = c.req.query("status")?.trim();
    const messageType = c.req.query("messageType")?.trim();
    const { page, pageSize, offset } = parsePaginationParams(c.req.query("page"), c.req.query("pageSize"), {
      defaultPageSize: 20,
      maxPageSize: 100
    });

    if ((month && !year) || (!month && year)) {
      return fail(c, "Provide both month and year filters", 400);
    }

    if (status && status !== "sent" && status !== "failed") {
      return fail(c, "Invalid status filter", 400);
    }

    if (
      messageType
      && messageType !== "reminder_1"
      && messageType !== "reminder_2"
      && messageType !== "reminder_3"
      && messageType !== "payment_confirmed"
    ) {
      return fail(c, "Invalid messageType filter", 400);
    }

    const statusFilter = status === "sent" || status === "failed" ? status : undefined;
    const messageTypeFilter =
      messageType === "reminder_1"
      || messageType === "reminder_2"
      || messageType === "reminder_3"
      || messageType === "payment_confirmed"
        ? messageType
        : undefined;

    let whereClause = eq(notificationLogs.pgId, pgScope.scope.id);
    if (month && year) {
      whereClause = and(whereClause, eq(notificationLogs.month, Number(month)), eq(notificationLogs.year, Number(year)))!;
    }
    if (statusFilter) {
      whereClause = and(whereClause, eq(notificationLogs.status, statusFilter))!;
    }
    if (messageTypeFilter) {
      whereClause = and(whereClause, eq(notificationLogs.messageType, messageTypeFilter))!;
    }

    const db = getDb(c.env);
    const totalRows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(notificationLogs)
      .where(whereClause);
    const total = totalRows[0]?.value ?? 0;

    const items = await db
      .select({
        id: notificationLogs.id,
        pgId: notificationLogs.pgId,
        pgName: pgs.name,
        personId: notificationLogs.personId,
        month: notificationLogs.month,
        year: notificationLogs.year,
        messageType: notificationLogs.messageType,
        sentAt: notificationLogs.sentAt,
        status: notificationLogs.status
      })
      .from(notificationLogs)
      .leftJoin(pgs, eq(notificationLogs.pgId, pgs.id))
      .where(whereClause)
      .orderBy(desc(notificationLogs.sentAt))
      .limit(pageSize)
      .offset(offset);

    return ok(
      c,
      {
        items,
        pagination: buildPaginationMeta(total, page, pageSize)
      },
      "Notification logs fetched"
    );
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch notification logs", 500);
  }
});

notificationRoutes.post("/trigger", roleMiddleware(["superadmin"]), async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const parsed = triggerSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return fail(c, "Invalid payload", 400, parsed.error.flatten());
    }

    const db = getDb(c.env);
    const rows = await db
      .select({
        paymentId: payments.id,
        pgId: payments.pgId,
        personId: persons.id,
        personName: persons.name,
        personPhone: persons.phone,
        roomNumber: rooms.roomNumber,
        amount: payments.amount,
        month: payments.month,
        year: payments.year
      })
      .from(payments)
      .innerJoin(persons, eq(payments.personId, persons.id))
      .leftJoin(rooms, eq(persons.roomId, rooms.id))
      .where(and(eq(payments.id, parsed.data.paymentId), eq(payments.pgId, pgScope.scope.id)))
      .limit(1);

    const payment = rows[0];
    if (!payment) {
      return fail(c, "Payment not found", 404);
    }

    const configResult = await getEnabledWhatsAppConfig(c.env, pgScope.scope.id);
    if ("disabled" in configResult) {
      return fail(c, "WhatsApp is disabled for this PG", 400);
    }
    if ("error" in configResult) {
      return fail(c, configResult.error, 400);
    }

    const message = buildReminderMessage(
      configResult.config.reminderTemplate,
      payment.personName,
      payment.roomNumber,
      payment.month,
      payment.year
    );

    let status: "sent" | "failed" = "sent";
    let sid: string | null = null;
    let errorMessage: string | null = null;

    try {
      const messageResult = await sendWhatsAppMessage(c.env, configResult.config, payment.personPhone, message);
      sid = messageResult.sid;
    } catch (error) {
      status = "failed";
      errorMessage = (error as Error).message || "Failed to send notification";
    }

    await db.insert(notificationLogs).values({
      pgId: payment.pgId || pgScope.scope.id,
      personId: payment.personId,
      month: payment.month,
      year: payment.year,
      messageType: parsed.data.messageType,
      status
    });

    return ok(
      c,
      {
        status,
        sid,
        errorMessage,
        pgId: payment.pgId,
        messageType: parsed.data.messageType,
        paymentId: payment.paymentId
      },
      status === "sent" ? "Notification sent" : "Notification failed"
    );
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to trigger notification", 500);
  }
});

notificationRoutes.post("/trigger-auto", roleMiddleware(["admin", "superadmin"]), async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const parsed = triggerAutoSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return fail(c, "Invalid payload", 400, parsed.error.flatten());
    }

    const configResult = await getEnabledWhatsAppConfig(c.env, pgScope.scope.id);
    if ("disabled" in configResult) {
      return fail(c, "WhatsApp is disabled for this PG", 400);
    }
    if ("error" in configResult) {
      return fail(c, configResult.error, 400);
    }

    const now = new Date();
    const month = parsed.data.month ?? now.getMonth() + 1;
    const year = parsed.data.year ?? now.getFullYear();

    if (parsed.data.mode === "all_unpaid") {
      const summary = await getManualReminderTargetSummary(c.env, pgScope.scope.id, month, year, now);
      const startedAt = now.toISOString();

      if (!summary.reminderType) {
        return ok(
          c,
          {
            started: false,
            month,
            year,
            mode: parsed.data.mode,
            startedAt,
            ...summary
          },
          "No reminder rule is applicable for today."
        );
      }

      if (summary.totalTargets === 0) {
        return ok(
          c,
          {
            started: false,
            month,
            year,
            mode: parsed.data.mode,
            startedAt,
            ...summary
          },
          "No unpaid tenants pending for this reminder."
        );
      }

      runInBackground(
        c,
        sendManualUnpaidReminders(c.env, month, year, now, pgScope.scope.id, configResult.config)
          .then((stats) => {
            console.log("Manual unpaid reminder run completed", {
              pgId: pgScope.scope.id,
              month,
              year,
              ...stats
            });
          })
          .catch((error) => {
            console.error("Manual unpaid reminder run failed", {
              pgId: pgScope.scope.id,
              month,
              year,
              error: (error as Error).message
            });
          })
      );

      return ok(
        c,
        {
          started: true,
          month,
          year,
          mode: parsed.data.mode,
          startedAt,
          ...summary
        },
        "Reminder run started in background."
      );
    }

    const stats = await sendScheduledReminders(c.env, now, pgScope.scope.id, configResult.config);

    return ok(
      c,
      { ...stats, month, year, mode: parsed.data.mode },
      `Reminder run complete. Sent: ${stats.sent}, Failed: ${stats.failed}`
    );
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to run automatic reminders", 500);
  }
});

notificationRoutes.get("/trigger-auto/status", roleMiddleware(["admin", "superadmin"]), async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const parsed = triggerAutoStatusQuerySchema.safeParse({
      month: c.req.query("month"),
      year: c.req.query("year"),
      startedAt: c.req.query("startedAt"),
      reminderType: c.req.query("reminderType"),
      totalTargets: c.req.query("totalTargets")
    });

    if (!parsed.success) {
      return fail(c, "Invalid status query", 400, parsed.error.flatten());
    }

    const startedAt = new Date(parsed.data.startedAt);
    if (Number.isNaN(startedAt.getTime())) {
      return fail(c, "Invalid startedAt value", 400);
    }

    const db = getDb(c.env);
    const statusRows = await db
      .select({
        status: notificationLogs.status,
        count: sql<number>`count(*)::int`
      })
      .from(notificationLogs)
      .where(
        and(
          eq(notificationLogs.pgId, pgScope.scope.id),
          eq(notificationLogs.month, parsed.data.month),
          eq(notificationLogs.year, parsed.data.year),
          eq(notificationLogs.messageType, parsed.data.reminderType),
          sql`${notificationLogs.sentAt} >= ${startedAt}`
        )
      )
      .groupBy(notificationLogs.status);

    const sent = statusRows.find((row) => row.status === "sent")?.count ?? 0;
    const failed = statusRows.find((row) => row.status === "failed")?.count ?? 0;
    const attempted = sent + failed;
    const totalTargets = parsed.data.totalTargets;
    const remaining = Math.max(totalTargets - attempted, 0);

    return ok(
      c,
      {
        month: parsed.data.month,
        year: parsed.data.year,
        reminderType: parsed.data.reminderType,
        startedAt: startedAt.toISOString(),
        totalTargets,
        attempted,
        sent,
        failed,
        remaining,
        completed: attempted >= totalTargets
      },
      "Reminder run status fetched"
    );
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch reminder run status", 500);
  }
});

export default notificationRoutes;
