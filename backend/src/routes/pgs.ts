import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, persons, pgs, pgWhatsappSettings, rooms } from "../db/schema";
import { authMiddleware, roleMiddleware } from "../middleware/auth";
import { fail, ok, type AppVariables, type EnvBindings } from "../types";
import { uploadFileToR2 } from "../services/r2";

type AppEnv = { Bindings: EnvBindings; Variables: AppVariables };

const pgCreateSchema = z.object({
  name: z.string().trim().min(2),
  whatsapp: z
    .object({
      enabled: z.boolean().optional(),
      apiKey: z.string().trim().min(1).optional(),
      phoneNumberId: z.string().trim().min(1).optional(),
      templateReminder: z.string().trim().min(1).optional(),
      templateConfirmation: z.string().trim().min(1).optional(),
      languageCode: z.string().trim().min(2).max(10).optional()
    })
    .optional()
});

const whatsappUpdateSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().trim().min(1).optional(),
  phoneNumberId: z.string().trim().min(1).optional(),
  templateReminder: z.string().trim().min(1).optional(),
  templateConfirmation: z.string().trim().min(1).optional(),
  languageCode: z.string().trim().min(2).max(10).optional()
});

const pgUpdateSchema = z.object({
  name: z.string().trim().min(2)
});

const isPgNameConflictError = (error: unknown) => {
  const message = (error as Error)?.message || "";
  return message.includes("duplicate key value") && (message.includes("pgs_name") || message.includes("pgs_name_key"));
};

const pgRoutes = new Hono<AppEnv>();

pgRoutes.use("*", authMiddleware, roleMiddleware(["founder"]));

pgRoutes.get("/", async (c) => {
  try {
    const db = getDb(c.env);
    const rows = await db
      .select({
        id: pgs.id,
        name: pgs.name,
        logoUrl: pgs.logoUrl,
        createdAt: pgs.createdAt,
        whatsappEnabled: pgWhatsappSettings.whatsappEnabled,
        roomsCount: sql<number>`(select count(*)::int from ${rooms} r where r.pg_id = ${pgs.id})`,
        tenantsCount: sql<number>`(select count(*)::int from ${persons} p where p.pg_id = ${pgs.id})`
      })
      .from(pgs)
      .leftJoin(pgWhatsappSettings, eq(pgWhatsappSettings.pgId, pgs.id))
      .orderBy(asc(pgs.createdAt));

    return ok(c, rows, "PGs fetched");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch PGs", 500);
  }
});

pgRoutes.get("/:id/summary", async (c) => {
  try {
    const pgId = c.req.param("id");
    const db = getDb(c.env);
    
    const rows = await db
      .select({
        id: pgs.id,
        name: pgs.name,
        logoUrl: pgs.logoUrl,
        createdAt: pgs.createdAt,
        whatsappEnabled: pgWhatsappSettings.whatsappEnabled,
        roomsCount: sql<number>`(select count(*)::int from ${rooms} r where r.pg_id = ${pgs.id})`,
        tenantsCount: sql<number>`(select count(*)::int from ${persons} p where p.pg_id = ${pgs.id})`
      })
      .from(pgs)
      .leftJoin(pgWhatsappSettings, eq(pgWhatsappSettings.pgId, pgs.id))
      .where(eq(pgs.id, pgId))
      .limit(1);

    if (!rows[0]) {
      return fail(c, "PG not found", 404);
    }

    return ok(c, rows[0], "PG summary fetched");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch PG summary", 500);
  }
});

pgRoutes.post("/", async (c) => {
  try {
    const parsed = pgCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return fail(c, "Invalid PG payload", 400, parsed.error.flatten());
    }

    const db = getDb(c.env);
    const existing = await db.select({ id: pgs.id }).from(pgs).where(eq(pgs.name, parsed.data.name)).limit(1);
    if (existing[0]) {
      return fail(c, "PG name already exists", 409);
    }

    const created = await db.insert(pgs).values({ name: parsed.data.name }).returning({ id: pgs.id, name: pgs.name });
    const pg = created[0];
    if (!pg) {
      return fail(c, "Failed to create PG", 500);
    }

    const whatsapp = parsed.data.whatsapp;
    const enabled = Boolean(whatsapp?.enabled);

    if (enabled && (!whatsapp?.apiKey || !whatsapp.phoneNumberId || !whatsapp.templateReminder || !whatsapp.templateConfirmation)) {
      return fail(c, "WhatsApp settings are required when enabled", 400);
    }

    await db.insert(pgWhatsappSettings).values({
      pgId: pg.id,
      whatsappEnabled: enabled,
      whatsappApiKey: whatsapp?.apiKey ?? null,
      whatsappPhoneNumberId: whatsapp?.phoneNumberId ?? null,
      whatsappTemplateReminder: whatsapp?.templateReminder ?? null,
      whatsappTemplateConfirmation: whatsapp?.templateConfirmation ?? null,
      whatsappTemplateLanguageCode: whatsapp?.languageCode ?? "en",
      updatedAt: new Date()
    });

    return ok(c, { id: pg.id, name: pg.name }, "PG created", 201);
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to create PG", 500);
  }
});

