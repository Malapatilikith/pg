import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ensureDefaultPg, getDb, payments, persons, pgs, recalculateRoomStatus, rooms } from "../db/schema";
import { authMiddleware, roleMiddleware } from "../middleware/auth";
import { resolvePgScope } from "../services/pgScope";
import { deleteFilesFromR2, uploadFileToR2 } from "../services/r2";
import { fail, ok, type AppVariables, type EnvBindings } from "../types";
import { buildPaginationMeta, parsePaginationParams } from "../utils/pagination";

type AppEnv = { Bindings: EnvBindings; Variables: AppVariables };

const phoneRegex = /^\+91\d{10}$/;

const personCreateSchema = z.object({
  name: z.string().min(2),
  phone: z.string().regex(phoneRegex, "Phone must be in +91XXXXXXXXXX format"),
  email: z.email().optional().or(z.literal("")),
  roomId: z.string().uuid(),
  joinDate: z.string(),
  paymentDay: z.number().int().min(1).max(28).optional(),
  status: z.enum(["active", "inactive"]).optional()
});

const personUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().regex(phoneRegex, "Phone must be in +91XXXXXXXXXX format").optional(),
  email: z.email().optional().or(z.literal("")).or(z.null()),
  roomId: z.string().uuid().optional().or(z.literal("")).or(z.null()),
  joinDate: z.string().optional(),
  paymentDay: z.number().int().min(1).max(28).optional(),
  status: z.enum(["active", "inactive"]).optional()
});

const personRoutes = new Hono<AppEnv>();

const FIXED_PAYMENT_DAY = 1;
const CURRENT_MONTH_CYCLE_CUTOFF_DAY = 5;

const getCycleStartMonthYear = (joinDateValue: string) => {
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

personRoutes.use("*", authMiddleware, roleMiddleware(["admin", "superadmin"]));

personRoutes.get("/", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const db = getDb(c.env);
    const search = c.req.query("search")?.trim();
    const status = c.req.query("status")?.trim();
    const roomId = c.req.query("roomId")?.trim();
    const { page, pageSize, offset } = parsePaginationParams(c.req.query("page"), c.req.query("pageSize"), {
      defaultPageSize: 20,
      maxPageSize: 100
    });

    if (status && status !== "active" && status !== "inactive") {
      return fail(c, "Invalid status filter", 400);
    }

    const statusFilter = status === "active" || status === "inactive" ? status : undefined;

    let whereClause = eq(persons.pgId, pgScope.scope.id);
    if (search) {
      const searchClause = or(ilike(persons.name, `%${search}%`), ilike(persons.phone, `%${search}%`));
      if (searchClause) {
        whereClause = and(whereClause, searchClause)!;
      }
    }
    if (statusFilter) {
      whereClause = and(whereClause, eq(persons.status, statusFilter))!;
    }
    if (roomId) {
      whereClause = and(whereClause, eq(persons.roomId, roomId))!;
    }

    const totalRows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(persons)
      .where(whereClause);
    const total = totalRows[0]?.value ?? 0;

    const result = db
      .select({
        id: persons.id,
        name: persons.name,
        phone: persons.phone,
        email: persons.email,
        aadhaarUrl: persons.aadhaarUrl,
        joinDate: persons.joinDate,
        paymentDay: sql<number>`${FIXED_PAYMENT_DAY}`,
        status: persons.status,
        pgId: persons.pgId,
        pgName: pgs.name,
        roomId: persons.roomId,
        roomNumber: rooms.roomNumber,
        rentAmount: rooms.rentAmount,
        createdAt: persons.createdAt
      })
      .from(persons)
      .leftJoin(rooms, eq(persons.roomId, rooms.id))
      .leftJoin(pgs, eq(persons.pgId, pgs.id))
      .where(whereClause);

    const statusSort = sql<number>`case when ${persons.status} = 'active' then 0 else 1 end`;
    const items = await result
      .orderBy(statusSort, desc(persons.createdAt))
      .limit(pageSize)
      .offset(offset);

    return ok(
      c,
      {
        items,
        pagination: buildPaginationMeta(total, page, pageSize)
      },
      "Persons fetched"
    );
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch persons", 500);
  }
});

