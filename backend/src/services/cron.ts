import { and, eq, inArray } from "drizzle-orm";
import { ensureDefaultPg, getDb, notificationLogs, payments, persons, rooms } from "../db/schema";
import { buildReminderMessage, sendWhatsAppMessage } from "./fast2sms";
import { listEnabledWhatsAppConfigs, type EnabledWhatsAppConfig } from "./whatsappSettings";
import type { EnvBindings, NotificationMessageType } from "../types";

const reminderByOffset: Record<number, Exclude<NotificationMessageType, "payment_confirmed">> = {
  1: "reminder_1",
  5: "reminder_2"
};

const FIXED_PAYMENT_DAY = 1;
const CURRENT_MONTH_CYCLE_CUTOFF_DAY = 5;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const toIstReferenceDate = (value: Date) => new Date(value.getTime() + IST_OFFSET_MS);

const getIstMonthYear = (value: Date) => {
  const istDate = toIstReferenceDate(value);
  return {
    month: istDate.getUTCMonth() + 1,
    year: istDate.getUTCFullYear()
  };
};

const getIstDay = (value: Date) => toIstReferenceDate(value).getUTCDate();

const parseCycleDate = (joinDateValue: string | Date) => {
  if (joinDateValue instanceof Date) {
    return joinDateValue;
  }

  const normalized = joinDateValue.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (dateOnlyMatch) {
    const [, yearRaw, monthRaw, dayRaw] = dateOnlyMatch;
    return new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw)));
  }

  return new Date(normalized);
};

const getCycleStartMonthYear = (joinDateValue: string | Date) => {
  const d = parseCycleDate(joinDateValue);
  if (Number.isNaN(d.getTime())) {
    return getIstMonthYear(new Date());
  }

  const istDate = toIstReferenceDate(d);
  let month = istDate.getUTCMonth() + 1;
  let year = istDate.getUTCFullYear();

  if (istDate.getUTCDate() > CURRENT_MONTH_CYCLE_CUTOFF_DAY) {
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

const getDueCycleMonthYear = (currentDate: Date, paymentDay: number) => {
  const istDate = toIstReferenceDate(currentDate);
  let month = istDate.getUTCMonth() + 1;
  let year = istDate.getUTCFullYear();

  if (istDate.getUTCDate() < paymentDay) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return { month, year };
};

const resolveManualReminderType = (
  currentDay: number,
  paymentDay: number
): Exclude<NotificationMessageType, "payment_confirmed"> | null => {
  const overdueDays = currentDay - paymentDay;
  if (overdueDays >= 5) {
    return "reminder_2";
  }
  if (overdueDays >= 1) {
    return "reminder_1";
  }

  return null;
};

const getManualReminderTypeForDate = (date = new Date()) => {
  return resolveManualReminderType(getIstDay(date), FIXED_PAYMENT_DAY);
};

export interface ReminderRunStats {
  attempted: number;
  sent: number;
  failed: number;
  skippedNoRule: number;
  skippedAlreadySent: number;
}

export interface ManualReminderTargetSummary {
  reminderType: Exclude<NotificationMessageType, "payment_confirmed"> | null;
  totalUnpaid: number;
  totalTargets: number;
  alreadySent: number;
}

const getSentPersonIdsForReminder = async (
  env: EnvBindings,
  personIds: string[],
  month: number,
  year: number,
  reminderType: Exclude<NotificationMessageType, "payment_confirmed">
) => {
  if (personIds.length === 0) {
    return new Set<string>();
  }

  const db = getDb(env);
  const sentLogs = await db
    .select({ personId: notificationLogs.personId })
    .from(notificationLogs)
    .where(
      and(
        inArray(notificationLogs.personId, personIds),
        eq(notificationLogs.month, month),
        eq(notificationLogs.year, year),
        eq(notificationLogs.messageType, reminderType),
        eq(notificationLogs.status, "sent")
      )
    );

  return new Set(sentLogs.map((row) => row.personId));
};

type NotificationLogInput = {
  pgId: string | null;
  personId: string;
  month: number;
  year: number;
  messageType: Exclude<NotificationMessageType, "payment_confirmed">;
  status: "sent" | "failed";
};

const insertNotificationLog = async (db: ReturnType<typeof getDb>, values: NotificationLogInput) => {
  try {
    await db.insert(notificationLogs).values(values);
  } catch (error) {
    console.error("Failed to write notification log", {
      personId: values.personId,
      month: values.month,
      year: values.year,
      messageType: values.messageType,
      status: values.status,
      error: (error as Error).message
    });
  }
};

export const getManualReminderTargetSummary = async (
  env: EnvBindings,
  pgId: string,
  month: number,
  year: number,
  date = new Date()
): Promise<ManualReminderTargetSummary> => {
  const db = getDb(env);
  const reminderType = getManualReminderTypeForDate(date);
  const pending = await db
    .select({ personId: persons.id })
    .from(payments)
    .innerJoin(persons, eq(payments.personId, persons.id))
    .where(
      and(
        eq(payments.month, month),
        eq(payments.year, year),
        eq(payments.isPaid, false),
        eq(persons.status, "active"),
        eq(persons.pgId, pgId)
      )
    );

  const totalUnpaid = pending.length;
  if (!reminderType || totalUnpaid === 0) {
    return {
      reminderType,
      totalUnpaid,
      totalTargets: 0,
      alreadySent: 0
    };
  }

  const sentPersonIds = await getSentPersonIdsForReminder(
    env,
    pending.map((row) => row.personId),
    month,
    year,
    reminderType
  );

  return {
    reminderType,
    totalUnpaid,
    totalTargets: Math.max(totalUnpaid - sentPersonIds.size, 0),
    alreadySent: sentPersonIds.size
  };
};

export const generateMonthlyPayments = async (env: EnvBindings, date = new Date()) => {
  const db = getDb(env);
  const defaultPg = await ensureDefaultPg(env);
  const { month, year } = getIstMonthYear(date);

  const activePersons = await db
    .select({
      personId: persons.id,
      personPgId: persons.pgId,
      joinDate: persons.joinDate,
      roomRent: rooms.rentAmount
    })
    .from(persons)
    .leftJoin(rooms, eq(persons.roomId, rooms.id))
    .where(eq(persons.status, "active"));

  for (const row of activePersons) {
    if (!row.roomRent) {
      continue;
    }

    const startCycle = getCycleStartMonthYear(row.joinDate);
    if (isBeforeMonthYear(month, year, startCycle.month, startCycle.year)) {
      continue;
    }

    await db
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
      });
  }
};

