import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, persons, pgs, rooms } from "../db/schema";
import { authMiddleware, roleMiddleware } from "../middleware/auth";
import { resolvePgScope } from "../services/pgScope";
import { fail, ok, type AppVariables, type EnvBindings } from "../types";
import { buildPaginationMeta, parsePaginationParams } from "../utils/pagination";

type AppEnv = { Bindings: EnvBindings; Variables: AppVariables };

const isRoomNumberConflictError = (error: unknown) => {
  const message = (error as Error)?.message || "";
  return (
    message.includes("duplicate key value")
    && (message.includes("room_number") || message.includes("rooms_pg_room_number_uidx") || message.includes("rooms_room_number_unique"))
  );
};

const roomCreateSchema = z.object({
  roomNumber: z.string().min(1),
  floor: z.string().min(1),
  capacity: z.number().int().min(1),
  rentAmount: z.number().positive(),
  status: z.enum(["available", "occupied"]).optional()
});

const roomUpdateSchema = roomCreateSchema.partial();

const roomRoutes = new Hono<AppEnv>();

roomRoutes.use("*", authMiddleware, roleMiddleware(["admin", "superadmin"]));

roomRoutes.get("/", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const db = getDb(c.env);
    const search = c.req.query("search")?.trim();
    const status = c.req.query("status")?.trim();
    const { page, pageSize, offset } = parsePaginationParams(c.req.query("page"), c.req.query("pageSize"), {
      defaultPageSize: 20,
      maxPageSize: 100
    });

    if (status && status !== "available" && status !== "occupied") {
      return fail(c, "Invalid status filter", 400);
    }

    const statusFilter = status === "available" || status === "occupied" ? status : undefined;

    let whereClause = eq(rooms.pgId, pgScope.scope.id);
    if (statusFilter) {
      whereClause = and(whereClause, eq(rooms.status, statusFilter))!;
    }
    if (search) {
      const searchClause = or(ilike(rooms.roomNumber, `%${search}%`), ilike(rooms.floor, `%${search}%`));
      if (searchClause) {
        whereClause = and(whereClause, searchClause)!;
      }
    }

    const totalRows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(rooms)
      .where(whereClause);
    const total = totalRows[0]?.value ?? 0;

    const availableRows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(rooms)
      .where(and(eq(rooms.pgId, pgScope.scope.id), eq(rooms.status, "available")));
    const available = availableRows[0]?.value ?? 0;

    const occupiedRows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(rooms)
      .where(and(eq(rooms.pgId, pgScope.scope.id), eq(rooms.status, "occupied")));
    const occupied = occupiedRows[0]?.value ?? 0;

    const items = await db
      .select({
        id: rooms.id,
        pgId: rooms.pgId,
        pgName: pgs.name,
        roomNumber: rooms.roomNumber,
        floor: rooms.floor,
        capacity: rooms.capacity,
        rentAmount: rooms.rentAmount,
        status: rooms.status,
        activeTenants: sql<number>`(
          select count(*)::int
          from persons p
          where p.room_id = ${rooms.id}
            and p.status = 'active'
            and p.pg_id = ${pgScope.scope.id}
        )`,
        createdAt: rooms.createdAt
      })
      .from(rooms)
      .leftJoin(pgs, eq(rooms.pgId, pgs.id))
      .where(whereClause)
      .orderBy(desc(rooms.createdAt))
      .limit(pageSize)
      .offset(offset);

    return ok(
      c,
      {
        items,
        pagination: buildPaginationMeta(total, page, pageSize),
        stats: { available, occupied }
      },
      "Rooms fetched"
    );
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch rooms", 500);
  }
});

roomRoutes.get("/available", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const db = getDb(c.env);
    const result = await db
      .select({
        id: rooms.id,
        pgId: rooms.pgId,
        pgName: pgs.name,
        roomNumber: rooms.roomNumber,
        floor: rooms.floor,
        capacity: rooms.capacity,
        rentAmount: rooms.rentAmount,
        status: rooms.status,
        createdAt: rooms.createdAt
      })
      .from(rooms)
      .leftJoin(pgs, eq(rooms.pgId, pgs.id))
      .where(and(eq(rooms.status, "available"), eq(rooms.pgId, pgScope.scope.id)));
    return ok(c, result, "Available rooms fetched");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch available rooms", 500);
  }
});