pgRoutes.put("/:id", async (c) => {
  try {
    const pgId = c.req.param("id");
    const parsed = pgUpdateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return fail(c, "Invalid PG payload", 400, parsed.error.flatten());
    }

    const db = getDb(c.env);
    const existing = await db.select({ id: pgs.id, name: pgs.name }).from(pgs).where(eq(pgs.id, pgId)).limit(1);
    if (!existing[0]) {
      return fail(c, "PG not found", 404);
    }

    if (existing[0].name === parsed.data.name) {
      return ok(c, { id: pgId, name: existing[0].name }, "PG updated");
    }

    const updated = await db
      .update(pgs)
      .set({ name: parsed.data.name })
      .where(eq(pgs.id, pgId))
      .returning({ id: pgs.id, name: pgs.name });

    if (!updated[0]) {
      return fail(c, "PG not found", 404);
    }

    return ok(c, updated[0], "PG updated");
  } catch (error) {
    if (isPgNameConflictError(error)) {
      return fail(c, "PG name already exists", 409);
    }
    return fail(c, (error as Error).message || "Failed to update PG", 500);
  }
});

pgRoutes.post("/:id/logo", async (c) => {
  try {
    const pgId = c.req.param("id");
    const db = getDb(c.env);

    const existing = await db.select({ id: pgs.id }).from(pgs).where(eq(pgs.id, pgId)).limit(1);
    if (!existing[0]) {
      return fail(c, "PG not found", 404);
    }

    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      return fail(c, "Missing file field in multipart/form-data", 400);
    }

    const url = await uploadFileToR2(c.env, file, "logos", pgId);

    const updated = await db
      .update(pgs)
      .set({ logoUrl: url })
      .where(eq(pgs.id, pgId))
      .returning({ id: pgs.id, logoUrl: pgs.logoUrl });

    return ok(c, updated[0], "Logo uploaded");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to upload logo", 500);
  }
});

pgRoutes.get("/:id/whatsapp", async (c) => {
  try {
    const pgId = c.req.param("id");
    const db = getDb(c.env);

    const pgRows = await db.select({ id: pgs.id }).from(pgs).where(eq(pgs.id, pgId)).limit(1);
    if (!pgRows[0]) {
      return fail(c, "PG not found", 404);
    }

    const rows = await db
      .select({
        pgId: pgWhatsappSettings.pgId,
        whatsappEnabled: pgWhatsappSettings.whatsappEnabled,
        whatsappApiKey: pgWhatsappSettings.whatsappApiKey,
        whatsappPhoneNumberId: pgWhatsappSettings.whatsappPhoneNumberId,
        whatsappTemplateReminder: pgWhatsappSettings.whatsappTemplateReminder,
        whatsappTemplateConfirmation: pgWhatsappSettings.whatsappTemplateConfirmation,
        whatsappTemplateLanguageCode: pgWhatsappSettings.whatsappTemplateLanguageCode,
        updatedAt: pgWhatsappSettings.updatedAt
      })
      .from(pgWhatsappSettings)
      .where(eq(pgWhatsappSettings.pgId, pgId))
      .limit(1);

    if (!rows[0]) {
      return fail(c, "WhatsApp settings not found", 404);
    }

    return ok(c, rows[0], "WhatsApp settings fetched");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch WhatsApp settings", 500);
  }
});

pgRoutes.put("/:id/whatsapp", async (c) => {
  try {
    const pgId = c.req.param("id");
    const parsed = whatsappUpdateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return fail(c, "Invalid WhatsApp payload", 400, parsed.error.flatten());
    }

    if (parsed.data.enabled && (!parsed.data.apiKey || !parsed.data.phoneNumberId || !parsed.data.templateReminder || !parsed.data.templateConfirmation)) {
      return fail(c, "WhatsApp settings are required when enabled", 400);
    }

    const db = getDb(c.env);
    const pgRows = await db.select({ id: pgs.id }).from(pgs).where(eq(pgs.id, pgId)).limit(1);
    if (!pgRows[0]) {
      return fail(c, "PG not found", 404);
    }
    await db
      .insert(pgWhatsappSettings)
      .values({
        pgId,
        whatsappEnabled: parsed.data.enabled,
        whatsappApiKey: parsed.data.apiKey ?? null,
        whatsappPhoneNumberId: parsed.data.phoneNumberId ?? null,
        whatsappTemplateReminder: parsed.data.templateReminder ?? null,
        whatsappTemplateConfirmation: parsed.data.templateConfirmation ?? null,
        whatsappTemplateLanguageCode: parsed.data.languageCode ?? "en",
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: pgWhatsappSettings.pgId,
        set: {
          whatsappEnabled: parsed.data.enabled,
          whatsappApiKey: parsed.data.apiKey ?? null,
          whatsappPhoneNumberId: parsed.data.phoneNumberId ?? null,
          whatsappTemplateReminder: parsed.data.templateReminder ?? null,
          whatsappTemplateConfirmation: parsed.data.templateConfirmation ?? null,
          whatsappTemplateLanguageCode: parsed.data.languageCode ?? "en",
          updatedAt: new Date()
        }
      });

    return ok(c, { pgId }, "WhatsApp settings updated");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to update WhatsApp settings", 500);
  }
});

export default pgRoutes;
