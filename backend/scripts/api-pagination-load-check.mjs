const BASE_URL = (process.env.BACKEND_BASE_URL || "https://pg-management-backend.gowthamnachu545.workers.dev").replace(/\/$/, "");
const SUPERADMIN_EMAIL = process.env.SMOKE_SUPERADMIN_EMAIL || "testsuperadmin@pg.local";
const SUPERADMIN_PASSWORD = process.env.SMOKE_SUPERADMIN_PASSWORD || "super123";

const now = new Date();
const month = now.getMonth() + 1;
const year = now.getFullYear();

const uniqueSuffix = `${Date.now()}`;
const roomNumber = `PGT-${uniqueSuffix.slice(-6)}`;
const tenantName = `Pagination Tenant ${uniqueSuffix.slice(-6)}`;
const tenantPhone = `+91${uniqueSuffix.slice(-10)}`;
const tenantEmail = `pagination.${uniqueSuffix}@pg.local`;

const state = {
  token: "",
  createdRoomId: "",
  createdPersonId: ""
};

const parseBody = async (response) => {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
};

const request = async (name, path, { method = "GET", token, json, expected = [200] } = {}) => {
  const headers = {};
  let body;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  const start = Date.now();
  const response = await fetch(`${BASE_URL}${path}`, { method, headers, body });
  const elapsedMs = Date.now() - start;
  const parsed = await parseBody(response);

  if (!expected.includes(response.status)) {
    throw new Error(
      `${name} failed: expected [${expected.join(", ")}], got ${response.status}. Response: ${parsed.text.slice(0, 400)}`
    );
  }

  return {
    status: response.status,
    elapsedMs,
    json: parsed.json,
    text: parsed.text
  };
};

const assertPaginationContract = (name, body, expectedPage, expectedPageSize) => {
  if (!body?.data || typeof body.data !== "object") {
    throw new Error(`${name}: missing response data`);
  }

  const { items, pagination } = body.data;

  if (!Array.isArray(items)) {
    throw new Error(`${name}: data.items must be an array`);
  }

  if (!pagination || typeof pagination !== "object") {
    throw new Error(`${name}: missing data.pagination object`);
  }

  const requiredNumeric = ["page", "pageSize", "total", "totalPages"];
  for (const key of requiredNumeric) {
    if (typeof pagination[key] !== "number") {
      throw new Error(`${name}: pagination.${key} must be number`);
    }
  }

  if (typeof pagination.hasNext !== "boolean" || typeof pagination.hasPrev !== "boolean") {
    throw new Error(`${name}: pagination.hasNext/hasPrev must be boolean`);
  }

  if (pagination.page !== expectedPage) {
    throw new Error(`${name}: expected pagination.page=${expectedPage}, got ${pagination.page}`);
  }

  if (pagination.pageSize !== expectedPageSize) {
    throw new Error(`${name}: expected pagination.pageSize=${expectedPageSize}, got ${pagination.pageSize}`);
  }
};

const percentile95 = (values) => {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
};

const runLoadCheck = async ({ label, path, token, iterations = 12, maxP95Ms = 8000 }) => {
  const durations = [];

  for (let i = 0; i < iterations; i += 1) {
    const response = await request(`${label} #${i + 1}`, path, {
      token,
      expected: [200]
    });
    durations.push(response.elapsedMs);
  }

  const p95 = percentile95(durations);
  const avg = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);

  console.log(`[LOAD] ${label} avg=${avg}ms p95=${p95}ms iterations=${iterations}`);

  if (p95 > maxP95Ms) {
    throw new Error(`${label} p95 ${p95}ms exceeded threshold ${maxP95Ms}ms`);
  }
};

const cleanup = async () => {
  if (state.createdPersonId && state.token) {
    try {
      await request("cleanup person", `/api/persons/${state.createdPersonId}`, {
        method: "DELETE",
        token: state.token,
        expected: [200, 404]
      });
    } catch (error) {
      console.error("Cleanup person failed:", error.message);
    }
  }

  if (state.createdRoomId && state.token) {
    try {
      await request("cleanup room", `/api/rooms/${state.createdRoomId}`, {
        method: "DELETE",
        token: state.token,
        expected: [200, 400, 404]
      });
    } catch (error) {
      console.error("Cleanup room failed:", error.message);
    }
  }
};

const run = async () => {
  try {
    const login = await request("login superadmin", "/api/auth/login", {
      method: "POST",
      json: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD },
      expected: [200]
    });

    state.token = login.json?.data?.token || "";
    if (!state.token) {
      throw new Error("Login succeeded but token missing");
    }

    const createdRoom = await request("create room for pagination tests", "/api/rooms", {
      method: "POST",
      token: state.token,
      json: {
        roomNumber,
        floor: "PAG",
        capacity: 2,
        rentAmount: 7300,
        status: "available"
      },
      expected: [201]
    });

    state.createdRoomId = createdRoom.json?.data?.id || "";
    if (!state.createdRoomId) {
      throw new Error("Room created but id missing");
    }

    const createdPerson = await request("create person for search tests", "/api/persons", {
      method: "POST",
      token: state.token,
      json: {
        name: tenantName,
        phone: tenantPhone,
        email: tenantEmail,
        roomId: state.createdRoomId,
        joinDate: `${year}-${String(month).padStart(2, "0")}-01`,
        status: "active"
      },
      expected: [201]
    });

    state.createdPersonId = createdPerson.json?.data?.id || "";
    if (!state.createdPersonId) {
      throw new Error("Person created but id missing");
    }

    const checks = [
      { name: "persons pagination", path: `/api/persons?page=1&pageSize=5&search=${encodeURIComponent(tenantName)}` },
      { name: "rooms pagination", path: `/api/rooms?page=1&pageSize=5&search=${encodeURIComponent(roomNumber)}` },
      { name: "payments month pagination", path: `/api/payments/month/${month}/${year}?page=1&pageSize=5&status=all` },
      { name: "notifications logs pagination", path: "/api/notifications/logs?page=1&pageSize=5" },
      { name: "auth admins pagination", path: "/api/auth/admins?page=1&pageSize=5" }
    ];

    for (const check of checks) {
      const result = await request(check.name, check.path, { token: state.token, expected: [200] });
      assertPaginationContract(check.name, result.json, 1, 5);
      console.log(`[OK] ${check.name}`);
    }

    await runLoadCheck({
      label: "payments/month load check",
      path: `/api/payments/month/${month}/${year}?page=1&pageSize=20&status=all`,
      token: state.token,
      iterations: 12,
      maxP95Ms: 8000
    });

    await runLoadCheck({
      label: "persons search load check",
      path: `/api/persons?page=1&pageSize=20&search=${encodeURIComponent(tenantName)}`,
      token: state.token,
      iterations: 12,
      maxP95Ms: 8000
    });

    console.log("\nPagination and load-focused API checks passed.");
  } finally {
    await cleanup();
  }
};

run().catch((error) => {
  console.error("Pagination/load checks failed:", error.message);
  process.exit(1);
});
