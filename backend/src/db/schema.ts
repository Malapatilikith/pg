import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { check, decimal, integer, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar, date, boolean } from "drizzle-orm/pg-core";
import { and, asc, eq, sql } from "drizzle-orm";
import type { EnvBindings } from "../types";

export const userRoleEnum = pgEnum("user_role", ["admin", "superadmin", "founder"]);
export const roomStatusEnum = pgEnum("room_status", ["available", "occupied"]);
export const personStatusEnum = pgEnum("person_status", ["active", "inactive"]);
export const messageTypeEnum = pgEnum("message_type", [
  "reminder_1",
  "reminder_2",
  "reminder_3",
  "payment_confirmed"
]);
export const notificationStatusEnum = pgEnum("notification_status", ["sent", "failed"]);
export const reminderRunModeEnum = pgEnum("reminder_run_mode", ["all_unpaid", "scheduled"]);

export const pgs = pgTable("pgs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  logoUrl: varchar("logo_url", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const pgWhatsappSettings = pgTable(
  "pg_whatsapp_settings",
  {
    pgId: uuid("pg_id")
      .primaryKey()
      .references(() => pgs.id, { onDelete: "cascade" }),
    whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
    whatsappApiKey: varchar("whatsapp_api_key", { length: 255 }),
    whatsappPhoneNumberId: varchar("whatsapp_phone_number_id", { length: 120 }),
    whatsappTemplateReminder: varchar("whatsapp_template_reminder", { length: 120 }),
    whatsappTemplateConfirmation: varchar("whatsapp_template_confirmation", { length: 120 }),
    whatsappTemplateLanguageCode: varchar("whatsapp_template_language_code", { length: 10 })
      .notNull()
      .default("en"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    requiredCheck: check(
      "pg_whatsapp_settings_required_check",
      sql`${table.whatsappEnabled} = false OR (
        ${table.whatsappApiKey} IS NOT NULL
        AND ${table.whatsappPhoneNumberId} IS NOT NULL
        AND ${table.whatsappTemplateReminder} IS NOT NULL
        AND ${table.whatsappTemplateConfirmation} IS NOT NULL
      )`
    )
  })
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("admin"),
  pgId: uuid("pg_id").references(() => pgs.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pgId: uuid("pg_id").references(() => pgs.id, { onDelete: "set null" }),
    roomNumber: varchar("room_number", { length: 50 }).notNull(),
    floor: varchar("floor", { length: 50 }).notNull(),
    capacity: integer("capacity").notNull(),
    rentAmount: decimal("rent_amount", { precision: 10, scale: 2 }).notNull(),
    status: roomStatusEnum("status").notNull().default("available"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    pgRoomNumberIdx: uniqueIndex("rooms_pg_room_number_uidx").on(table.pgId, table.roomNumber)
  })
);

export const persons = pgTable(
  "persons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    email: varchar("email", { length: 255 }),
    aadhaarUrl: varchar("aadhaar_url", { length: 500 }),
    pgId: uuid("pg_id").references(() => pgs.id, { onDelete: "set null" }),
    roomId: uuid("room_id")
      .references(() => rooms.id, { onDelete: "set null" }),
    joinDate: date("join_date").notNull(),
    paymentDay: integer("payment_day").notNull().default(1),
    status: personStatusEnum("status").notNull().default("active"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    paymentDayCheck: check("persons_payment_day_check", sql`${table.paymentDay} >= 1 AND ${table.paymentDay} <= 28`)
  })
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pgId: uuid("pg_id").references(() => pgs.id, { onDelete: "set null" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    isPaid: boolean("is_paid").notNull().default(false),
    paidOn: timestamp("paid_on", { withTimezone: true }),
    receiptUrl: varchar("receipt_url", { length: 500 }),
    markedBy: uuid("marked_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    personMonthYearIdx: uniqueIndex("payments_person_month_year_uidx").on(table.personId, table.month, table.year)
  })
);

export const notificationLogs = pgTable("notification_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  pgId: uuid("pg_id").references(() => pgs.id, { onDelete: "set null" }),
  personId: uuid("person_id")
    .notNull()
    .references(() => persons.id, { onDelete: "cascade" }),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  messageType: messageTypeEnum("message_type").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  status: notificationStatusEnum("status").notNull()
});

export const reminderRunLimits = pgTable(
  "reminder_run_limits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pgId: uuid("pg_id").notNull().references(() => pgs.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    mode: reminderRunModeEnum("mode").notNull().default("all_unpaid"),
    slot: integer("slot").notNull(),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    slotCheck: check("reminder_run_limits_slot_check", sql`${table.slot} >= 1 AND ${table.slot} <= 2`),
    monthCheck: check("reminder_run_limits_month_check", sql`${table.month} >= 1 AND ${table.month} <= 12`),
    yearCheck: check("reminder_run_limits_year_check", sql`${table.year} >= 2000 AND ${table.year} <= 3000`),
    pgMonthYearModeSlotIdx: uniqueIndex("reminder_run_limits_pg_month_year_mode_slot_uidx").on(
      table.pgId,
      table.month,
      table.year,
      table.mode,
      table.slot
    )
  })
);

export const schema = {
  pgs,
  pgWhatsappSettings,
  users,
  rooms,
  persons,
  payments,
  notificationLogs,
  reminderRunLimits
};

export const getDb = (env: EnvBindings) => {
  const client = neon(env.DATABASE_URL);
  return drizzle(client, { schema });
};

export const ensureDefaultPg = async (env: EnvBindings) => {
  const db = getDb(env);
  const existing = await db.select({ id: pgs.id, name: pgs.name }).from(pgs).orderBy(asc(pgs.createdAt)).limit(1);

  if (existing[0]) {
    return existing[0];
  }

  return null;
};

export const recalculateRoomStatus = async (env: EnvBindings, roomId: string) => {
  const db = getDb(env);
  const roomRow = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!roomRow[0]) {
    return;
  }

  const countRows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(persons)
    .where(and(eq(persons.roomId, roomId), eq(persons.status, "active")));

  const activeCount = countRows[0]?.value ?? 0;
  const nextStatus = activeCount >= roomRow[0].capacity ? "occupied" : "available";

  await db.update(rooms).set({ status: nextStatus }).where(eq(rooms.id, roomId));
};
