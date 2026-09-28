import { Hono } from "hono";
import { cors } from "hono/cors";
import authRoutes from "./routes/auth";
import notificationRoutes from "./routes/notifications";
import paymentRoutes from "./routes/payments";
import personRoutes from "./routes/persons";
import pgRoutes from "./routes/pgs";
import roomRoutes from "./routes/rooms";
import { runCronJobs } from "./services/cron";
import { fail, ok, type AppVariables, type EnvBindings } from "./types";

type AppEnv = { Bindings: EnvBindings; Variables: AppVariables };

const app = new Hono<AppEnv>();

app.use("/api/*", async (c, next) => {
  const configuredOrigin = c.env.FRONTEND_ORIGIN || "https://pg-management-frontend-bhz.pages.dev";

  const resolveCorsOrigin = (requestOrigin?: string) => {
    if (!requestOrigin) {
      return configuredOrigin;
    }

    if (requestOrigin === configuredOrigin) {
      return requestOrigin;
    }

    if (/^https:\/\/[a-z0-9-]+\.pg-management-frontend-bhz\.pages\.dev$/i.test(requestOrigin)) {
      return requestOrigin;
    }

    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin)) {
      return requestOrigin;
    }

    return configuredOrigin;
  };

  return cors({
    origin: resolveCorsOrigin,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600
  })(c, next);
});

app.get("/", (c) => ok(c, { service: "PG Management API" }, "API running"));
app.get("/api/health", (c) => ok(c, { status: "healthy" }, "Health check success"));

app.route("/api/auth", authRoutes);
app.route("/api/pgs", pgRoutes);
app.route("/api/rooms", roomRoutes);
app.route("/api/persons", personRoutes);
app.route("/api/payments", paymentRoutes);
app.route("/api/notifications", notificationRoutes);

app.notFound((c) => fail(c, "Route not found", 404));

app.onError((error, c) => {
  console.error("Unhandled error", error);
  return fail(c, "Internal server error", 500);
});

export default {
  fetch: app.fetch,
  scheduled: async (
    event: ScheduledEvent,
    env: EnvBindings,
    ctx: ExecutionContext
  ): Promise<void> => {
    ctx.waitUntil(
      runCronJobs(env, new Date(event.scheduledTime)).catch((error) => {
        console.error("Scheduled cron execution failed", {
          scheduledTime: event.scheduledTime,
          error: (error as Error).message
        });
      })
    );
  }
};
