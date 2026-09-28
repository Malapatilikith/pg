import { jwtVerify, SignJWT } from "jose";
import { createMiddleware } from "hono/factory";
import { fail, type AppVariables, type EnvBindings, type JwtPayload, type Role } from "../types";

const encoder = new TextEncoder();

const getSecret = (secret: string) => encoder.encode(secret);

export const signToken = async (payload: JwtPayload, secret: string) => {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret(secret));
};

export const verifyToken = async (token: string, secret: string): Promise<JwtPayload | null> => {
  try {
    const { payload } = await jwtVerify(token, getSecret(secret));
    if (
      typeof payload.userId === "string" &&
      typeof payload.email === "string" &&
      (payload.role === "admin" || payload.role === "superadmin" || payload.role === "founder")
    ) {
      return {
        ...payload,
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        pgId: typeof payload.pgId === "string" ? payload.pgId : undefined
      };
    }
    return null;
  } catch {
    return null;
  }
};

export const authMiddleware = createMiddleware<{ Bindings: EnvBindings; Variables: AppVariables }>(
  async (c, next) => {
    const authHeader = c.req.header("authorization") || c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return fail(c, "Unauthorized", 401);
    }

    const token = authHeader.slice(7).trim();
    const payload = await verifyToken(token, c.env.JWT_SECRET);

    if (!payload?.userId || !payload.role) {
      return fail(c, "Invalid or expired token", 401);
    }

    c.set("user", payload);
    await next();
  }
);

export const roleMiddleware = (roles: Role[]) => {
  return createMiddleware<{ Bindings: EnvBindings; Variables: AppVariables }>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      return fail(c, "Unauthorized", 401);
    }

    if (!roles.includes(user.role)) {
      return fail(c, "Forbidden", 403);
    }

    await next();
  });
};