personRoutes.get("/:id", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const personId = c.req.param("id");
    const db = getDb(c.env);

    const rows = await db
      .select({
        id: persons.id,
        name: persons.name,
        phone: persons.phone,
        email: persons.email,
        aadhaarUrl: persons.aadhaarUrl,
        roomId: persons.roomId,
        pgId: persons.pgId,
        pgName: pgs.name,
        roomNumber: rooms.roomNumber,
        floor: rooms.floor,
        capacity: rooms.capacity,
        rentAmount: rooms.rentAmount,
        joinDate: persons.joinDate,
        paymentDay: sql<number>`${FIXED_PAYMENT_DAY}`,
        status: persons.status,
        createdBy: persons.createdBy,
        createdAt: persons.createdAt
      })
      .from(persons)
      .leftJoin(rooms, eq(persons.roomId, rooms.id))
      .leftJoin(pgs, eq(persons.pgId, pgs.id))
      .where(and(eq(persons.id, personId), eq(persons.pgId, pgScope.scope.id)))
      .limit(1);

    if (!rows[0]) {
      return fail(c, "Person not found", 404);
    }

    return ok(c, rows[0], "Person fetched");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch person", 500);
  }
});

personRoutes.post("/", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const parsed = personCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return fail(c, "Invalid person payload", 400, parsed.error.flatten());
    }

    const db = getDb(c.env);
    const body = parsed.data;
    const paymentDay = FIXED_PAYMENT_DAY;

    const roomRows = await db
      .select({
        id: rooms.id,
        pgId: rooms.pgId,
        capacity: rooms.capacity,
        rentAmount: rooms.rentAmount
      })
      .from(rooms)
      .where(and(eq(rooms.id, body.roomId), eq(rooms.pgId, pgScope.scope.id)))
      .limit(1);
    const room = roomRows[0];
    if (!room) {
      return fail(c, "Room not found", 404);
    }

    const defaultPg = await ensureDefaultPg(c.env);
    const resolvedPgId = room.pgId || defaultPg?.id || pgScope.scope.id;

    const countRows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(persons)
      .where(and(eq(persons.roomId, body.roomId), eq(persons.status, "active"), eq(persons.pgId, pgScope.scope.id)));

    const activeCount = countRows[0]?.value ?? 0;
    if (activeCount >= room.capacity) {
      return fail(c, "Room is full", 400);
    }

    const user = c.get("user");
    const effectiveStatus = body.status ?? "active";
    const created = await db
      .insert(persons)
      .values({
        name: body.name,
        phone: body.phone,
        email: body.email || null,
        pgId: resolvedPgId,
        roomId: body.roomId,
        joinDate: body.joinDate,
        paymentDay,
        status: effectiveStatus,
        createdBy: user?.userId || ""
      })
      .returning();

    if (effectiveStatus === "active") {
      const cycle = getCycleStartMonthYear(body.joinDate);

      await db
        .insert(payments)
        .values({
          personId: created[0].id,
          pgId: resolvedPgId,
          month: cycle.month,
          year: cycle.year,
          amount: room.rentAmount,
          isPaid: false
        })
        .onConflictDoNothing({
          target: [payments.personId, payments.month, payments.year]
        });
    }

    await recalculateRoomStatus(c.env, body.roomId);

    return ok(c, created[0], "Person created", 201);
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to create person", 500);
  }
});