roomRoutes.post("/", roleMiddleware(["superadmin"]), async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const parsed = roomCreateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return fail(c, "Invalid room payload", 400, parsed.error.flatten());
    }

    const db = getDb(c.env);
    const nextPgId = pgScope.scope.id;
    const normalizedRoomNumber = parsed.data.roomNumber.trim();

    const existing = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.pgId, nextPgId), eq(rooms.roomNumber, normalizedRoomNumber)))
      .limit(1);

    if (existing[0]) {
      return fail(c, "Room number already exists in this PG", 409);
    }

    const created = await db
      .insert(rooms)
      .values({
        pgId: nextPgId,
        roomNumber: normalizedRoomNumber,
        floor: parsed.data.floor,
        capacity: parsed.data.capacity,
        rentAmount: parsed.data.rentAmount.toFixed(2),
        status: parsed.data.status ?? "available"
      })
      .returning();

    return ok(c, created[0], "Room created", 201);
  } catch (error) {
    if (isRoomNumberConflictError(error)) {
      return fail(c, "Room number already exists in this PG", 409);
    }
    return fail(c, (error as Error).message || "Failed to create room", 500);
  }
});

roomRoutes.put("/:id", async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const roomId = c.req.param("id");
    const parsed = roomUpdateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return fail(c, "Invalid update payload", 400, parsed.error.flatten());
    }

    const db = getDb(c.env);
    const currentRows = await db
      .select({ id: rooms.id, roomNumber: rooms.roomNumber })
      .from(rooms)
      .where(and(eq(rooms.id, roomId), eq(rooms.pgId, pgScope.scope.id)))
      .limit(1);

    const current = currentRows[0];
    if (!current) {
      return fail(c, "Room not found", 404);
    }

    const payload = parsed.data;
    const normalizedRoomNumber = payload.roomNumber?.trim();

    if (normalizedRoomNumber && normalizedRoomNumber !== current.roomNumber) {
      const duplicate = await db
        .select({ id: rooms.id })
        .from(rooms)
        .where(and(eq(rooms.pgId, pgScope.scope.id), eq(rooms.roomNumber, normalizedRoomNumber)))
        .limit(1);

      if (duplicate[0]) {
        return fail(c, "Room number already exists in this PG", 409);
      }
    }

    const updated = await db
      .update(rooms)
      .set({
        roomNumber: normalizedRoomNumber,
        floor: payload.floor,
        capacity: payload.capacity,
        rentAmount: payload.rentAmount !== undefined ? payload.rentAmount.toFixed(2) : undefined,
        status: payload.status
      })
      .where(and(eq(rooms.id, roomId), eq(rooms.pgId, pgScope.scope.id)))
      .returning();

    if (!updated[0]) {
      return fail(c, "Room not found", 404);
    }

    return ok(c, updated[0], "Room updated");
  } catch (error) {
    if (isRoomNumberConflictError(error)) {
      return fail(c, "Room number already exists in this PG", 409);
    }
    return fail(c, (error as Error).message || "Failed to update room", 500);
  }
});

roomRoutes.delete("/:id", roleMiddleware(["superadmin"]), async (c) => {
  try {
    const pgScope = await resolvePgScope(c.env, c.get("user"), c.req.query("pgId"), c.req.query("pgName"));
    if ("error" in pgScope) {
      return fail(c, pgScope.error, pgScope.status);
    }

    const roomId = c.req.param("id");
    const db = getDb(c.env);

    const activeCountRows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(persons)
      .where(and(eq(persons.roomId, roomId), eq(persons.status, "active"), eq(persons.pgId, pgScope.scope.id)));

    if ((activeCountRows[0]?.value ?? 0) > 0) {
      return fail(c, "Cannot delete room with active tenants", 400);
    }

    const deleted = await db
      .delete(rooms)
      .where(and(eq(rooms.id, roomId), eq(rooms.pgId, pgScope.scope.id)))
      .returning({ id: rooms.id });
    if (!deleted[0]) {
      return fail(c, "Room not found", 404);
    }

    return ok(c, deleted[0], "Room deleted");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to delete room", 500);
  }
});

export default roomRoutes;