export const ensureDueCyclePayments = async (env: EnvBindings, currentDate = new Date(), pgId?: string) => {
  const db = getDb(env);
  const defaultPg = await ensureDefaultPg(env);

  const activePersons = await db
    .select({
      personId: persons.id,
      personPgId: persons.pgId,
      joinDate: persons.joinDate,
      roomRent: rooms.rentAmount
    })
    .from(persons)
    .leftJoin(rooms, eq(persons.roomId, rooms.id))
    .where(pgId ? and(eq(persons.status, "active"), eq(persons.pgId, pgId)) : eq(persons.status, "active"));

  let generated = 0;

  for (const row of activePersons) {
    if (!row.roomRent) {
      continue;
    }

    const paymentDay = FIXED_PAYMENT_DAY;
    const cycle = getDueCycleMonthYear(currentDate, paymentDay);
    const startCycle = getCycleStartMonthYear(row.joinDate);

    if (isBeforeMonthYear(cycle.month, cycle.year, startCycle.month, startCycle.year)) {
      continue;
    }

    const inserted = await db
      .insert(payments)
      .values({
        personId: row.personId,
        pgId: row.personPgId || defaultPg?.id || null,
        month: cycle.month,
        year: cycle.year,
        amount: row.roomRent,
        isPaid: false
      })
      .onConflictDoNothing({
        target: [payments.personId, payments.month, payments.year]
      })
      .returning({ id: payments.id });

    if (inserted[0]) {
      generated += 1;
    }
  }

  return generated;
};

export const sendScheduledReminders = async (
  env: EnvBindings,
  date = new Date(),
  pgId: string,
  config: EnabledWhatsAppConfig
): Promise<ReminderRunStats> => {
  const db = getDb(env);
  const defaultPg = await ensureDefaultPg(env);
  const day = getIstDay(date);
  const { month, year } = getIstMonthYear(date);
  const stats: ReminderRunStats = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skippedNoRule: 0,
    skippedAlreadySent: 0
  };

  const pending = await db
    .select({
      paymentId: payments.id,
      amount: payments.amount,
      paymentMonth: payments.month,
      paymentYear: payments.year,
      personId: persons.id,
      personPgId: persons.pgId,
      personName: persons.name,
      personPhone: persons.phone,
      roomNumber: rooms.roomNumber,
      joinDate: persons.joinDate
    })
    .from(payments)
    .innerJoin(persons, eq(payments.personId, persons.id))
    .leftJoin(rooms, eq(persons.roomId, rooms.id))
    .where(
      and(
        eq(payments.month, month),
        eq(payments.year, year),
        eq(payments.isPaid, false),
        eq(persons.status, "active"),
        eq(persons.pgId, pgId)
      )
    );

  const paymentDay = FIXED_PAYMENT_DAY;
  const offset = day - paymentDay;
  const reminderType = reminderByOffset[offset];

  if (!reminderType) {
    stats.skippedNoRule = pending.length;
    return stats;
  }

  const sentPersonIds = await getSentPersonIdsForReminder(
    env,
    pending.map((row) => row.personId),
    month,
    year,
    reminderType
  );

  for (const row of pending) {
    stats.attempted += 1;
    if (sentPersonIds.has(row.personId)) {
      stats.skippedAlreadySent += 1;
      continue;
    }

    const message = buildReminderMessage(
      config.reminderTemplate,
      row.personName,
      row.roomNumber,
      row.paymentMonth,
      row.paymentYear
    );

    try {
      await sendWhatsAppMessage(env, config, row.personPhone, message);
      await insertNotificationLog(db, {
        pgId: row.personPgId || pgId || defaultPg?.id || null,
        personId: row.personId,
        month,
        year,
        messageType: reminderType,
        status: "sent"
      });
      stats.sent += 1;
    } catch (error) {
      console.error("Scheduled reminder send failed", {
        personId: row.personId,
        month,
        year,
        reminderType,
        error: (error as Error).message
      });
      await insertNotificationLog(db, {
        pgId: row.personPgId || pgId || defaultPg?.id || null,
        personId: row.personId,
        month,
        year,
        messageType: reminderType,
        status: "failed"
      });
      stats.failed += 1;
    }
  }

  return stats;
};