personRoutes.put("/:id", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const personId = c.req.param("id");
    const parsed = personUpdateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return fail(c, "Invalid update payload", 400, parsed.error.flatten());
    }
    const hasRoomIdField = Object.prototype.hasOwnProperty.call(parsed.data, "roomId");
    const normalizedRoomId = hasRoomIdField
      ? parsed.data.roomId === "" || parsed.data.roomId === null
        ? null
        : parsed.data.roomId
      : undefined;

    const db = getDb(c.env);
    const existingRows = await db
      .select()
      .from(persons)
      .where(and(eq(persons.id, personId), eq(persons.pgId, pgScope.scope.id)))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) {
      return fail(c, "Person not found", 404);
    }

    const requestedStatus = parsed.data.status ?? existing.status;
    const isInactivating = existing.status === "active" && requestedStatus === "inactive";
    const isReactivating = existing.status === "inactive" && requestedStatus === "active";

    if (isInactivating) {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const dueRows = await db
        .select({ month: payments.month, year: payments.year })
        .from(payments)
        .innerJoin(persons, eq(payments.personId, persons.id))
        .where(
          and(
            eq(payments.personId, personId),
            eq(payments.isPaid, false),
            eq(persons.status, "active"),
            or(
              sql`${payments.year} < ${currentYear}`,
              and(eq(payments.year, currentYear), sql`${payments.month} <= ${currentMonth}`)
            )
          )
        )
        .orderBy(asc(payments.year), asc(payments.month));

      if (dueRows.length > 0) {
        const dueLabels = dueRows.map((row) => `${String(row.month).padStart(2, "0")}/${row.year}`);
        return fail(c, `Cannot set inactive: dues pending for ${dueLabels.join(", ")}`, 400);
      }
    }

    const reactivationJoinDate = isReactivating ? new Date().toISOString().slice(0, 10) : undefined;
    const nextJoinDate = reactivationJoinDate ?? parsed.data.joinDate;

    if (typeof normalizedRoomId === "string" && normalizedRoomId !== existing.roomId) {
      const targetRoomRows = await db
        .select({ id: rooms.id, pgId: rooms.pgId, capacity: rooms.capacity })
        .from(rooms)
        .where(and(eq(rooms.id, normalizedRoomId), eq(rooms.pgId, pgScope.scope.id)))
        .limit(1);
      const targetRoom = targetRoomRows[0];

      if (!targetRoom) {
        return fail(c, "Target room not found", 404);
      }

      const countRows = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(persons)
        .where(and(eq(persons.roomId, normalizedRoomId), eq(persons.status, "active"), eq(persons.pgId, pgScope.scope.id)));

      if ((countRows[0]?.value ?? 0) >= targetRoom.capacity) {
        return fail(c, "Target room is full", 400);
      }
    }

    const defaultPg = await ensureDefaultPg(c.env);
    const nextPgId = typeof normalizedRoomId === "string"
      ? (
          await db
            .select({ pgId: rooms.pgId })
            .from(rooms)
            .where(and(eq(rooms.id, normalizedRoomId), eq(rooms.pgId, pgScope.scope.id)))
            .limit(1)
          )[0]?.pgId || defaultPg?.id || existing.pgId || pgScope.scope.id
      : existing.pgId;

    const updated = await db
      .update(persons)
      .set({
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email === "" ? null : parsed.data.email,
        pgId: nextPgId,
        roomId: normalizedRoomId,
        joinDate: nextJoinDate,
        paymentDay: nextJoinDate ? FIXED_PAYMENT_DAY : undefined,
        status: parsed.data.status
      })
      .where(and(eq(persons.id, personId), eq(persons.pgId, pgScope.scope.id)))
      .returning();

    if (!updated[0]) {
      return fail(c, "Person not found", 404);
    }

    const didJoinDateChange = typeof nextJoinDate === "string" && nextJoinDate !== existing.joinDate;

    if (parsed.data.joinDate && didJoinDateChange && !isReactivating) {
      const updatedCycle = getCycleStartMonthYear(updated[0].joinDate);

      await db
        .delete(payments)
        .where(
          and(
            eq(payments.personId, personId),
            eq(payments.isPaid, false)
          )
        );

      if (updated[0].status === "active") {
        const currentDate = new Date();
        const currentCycle = {
          month: currentDate.getMonth() + 1,
          year: currentDate.getFullYear()
        };
        const targetCycle = isBeforeMonthYear(currentCycle.month, currentCycle.year, updatedCycle.month, updatedCycle.year)
          ? updatedCycle
          : currentCycle;

        const roomRows = await db
          .select({
            rentAmount: rooms.rentAmount
          })
          .from(rooms)
          .where(and(eq(rooms.id, updated[0].roomId || existing.roomId || ""), eq(rooms.pgId, pgScope.scope.id)))
          .limit(1);
        const room = roomRows[0];

        if (room) {
          await db
            .insert(payments)
            .values({
              personId,
              pgId: nextPgId,
              month: targetCycle.month,
              year: targetCycle.year,
              amount: room.rentAmount,
              isPaid: false
            })
            .onConflictDoNothing({
              target: [payments.personId, payments.month, payments.year]
            });
        }
      }
    }

    if (isReactivating) {
      const updatedCycle = getCycleStartMonthYear(updated[0].joinDate);
      const currentDate = new Date();
      const currentCycle = {
        month: currentDate.getMonth() + 1,
        year: currentDate.getFullYear()
      };
      const targetCycle = isBeforeMonthYear(currentCycle.month, currentCycle.year, updatedCycle.month, updatedCycle.year)
        ? updatedCycle
        : currentCycle;

      const roomRows = await db
        .select({
          rentAmount: rooms.rentAmount
        })
        .from(rooms)
        .where(and(eq(rooms.id, updated[0].roomId || existing.roomId || ""), eq(rooms.pgId, pgScope.scope.id)))
        .limit(1);
      const room = roomRows[0];

      if (room) {
        await db
          .insert(payments)
          .values({
            personId,
            pgId: nextPgId,
            month: targetCycle.month,
            year: targetCycle.year,
            amount: room.rentAmount,
            isPaid: false
          })
          .onConflictDoNothing({
            target: [payments.personId, payments.month, payments.year]
          });
      }
    }

    if (existing.roomId) {
      await recalculateRoomStatus(c.env, existing.roomId);
    }
    if (updated[0].roomId && updated[0].roomId !== existing.roomId) {
      await recalculateRoomStatus(c.env, updated[0].roomId);
    }

    return ok(c, updated[0], "Person updated");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to update person", 500);
  }
});

