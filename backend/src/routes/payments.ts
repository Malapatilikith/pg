import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ensureDefaultPg, getDb, payments, persons, pgs, rooms } from "../db/schema";
import { authMiddleware, roleMiddleware } from "../middleware/auth";
import { ensureDueCyclePayments } from "../services/cron";
import { resolvePgScope } from "../services/pgScope";
import { uploadFileToR2 } from "../services/r2";
import { fail, ok, type AppVariables, type EnvBindings } from "../types";
import { buildPaginationMeta, parsePaginationParams } from "../utils/pagination";

type AppEnv = { Bindings: EnvBindings; Variables: AppVariables };

const monthYearSchema = z.object({
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2000).max(3000).optional()
});

const manualPaymentSchema = z.object({
  personId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(3000),
  amount: z.number().positive(),
  isPaid: z.boolean().optional(),
  paidOn: z.string().optional().or(z.literal(""))
});

const dueCycleSyncSchema = z.object({
  asOf: z.string().optional().or(z.literal(""))
});

const getAsOfDate = (asOf?: string) => {
  if (!asOf) {
    return new Date();
  }

  const parsed = new Date(asOf);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const paymentRoutes = new Hono<AppEnv>();

const isPaymentDuplicateError = (error: unknown) => {
  const message = (error as Error)?.message || "";
  return message.includes("duplicate key value") && message.includes("payments_person_month_year_uidx");
};

const FIXED_PAYMENT_DAY = 1;
const CURRENT_MONTH_CYCLE_CUTOFF_DAY = 5;

const getCycleStartMonthYear = (joinDateValue: string | Date) => {
  const d = new Date(joinDateValue);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }

  let month = d.getMonth() + 1;
  let year = d.getFullYear();

  if (d.getDate() > CURRENT_MONTH_CYCLE_CUTOFF_DAY) {
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }

  return { month, year };
};

const isBeforeMonthYear = (month: number, year: number, refMonth: number, refYear: number) => {
  return year < refYear || (year === refYear && month < refMonth);
};

paymentRoutes.use("*", authMiddleware, roleMiddleware(["admin", "superadmin"]));

paymentRoutes.get("/", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const db = getDb(c.env);
    const result = await db
      .select({
        id: payments.id,
        personId: payments.personId,
        personName: persons.name,
        personPhone: persons.phone,
        pgId: payments.pgId,
        pgName: pgs.name,
        roomNumber: rooms.roomNumber,
        month: payments.month,
        year: payments.year,
        amount: payments.amount,
        isPaid: payments.isPaid,
        paidOn: payments.paidOn,
        receiptUrl: payments.receiptUrl,
        lastPaidOn: sql<string | null>`(select max(p2.paid_on)::text from payments p2 where p2.person_id = ${payments.personId} and p2.is_paid = true)`,
        paidTill: sql<string | null>`(
          select (make_date(p2.year, p2.month, ${FIXED_PAYMENT_DAY}) + interval '1 month')::date::text
          from payments p2
          where p2.person_id = ${payments.personId}
            and p2.is_paid = true
          order by p2.year desc, p2.month desc
          limit 1
        )`,
        markedBy: payments.markedBy,
        createdAt: payments.createdAt
      })
      .from(payments)
      .innerJoin(persons, eq(payments.personId, persons.id))
      .leftJoin(pgs, eq(payments.pgId, pgs.id))
      .leftJoin(rooms, eq(persons.roomId, rooms.id))
      .where(eq(payments.pgId, pgScope.scope.id));

    return ok(c, result, "Payments fetched");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch payments", 500);
  }
});

paymentRoutes.post("/sync-due-cycle", roleMiddleware(["admin", "superadmin"]), async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const parsed = dueCycleSyncSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return fail(c, "Invalid payload", 400, parsed.error.flatten());
    }

    const asOfDate = getAsOfDate(parsed.data.asOf || undefined);
    if (!asOfDate) {
      return fail(c, "Invalid asOf date", 400);
    }

    const generated = await ensureDueCyclePayments(c.env, asOfDate, pgScope.scope.id);

    return ok(
      c,
      {
        generated,
        asOf: asOfDate.toISOString()
      },
      "Due-cycle payments synchronized"
    );
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to sync due-cycle payments", 500);
  }
});

