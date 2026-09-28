const BASE_URL = (process.env.BACKEND_BASE_URL || "https://pg-management-backend.gowthamnachu545.workers.dev").replace(/\/$/, "");
const SUPERADMIN_EMAIL = process.env.SMOKE_SUPERADMIN_EMAIL || "sample@gmail.com";
const SUPERADMIN_PASSWORD = process.env.SMOKE_SUPERADMIN_PASSWORD || "sample";
const PG_NAME = process.env.SMOKE_PG_NAME || "sample";
const PG_ID = process.env.SMOKE_PG_ID || "";

const CURRENT_MONTH_CYCLE_CUTOFF_DAY = 5;

const now = new Date();
const todayDate = now.toISOString().slice(0, 10);
const suffix = `${Date.now()}`.slice(-6);
const roomNumber = `CHK-${suffix}`;
const floor = "CHK";
const phone = `+91${`${Date.now()}`.slice(-10)}`;
const email = `check.${Date.now()}@pg.local`;

const state = {
  token: "",
  roomId: "",
  personId: ""
};

const parseBody = async (response) => {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
};

const addPgName = (path) => {
  if (path.startsWith("/api/auth")) {
    return path;
  }
  if (!PG_ID || !PG_NAME) {
    throw new Error("Missing PG scope. Set SMOKE_PG_ID and SMOKE_PG_NAME.");
  }
  const connector = path.includes("?") ? "&" : "?";
  return `${path}${connector}pgId=${encodeURIComponent(PG_ID)}&pgName=${encodeURIComponent(PG_NAME)}`;
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

  const response = await fetch(`${BASE_URL}${addPgName(path)}`, { method, headers, body });
  const parsed = await parseBody(response);

  if (!expected.includes(response.status)) {
    throw new Error(
      `${name} failed: expected [${expected.join(", ")}], got ${response.status}. Response: ${parsed.text.slice(0, 400)}`
    );
  }

  if (response.status >= 500) {
    throw new Error(`${name} returned ${response.status}. Response: ${parsed.text.slice(0, 400)}`);
  }

  console.log(`[OK] ${response.status} ${method} ${path} :: ${name}`);
  return { status: response.status, body: parsed.json, text: parsed.text };
};

const getCycleStartMonthYear = (joinDateValue) => {
  const d = new Date(joinDateValue);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    return { month: fallback.getMonth() + 1, year: fallback.getFullYear() };
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

const isBeforeMonthYear = (month, year, refMonth, refYear) => {
  return year < refYear || (year === refYear && month < refMonth);
};

const run = async () => {
  try {
    const login = await request("login superadmin", "/api/auth/login", {
      method: "POST",
      json: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD },
      expected: [200]
    });

    state.token = login.body?.data?.token || "";
    if (!state.token) {
      throw new Error("Login succeeded but token missing");
    }

    const createdRoom = await request("rooms create", "/api/rooms", {
      method: "POST",
      token: state.token,
      json: {
        roomNumber,
        floor,
        capacity: 2,
        rentAmount: 6500,
        status: "available"
      },
      expected: [201]
    });
    state.roomId = createdRoom.body?.data?.id || "";
    if (!state.roomId) {
      throw new Error("Room created but id missing");
    }

    const createdPerson = await request("persons create", "/api/persons", {
      method: "POST",
      token: state.token,
      json: {
        name: "Status Check Tenant",
        phone,
        email,
        roomId: state.roomId,
        joinDate: todayDate,
        status: "active"
      },
      expected: [201]
    });
    state.personId = createdPerson.body?.data?.id || "";
    if (!state.personId) {
      throw new Error("Person created but id missing");
    }

    const paymentsInitial = await request("payments by person", `/api/payments/${state.personId}`, {
      token: state.token,
      expected: [200]
    });
    const unpaid = (paymentsInitial.body?.data || []).filter((p) => p.isPaid === false);
    if (unpaid.length === 0) {
      throw new Error("Expected at least one unpaid payment on creation");
    }

    const blockInactive = await request("persons inactivate with dues", `/api/persons/${state.personId}`, {
      method: "PUT",
      token: state.token,
      json: { status: "inactive" },
      expected: [400]
    });

    if (!String(blockInactive.text || "").includes("Cannot set inactive")) {
      throw new Error("Expected inactivation to be blocked with dues");
    }

    for (const payment of unpaid) {
      await request("payments mark paid", `/api/payments/${payment.id}/mark-paid`, {
        method: "PUT",
        token: state.token,
        expected: [200, 400]
      });
    }

    await request("persons inactivate", `/api/persons/${state.personId}`, {
      method: "PUT",
      token: state.token,
      json: { status: "inactive" },
      expected: [200]
    });

    const nextMonth = now.getMonth() + 2;
    const nextYear = nextMonth === 13 ? now.getFullYear() + 1 : now.getFullYear();
    const normalizedNextMonth = nextMonth === 13 ? 1 : nextMonth;

    await request("payments generate next month", "/api/payments/generate", {
      method: "POST",
      token: state.token,
      json: { month: normalizedNextMonth, year: nextYear },
      expected: [200]
    });

    const paymentsAfterInactive = await request("payments by person after inactive", `/api/payments/${state.personId}`, {
      token: state.token,
      expected: [200]
    });
    const nextCycleRow = (paymentsAfterInactive.body?.data || []).find(
      (p) => p.month === normalizedNextMonth && p.year === nextYear
    );
    if (nextCycleRow) {
      throw new Error("Inactive tenant should not have unpaid payment for upcoming cycle");
    }

    await request("persons reactivate", `/api/persons/${state.personId}`, {
      method: "PUT",
      token: state.token,
      json: { status: "active" },
      expected: [200]
    });

    const personAfterReactivate = await request("person after reactivate", `/api/persons/${state.personId}`, {
      token: state.token,
      expected: [200]
    });

    const joinDate = personAfterReactivate.body?.data?.joinDate;
    if (joinDate !== todayDate) {
      throw new Error(`Expected joinDate to reset to today (${todayDate}), got ${joinDate}`);
    }

    const startCycle = getCycleStartMonthYear(todayDate);
    const currentCycle = { month: now.getMonth() + 1, year: now.getFullYear() };
    const targetCycle = isBeforeMonthYear(currentCycle.month, currentCycle.year, startCycle.month, startCycle.year)
      ? startCycle
      : currentCycle;

    const paymentsAfterReactivate = await request("payments by person after reactivate", `/api/payments/${state.personId}`, {
      token: state.token,
      expected: [200]
    });
    const reactivationPayment = (paymentsAfterReactivate.body?.data || []).find(
      (p) => p.month === targetCycle.month && p.year === targetCycle.year
    );

    if (!reactivationPayment) {
      throw new Error(`Expected payment for cycle ${targetCycle.month}/${targetCycle.year} after reactivation`);
    }

    console.log("\nStatus change checks passed.");
  } finally {
    if (state.personId && state.token) {
      await request("cleanup delete person", `/api/persons/${state.personId}`, {
        method: "DELETE",
        token: state.token,
        expected: [200, 404]
      });
    }

    if (state.roomId && state.token) {
      await request("cleanup delete room", `/api/rooms/${state.roomId}`, {
        method: "DELETE",
        token: state.token,
        expected: [200, 400, 404]
      });
    }
  }
};

run().catch((error) => {
  console.error("Status change checks failed:", error.message);
  process.exit(1);
});
