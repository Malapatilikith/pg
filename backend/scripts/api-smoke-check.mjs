const BASE_URL = (process.env.BACKEND_BASE_URL || "https://pg-management-backend.gowthamnachu545.workers.dev").replace(/\/$/, "");

const randomId = "11111111-1111-1111-1111-111111111111";

const checks = [
  { name: "auth login", method: "POST", path: "/api/auth/login", body: { email: "noone@example.com", password: "invalid123" } },
  { name: "auth register", method: "POST", path: "/api/auth/register", body: { name: "x", email: "x@example.com", password: "123456", role: "admin" } },
  { name: "auth me", method: "GET", path: "/api/auth/me" },
  { name: "auth admins", method: "GET", path: "/api/auth/admins" },
  { name: "auth admin delete", method: "DELETE", path: `/api/auth/admins/${randomId}` },

  { name: "rooms list", method: "GET", path: "/api/rooms" },
  { name: "rooms available", method: "GET", path: "/api/rooms/available" },
  { name: "rooms create", method: "POST", path: "/api/rooms", body: { roomNumber: "SMOKE-1", floor: "1", capacity: 1, rentAmount: 5000 } },
  { name: "rooms update", method: "PUT", path: `/api/rooms/${randomId}`, body: { floor: "2" } },
  { name: "rooms delete", method: "DELETE", path: `/api/rooms/${randomId}` },

  { name: "persons list", method: "GET", path: "/api/persons" },
  { name: "persons create", method: "POST", path: "/api/persons", body: { name: "Smoke", phone: "+911234567890", roomId: randomId, joinDate: "2026-04-01", status: "active" } },
  { name: "persons one", method: "GET", path: `/api/persons/${randomId}` },
  { name: "persons update", method: "PUT", path: `/api/persons/${randomId}`, body: { name: "Updated" } },
  { name: "persons delete", method: "DELETE", path: `/api/persons/${randomId}` },
  { name: "persons aadhaar", method: "POST", path: `/api/persons/${randomId}/aadhaar`, body: {} },

  { name: "payments list", method: "GET", path: "/api/payments" },
  { name: "payments month", method: "GET", path: "/api/payments/month/4/2026" },
  { name: "payments by person", method: "GET", path: `/api/payments/${randomId}` },
  { name: "payments generate", method: "POST", path: "/api/payments/generate", body: { month: 4, year: 2026 } },
  { name: "payments sync due cycle", method: "POST", path: "/api/payments/sync-due-cycle", body: { asOf: "2026-04-23" } },
  { name: "payments manual", method: "POST", path: "/api/payments/manual", body: { personId: randomId, month: 4, year: 2026, amount: 5000, isPaid: false } },
  { name: "payments mark paid", method: "PUT", path: `/api/payments/${randomId}/mark-paid` },
  { name: "payments receipt", method: "POST", path: `/api/payments/${randomId}/receipt`, body: {} },

  { name: "notifications logs", method: "GET", path: "/api/notifications/logs" },
  { name: "notifications trigger", method: "POST", path: "/api/notifications/trigger", body: { paymentId: randomId, messageType: "reminder_1" } },
  { name: "notifications trigger-auto", method: "POST", path: "/api/notifications/trigger-auto", body: { mode: "scheduled", month: 4, year: 2026 } }
];

const run = async () => {
  const results = [];

  for (const check of checks) {
    const headers = {};
    let body;

    if (check.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(check.body);
    }

    const response = await fetch(`${BASE_URL}${check.path}`, {
      method: check.method,
      headers,
      body
    });

    let payloadText = "";
    try {
      payloadText = await response.text();
    } catch {
      payloadText = "";
    }

    results.push({
      name: check.name,
      method: check.method,
      path: check.path,
      status: response.status,
      ok: response.status < 500,
      sample: payloadText.slice(0, 140).replace(/\s+/g, " ").trim()
    });
  }

  const failed = results.filter((r) => !r.ok);

  console.log(`Base URL: ${BASE_URL}`);
  for (const r of results) {
    console.log(`[${r.ok ? "OK" : "ERR"}] ${r.status} ${r.method} ${r.path} :: ${r.name}`);
    if (!r.ok) {
      console.log(`  sample: ${r.sample}`);
    }
  }

  if (failed.length > 0) {
    console.error(`\nSmoke check FAILED: ${failed.length} endpoint(s) returned 5xx.`);
    process.exit(1);
  }

  console.log("\nSmoke check passed: no 5xx responses across tested routes.");
};

run().catch((error) => {
  console.error("Smoke check crashed:", error);
  process.exit(1);
});