export const sendManualUnpaidReminders = async (
  env: EnvBindings,
  month: number,
  year: number,
  date = new Date(),
  pgId: string,
  config: EnabledWhatsAppConfig
): Promise<ReminderRunStats> => {
  const db = getDb(env);
  const defaultPg = await ensureDefaultPg(env);
  const currentDay = getIstDay(date);
  const stats: ReminderRunStats = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skippedNoRule: 0,
    skippedAlreadySent: 0
  };

  const pending = await db
    .select({
      amount: payments.amount,
      paymentMonth: payments.month,
      paymentYear: payments.year,
      personId: persons.id,
      personPgId: persons.pgId,
      personName: persons.name,
      personPhone: persons.phone,
      roomNumber: rooms.roomNumber,
      joinDate: persons.joinDate
    })
    .from(payments)
    .innerJoin(persons, eq(payments.personId, persons.id))
    .leftJoin(rooms, eq(persons.roomId, rooms.id))
    .where(
      and(
        eq(payments.month, month),
        eq(payments.year, year),
        eq(payments.isPaid, false),
        eq(persons.status, "active"),
        eq(persons.pgId, pgId)
      )
    );

  const paymentDay = FIXED_PAYMENT_DAY;
  const reminderType = resolveManualReminderType(currentDay, paymentDay);

  if (!reminderType) {
    stats.skippedNoRule = pending.length;
    return stats;
  }

  const sentPersonIds = await getSentPersonIdsForReminder(
    env,
    pending.map((row) => row.personId),
    month,
    year,
    reminderType
  );

  for (const row of pending) {
    stats.attempted += 1;
    if (sentPersonIds.has(row.personId)) {
      stats.skippedAlreadySent += 1;
      continue;
    }

    const message = buildReminderMessage(
      config.reminderTemplate,
      row.personName,
      row.roomNumber,
      row.paymentMonth,
      row.paymentYear
    );

    try {
      await sendWhatsAppMessage(env, config, row.personPhone, message);
      await insertNotificationLog(db, {
        pgId: row.personPgId || pgId || defaultPg?.id || null,
        personId: row.personId,
        month,
        year,
        messageType: reminderType,
        status: "sent"
      });
      stats.sent += 1;
    } catch (error) {
      console.error("Manual reminder send failed", {
        personId: row.personId,
        month,
        year,
        reminderType,
        error: (error as Error).message
      });
      await insertNotificationLog(db, {
        pgId: row.personPgId || pgId || defaultPg?.id || null,
        personId: row.personId,
        month,
        year,
        messageType: reminderType,
        status: "failed"
      });
      stats.failed += 1;
    }
  }

  return stats;
};

export const runCronJobs = async (env: EnvBindings, date = new Date()) => {
  console.log("Cron run started", {
    scheduledAtUtc: date.toISOString(),
    istDay: getIstDay(date)
  });

  if (getIstDay(date) === 1) {
    try {
      await generateMonthlyPayments(env, date);
    } catch (error) {
      console.error("Cron monthly payment generation failed", {
        error: (error as Error).message
      });
    }
  }

  try {
    await ensureDueCyclePayments(env, date);
  } catch (error) {
    console.error("Cron due-cycle payment sync failed", {
      error: (error as Error).message
    });
  }

  let enabledConfigs: Array<{ pgId: string; config: EnabledWhatsAppConfig }> = [];
  try {
    enabledConfigs = await listEnabledWhatsAppConfigs(env);
  } catch (error) {
    console.error("Cron failed to load WhatsApp configs", {
      error: (error as Error).message
    });
    return;
  }

  for (const { pgId, config } of enabledConfigs) {
    try {
      await sendScheduledReminders(env, date, pgId, config);
    } catch (error) {
      console.error("Cron reminder run failed for PG", {
        pgId,
        error: (error as Error).message
      });
    }
  }

  console.log("Cron run completed", { processedPgs: enabledConfigs.length });
};