paymentRoutes.post("/generate", roleMiddleware(["superadmin"]), async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const parsed = monthYearSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return fail(c, "Invalid payload", 400, parsed.error.flatten());
    }

    const now = new Date();
    const month = parsed.data.month ?? now.getMonth() + 1;
    const year = parsed.data.year ?? now.getFullYear();

    const db = getDb(c.env);
    const defaultPg = await ensureDefaultPg(c.env);

    const activePersons = await db
      .select({
        personId: persons.id,
        personPgId: persons.pgId,
        joinDate: persons.joinDate,
        roomRent: rooms.rentAmount
      })
      .from(persons)
      .leftJoin(rooms, eq(persons.roomId, rooms.id))
      .where(and(eq(persons.status, "active"), eq(persons.pgId, pgScope.scope.id)));

    let generated = 0;

    for (const row of activePersons) {
      if (!row.roomRent) {
        continue;
      }

      const startCycle = getCycleStartMonthYear(row.joinDate);
      if (isBeforeMonthYear(month, year, startCycle.month, startCycle.year)) {
        continue;
      }

      const inserted = await db
        .insert(payments)
        .values({
          personId: row.personId,
          pgId: row.personPgId || defaultPg?.id || null,
          month,
          year,
          amount: row.roomRent
        })
        .onConflictDoNothing({
          target: [payments.personId, payments.month, payments.year]
        })
        .returning({ id: payments.id });

      if (inserted[0]) {
        generated += 1;
      }
    }

    return ok(c, { generated, month, year }, "Monthly payments generated");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to generate payments", 500);
  }
});

paymentRoutes.get("/month/:month/:year", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const month = Number(c.req.param("month"));
    const year = Number(c.req.param("year"));
    const statusFilter = c.req.query("status")?.trim();
    const personStatus = c.req.query("personStatus")?.trim();
    const search = c.req.query("search")?.trim();
    const { page, pageSize, offset } = parsePaginationParams(c.req.query("page"), c.req.query("pageSize"), {
      defaultPageSize: 20,
      maxPageSize: 100
    });

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return fail(c, "Invalid month", 400);
    }

    if (!Number.isInteger(year) || year < 2000 || year > 3000) {
      return fail(c, "Invalid year", 400);
    }

    if (statusFilter && statusFilter !== "paid" && statusFilter !== "unpaid" && statusFilter !== "all") {
      return fail(c, "Invalid status filter", 400);
    }

    if (personStatus && personStatus !== "active" && personStatus !== "inactive") {
      return fail(c, "Invalid person status filter", 400);
    }

    const conditions = [
      eq(payments.month, month),
      eq(payments.year, year),
      eq(payments.pgId, pgScope.scope.id)
    ];

    if (statusFilter === "paid") {
      conditions.push(eq(payments.isPaid, true));
    } else if (statusFilter === "unpaid") {
      conditions.push(eq(payments.isPaid, false));
    }

    if (personStatus === "active" || personStatus === "inactive") {
      conditions.push(eq(persons.status, personStatus));
    }

    if (search) {
      const searchClause = or(
        ilike(persons.name, `%${search}%`),
        ilike(persons.phone, `%${search}%`),
        ilike(rooms.roomNumber, `%${search}%`)
      );
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    const db = getDb(c.env);
    const totalRows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(payments)
      .innerJoin(persons, eq(payments.personId, persons.id))
      .leftJoin(rooms, eq(persons.roomId, rooms.id))
      .where(and(...conditions));
    const total = totalRows[0]?.value ?? 0;

    const revenueRows = await db
      .select({ totalAmount: sql<string>`coalesce(sum(${payments.amount}), 0)::text` })
      .from(payments)
      .innerJoin(persons, eq(payments.personId, persons.id))
      .leftJoin(rooms, eq(persons.roomId, rooms.id))
      .where(and(...conditions));
    const totalAmount = revenueRows[0]?.totalAmount ?? "0";

    const items = await db
      .select({
        id: payments.id,
        personId: payments.personId,
        personName: persons.name,
        personPhone: persons.phone,
        pgId: payments.pgId,
        pgName: pgs.name,
        roomNumber: rooms.roomNumber,
        amount: payments.amount,
        isPaid: payments.isPaid,
        paidOn: payments.paidOn,
        receiptUrl: payments.receiptUrl,
        lastPaidOn: sql<string | null>`(select max(p2.paid_on)::text from payments p2 where p2.person_id = ${payments.personId} and p2.is_paid = true)`,
        paidTill: sql<string | null>`(
          select (make_date(p2.year, p2.month, ${FIXED_PAYMENT_DAY}) + interval '1 month')::date::text
          from payments p2
          where p2.person_id = ${payments.personId}
            and p2.is_paid = true
          order by p2.year desc, p2.month desc
          limit 1
        )`,
        month: payments.month,
        year: payments.year
      })
      .from(payments)
      .innerJoin(persons, eq(payments.personId, persons.id))
      .leftJoin(pgs, eq(payments.pgId, pgs.id))
      .leftJoin(rooms, eq(persons.roomId, rooms.id))
      .where(and(...conditions))
      .orderBy(desc(payments.createdAt))
      .limit(pageSize)
      .offset(offset);

    return ok(
      c,
      {
        items,
        pagination: buildPaginationMeta(total, page, pageSize),
        totalAmount
      },
      "Monthly payments fetched"
    );
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch monthly payments", 500);
  }
});

