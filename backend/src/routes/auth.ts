import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { z } from "zod";
import { ensureDefaultPg, getDb, pgs, users } from "../db/schema";
import { authMiddleware, roleMiddleware, signToken } from "../middleware/auth";
import { fail, ok, type AppVariables, type EnvBindings } from "../types";
import { buildPaginationMeta, parsePaginationParams } from "../utils/pagination";

type AppEnv = { Bindings: EnvBindings; Variables: AppVariables };

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(6)
});

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  password: z.string().min(6),
  role: z.enum(["admin", "superadmin"]).default("admin"),
  pgId: z.string().uuid().optional(),
  pgName: z.string().trim().min(2).optional().or(z.literal(""))
});

const resetAdminPasswordSchema = z.object({
  password: z.string().min(6)
});

const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", async (c) => {
  try {
    const parsed = loginSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return fail(c, "Invalid login payload", 400, parsed.error.flatten());
    }

    const db = getDb(c.env);
    const userRows = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    const user = userRows[0];

    if (!user) {
      return fail(c, "Invalid credentials", 401);
    }

    const isMatch = await bcrypt.compare(parsed.data.password, user.password);
    if (!isMatch) {
      return fail(c, "Invalid credentials", 401);
    }

    let resolvedPgId = user.pgId || null;
    let resolvedPgName: string | null = null;

    if (resolvedPgId) {
      const pgRows = await db.select({ name: pgs.name }).from(pgs).where(eq(pgs.id, resolvedPgId)).limit(1);
      resolvedPgName = pgRows[0]?.name || null;
    } else if (user.role === "admin") {
      const defaultPg = await ensureDefaultPg(c.env);
      resolvedPgId = defaultPg?.id || null;
      resolvedPgName = defaultPg?.name || null;
    }

    const token = await signToken(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        pgId: resolvedPgId || undefined
      },
      c.env.JWT_SECRET
    );

    return ok(
      c,
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          pgId: resolvedPgId,
          pgName: resolvedPgName,
          createdAt: user.createdAt
        }
      },
      "Login successful"
    );
  } catch (error) {
    return fail(c, (error as Error).message || "Login failed", 500);
  }
});

authRoutes.post("/register", authMiddleware, roleMiddleware(["superadmin", "founder"]), async (c) => {
  try {
    const parsed = registerSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return fail(c, "Invalid registration payload", 400, parsed.error.flatten());
    }

    const db = getDb(c.env);
    const requester = c.get("user")!;
    let targetPgId = parsed.data.pgId || null;

    if (requester.role === "superadmin") {
      targetPgId = requester.pgId || null;
    } else if (parsed.data.pgName && parsed.data.pgName.trim()) {
      const pgName = parsed.data.pgName.trim();
      const existingPg = await db.select({ id: pgs.id }).from(pgs).where(eq(pgs.name, pgName)).limit(1);

      if (existingPg[0]) {
        targetPgId = existingPg[0].id;
      } else {
        const createdPg = await db.insert(pgs).values({ name: pgName }).returning({ id: pgs.id });
        targetPgId = createdPg[0]?.id || null;
      }
    }

    if (targetPgId) {
      const existingPg = await db.select({ id: pgs.id }).from(pgs).where(eq(pgs.id, targetPgId)).limit(1);
      if (!existingPg[0]) {
        return fail(c, "PG not found", 404);
      }
    } else if (parsed.data.role === "admin") {
      return fail(c, "PG is required for admin accounts", 400);
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (existing[0]) {
      return fail(c, "Email already exists", 409);
    }

    const hashedPassword = await bcrypt.hash(parsed.data.password, 10);

    const created = await db
      .insert(users)
      .values({
        name: parsed.data.name,
        email: parsed.data.email,
        password: hashedPassword,
        role: parsed.data.role,
        pgId: targetPgId
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        pgId: users.pgId,
        createdAt: users.createdAt
      });

    const createdUser = created[0];
    let createdPgName: string | null = null;
    if (createdUser?.pgId) {
      const pgRows = await db.select({ name: pgs.name }).from(pgs).where(eq(pgs.id, createdUser.pgId)).limit(1);
      createdPgName = pgRows[0]?.name || null;
    }

    return ok(c, { ...createdUser, pgName: createdPgName }, "Admin account created", 201);
  } catch (error) {
    return fail(c, (error as Error).message || "Registration failed", 500);
  }
});