personRoutes.delete("/:id", roleMiddleware(["superadmin"]), async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const personId = c.req.param("id");
    const db = getDb(c.env);

    const existingRows = await db
      .select()
      .from(persons)
      .where(and(eq(persons.id, personId), eq(persons.pgId, pgScope.scope.id)))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) {
      return fail(c, "Person not found", 404);
    }

    const paymentRows = await db
      .select({ receiptUrl: payments.receiptUrl })
      .from(payments)
      .where(eq(payments.personId, personId));

    const fileUrls = [
      existing.aadhaarUrl,
      ...paymentRows.map((row) => row.receiptUrl)
    ].filter((url): url is string => Boolean(url));

    if (fileUrls.length > 0) {
      await deleteFilesFromR2(c.env, fileUrls);
    }

    await db.delete(persons).where(and(eq(persons.id, personId), eq(persons.pgId, pgScope.scope.id)));

    if (existing.roomId) {
      await recalculateRoomStatus(c.env, existing.roomId);
    }

    return ok(c, { id: personId }, "Person deleted");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to delete person", 500);
  }
});

personRoutes.post("/:id/aadhaar", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const personId = c.req.param("id");
    const db = getDb(c.env);

    const personRows = await db
      .select({ id: persons.id, aadhaarUrl: persons.aadhaarUrl })
      .from(persons)
      .where(and(eq(persons.id, personId), eq(persons.pgId, pgScope.scope.id)))
      .limit(1);
    const person = personRows[0];

    if (!person) {
      return fail(c, "Person not found", 404);
    }

    if (person.aadhaarUrl) {
      return fail(c, "Aadhaar already uploaded", 400);
    }

    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      return fail(c, "Missing file field in multipart/form-data", 400);
    }

    const url = await uploadFileToR2(c.env, file, "aadhaar", personId);

    const updated = await db
      .update(persons)
      .set({ aadhaarUrl: url })
      .where(and(eq(persons.id, personId), eq(persons.pgId, pgScope.scope.id)))
      .returning({ id: persons.id, aadhaarUrl: persons.aadhaarUrl });

    return ok(c, updated[0], "Aadhaar uploaded");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to upload Aadhaar", 500);
  }
});

export default personRoutes;