paymentRoutes.post("/manual", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const parsed = manualPaymentSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return fail(c, "Invalid payment payload", 400, parsed.error.flatten());
    }

    const db = getDb(c.env);
    const authUser = c.get("user");
    const payload = parsed.data;

    const personRow = await db
      .select({ id: persons.id, pgId: persons.pgId })
      .from(persons)
      .where(and(eq(persons.id, payload.personId), eq(persons.pgId, pgScope.scope.id)))
      .limit(1);

    if (!personRow[0]) {
      return fail(c, "Tenant not found", 404);
    }

    const defaultPg = await ensureDefaultPg(c.env);
    const resolvedPgId = personRow[0].pgId || defaultPg?.id || pgScope.scope.id;

    const existing = await db
      .select({ id: payments.id, isPaid: payments.isPaid })
      .from(payments)
      .where(
        and(
          eq(payments.personId, payload.personId),
          eq(payments.month, payload.month),
          eq(payments.year, payload.year)
        )
      )
      .limit(1);

    let paidOnValue: Date | null = null;
    if (payload.isPaid) {
      if (payload.paidOn) {
        const parsedPaidOn = new Date(payload.paidOn);
        if (Number.isNaN(parsedPaidOn.getTime())) {
          return fail(c, "Invalid paidOn date", 400);
        }
        paidOnValue = parsedPaidOn;
      } else {
        paidOnValue = new Date();
      }
    }

    if (existing[0]) {
      const updated = await db
        .update(payments)
        .set({
          pgId: resolvedPgId,
          amount: payload.amount.toFixed(2),
          isPaid: Boolean(payload.isPaid),
          paidOn: paidOnValue,
          markedBy: authUser?.userId || null
        })
        .where(eq(payments.id, existing[0].id))
        .returning();

      const updatedToPaid = !existing[0].isPaid && Boolean(payload.isPaid);
      return ok(c, updated[0], updatedToPaid ? "Payment updated and marked as paid" : "Payment updated");
    }

    const created = await db
      .insert(payments)
      .values({
        personId: payload.personId,
        pgId: resolvedPgId,
        month: payload.month,
        year: payload.year,
        amount: payload.amount.toFixed(2),
        isPaid: Boolean(payload.isPaid),
        paidOn: paidOnValue,
        markedBy: authUser?.userId || null
      })
      .returning();

    return ok(c, created[0], "Payment created", 201);
  } catch (error) {
    if (isPaymentDuplicateError(error)) {
      return fail(c, "Payment already exists for this month and year", 409);
    }
    return fail(c, (error as Error).message || "Failed to create payment", 500);
  }
});

paymentRoutes.put("/:id/mark-paid", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const paymentId = c.req.param("id");
    const authUser = c.get("user");
    const db = getDb(c.env);

    const paymentRows = await db
      .select({
        id: payments.id,
        isPaid: payments.isPaid
      })
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.pgId, pgScope.scope.id)))
      .limit(1);

    const payment = paymentRows[0];
    if (!payment) {
      return fail(c, "Payment not found", 404);
    }

    if (payment.isPaid) {
      return fail(c, "Payment already marked as paid", 400);
    }

    const updated = await db
      .update(payments)
      .set({
        isPaid: true,
        paidOn: new Date(),
        markedBy: authUser?.userId || null
      })
      .where(and(eq(payments.id, paymentId), eq(payments.pgId, pgScope.scope.id)))
      .returning();

    return ok(
      c,
      {
        payment: updated[0]
      },
      "Payment marked as paid"
    );
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to mark payment as paid", 500);
  }
});

paymentRoutes.post("/:id/receipt", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const paymentId = c.req.param("id");
    const db = getDb(c.env);

    const existing = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.pgId, pgScope.scope.id)))
      .limit(1);
    if (!existing[0]) {
      return fail(c, "Payment not found", 404);
    }

    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      return fail(c, "Missing file field in multipart/form-data", 400);
    }

    const url = await uploadFileToR2(c.env, file, "receipts", paymentId);

    const updated = await db
      .update(payments)
      .set({ receiptUrl: url })
      .where(and(eq(payments.id, paymentId), eq(payments.pgId, pgScope.scope.id)))
      .returning({ id: payments.id, receiptUrl: payments.receiptUrl });

    return ok(c, updated[0], "Receipt uploaded");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to upload receipt", 500);
  }
});

paymentRoutes.get("/:personId", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const personId = c.req.param("personId");
    const db = getDb(c.env);
    const result = await db
      .select()
      .from(payments)
      .where(and(eq(payments.personId, personId), eq(payments.pgId, pgScope.scope.id)));
    return ok(c, result, "Person payments fetched");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch person payments", 500);
  }
});

export default paymentRoutes;