authRoutes.get("/admins", authMiddleware, roleMiddleware(["superadmin", "founder"]), async (c) => {
  try {
    const requester = c.get("user")!;
    const search = c.req.query("search")?.trim();
    const role = c.req.query("role")?.trim();
    const pgIdQuery = c.req.query("pgId")?.trim();
    const { page, pageSize, offset } = parsePaginationParams(c.req.query("page"), c.req.query("pageSize"), {
      defaultPageSize: 10,
      maxPageSize: 50
    });

    if (role && role !== "admin" && role !== "superadmin") {
      return fail(c, "Invalid role filter", 400);
    }

    const roleFilter = role === "admin" || role === "superadmin" ? role : undefined;
    const conditions = [sql`1=1`];
    if (roleFilter) {
      conditions.push(eq(users.role, roleFilter));
    } else {
      conditions.push(or(eq(users.role, "admin"), eq(users.role, "superadmin"))!);
    }
    if (search) {
      const searchClause = or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`));
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    if (requester.role === "superadmin") {
      conditions.push(eq(users.pgId, requester.pgId!));
    } else if (requester.role === "founder" && pgIdQuery) {
      conditions.push(eq(users.pgId, pgIdQuery));
    }

    const db = getDb(c.env);
    const whereClause = and(...conditions);

    const totalRows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(users)
      .where(whereClause);
    const total = totalRows[0]?.value ?? 0;

    const items = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        pgId: users.pgId,
        pgName: pgs.name,
        createdAt: users.createdAt
      })
      .from(users)
      .leftJoin(pgs, eq(users.pgId, pgs.id))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset);

    return ok(
      c,
      {
        items,
        pagination: buildPaginationMeta(total, page, pageSize)
      },
      "Admins fetched"
    );
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch admins", 500);
  }
});

authRoutes.delete("/admins/:id", authMiddleware, roleMiddleware(["superadmin", "founder"]), async (c) => {
  try {
    const id = c.req.param("id");
    const requester = c.get("user")!;

    if (id === requester.userId) {
      return fail(c, "You cannot delete your own account", 400);
    }

    const db = getDb(c.env);
    
    if (requester.role === "superadmin") {
      const targetRows = await db.select({ pgId: users.pgId }).from(users).where(eq(users.id, id)).limit(1);
      if (!targetRows[0] || targetRows[0].pgId !== requester.pgId) {
        return fail(c, "Admin not found or access denied", 403);
      }
    }
    const deleted = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ id: users.id, email: users.email });

    if (!deleted[0]) {
      return fail(c, "Admin not found", 404);
    }

    return ok(c, deleted[0], "Admin deleted");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to delete admin", 500);
  }
});

authRoutes.put("/admins/:id/reset-password", authMiddleware, roleMiddleware(["superadmin", "founder"]), async (c) => {
  try {
    const id = c.req.param("id");
    const requester = c.get("user")!;
    const parsed = resetAdminPasswordSchema.safeParse(await c.req.json());

    if (!parsed.success) {
      return fail(c, "Invalid reset payload", 400, parsed.error.flatten());
    }

    if (id === requester.userId) {
      return fail(c, "Use your own profile flow to change your password", 400);
    }

    const db = getDb(c.env);
    const targetRows = await db
      .select({ id: users.id, role: users.role, email: users.email, pgId: users.pgId })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    const target = targetRows[0];
    if (!target) {
      return fail(c, "Admin not found", 404);
    }

    if (requester.role === "superadmin" && target.pgId !== requester.pgId) {
      return fail(c, "Access denied to this admin", 403);
    }

    if (target.role !== "admin") {
      return fail(c, "Only admin account passwords can be reset here", 400);
    }

    const hashedPassword = await bcrypt.hash(parsed.data.password, 10);

    const updated = await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, id))
      .returning({ id: users.id, email: users.email });

    if (!updated[0]) {
      return fail(c, "Admin not found", 404);
    }

    return ok(c, updated[0], "Admin password reset successful");
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to reset admin password", 500);
  }
});

authRoutes.get("/me", authMiddleware, async (c) => {
  try {
    const authUser = c.get("user");
    const db = getDb(c.env);
    const userRows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        pgId: users.pgId,
        pgName: pgs.name,
        pgLogoUrl: pgs.logoUrl,
        createdAt: users.createdAt
      })
      .from(users)
      .leftJoin(pgs, eq(users.pgId, pgs.id))
      .where(eq(users.id, authUser?.userId || ""))
      .limit(1);
    const user = userRows[0];

    if (!user) {
      return fail(c, "User not found", 404);
    }

    return ok(
      c,
      user,
      "Current user"
    );
  } catch (error) {
    return fail(c, (error as Error).message || "Failed to fetch current user", 500);
  }
});

export default authRoutes;
