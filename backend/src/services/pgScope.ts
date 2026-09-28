import { and, eq } from "drizzle-orm";
import { ensureDefaultPg, getDb, pgs } from "../db/schema";
import type { EnvBindings, JwtPayload } from "../types";

export interface PgScope {
  id: string;
  name: string;
}

export type PgScopeResult =
  | { scope: PgScope }
  | { error: string; status: number };

export const resolvePgScope = async (
  env: EnvBindings,
  user?: JwtPayload,
  pgIdInput?: string,
  pgNameInput?: string
): Promise<PgScopeResult> => {
  const db = getDb(env);
  const pgId = pgIdInput?.trim() || "";
  const pgName = pgNameInput?.trim() || "";

  if ((pgId && !pgName) || (!pgId && pgName)) {
    return { error: "Provide both pgId and pgName", status: 400 };
  }

  if (pgId && pgName) {
    const matchedPg = await db
      .select({ id: pgs.id, name: pgs.name })
      .from(pgs)
      .where(and(eq(pgs.id, pgId), eq(pgs.name, pgName)))
      .limit(1);

    if (!matchedPg[0]) {
      return { error: "PG id and name mismatch", status: 404 };
    }

    if (user?.pgId && user.pgId !== matchedPg[0].id) {
      return { error: "Forbidden PG scope", status: 403 };
    }

    return { scope: matchedPg[0] };
  }

  if (user?.pgId) {
    const userPg = await db
      .select({ id: pgs.id, name: pgs.name })
      .from(pgs)
      .where(eq(pgs.id, user.pgId))
      .limit(1);

    if (userPg[0]) {
      return { scope: userPg[0] };
    }

    // Do not silently fall back when token carries an explicit PG scope.
    return { error: "User PG scope not found", status: 403 };
  }

  if (user?.role === "superadmin") {
    return { error: "Provide pgId and pgName for superadmin scope", status: 400 };
  }

  const defaultPg = await ensureDefaultPg(env);
  if (!defaultPg) {
    return { error: "No PG scope found", status: 404 };
  }

  return { scope: defaultPg };
};
