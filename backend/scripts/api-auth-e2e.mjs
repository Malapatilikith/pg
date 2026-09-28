const BASE_URL = (process.env.BACKEND_BASE_URL || "https://pg-management-backend.gowthamnachu545.workers.dev").replace(/\/$/, "");
const SUPERADMIN_EMAIL = process.env.SMOKE_SUPERADMIN_EMAIL || "testsuperadmin@pg.local";
const SUPERADMIN_PASSWORD = process.env.SMOKE_SUPERADMIN_PASSWORD || "super123";

const now = new Date();
const roomSuffix = `${Date.now()}`.slice(-6);
const roomNumber = `SMK-${roomSuffix}`;
const floor = "SMK";
const phone = `+91${`${Date.now()}`.slice(-10)}`;
const email = `smoke.${Date.now()}@pg.local`;
const adminEmail = `admin.${Date.now()}@pg.local`;

const month = now.getMonth() + 1;
const year = now.getFullYear();

const state = {
  token: "",
  createdRoomId: "",
  createdPersonId: "",
  createdPaymentId: "",
  createdAdminId: ""
};

const parseBody = async (response) => {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
};

const request = async (name, path, { method = "GET", token, json, formData, expected = [200] } = {}) => {
  const headers = {};
  let body;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  if (formData) {
    body = formData;
  }

  const response = await fetch(`${BASE_URL}${path}`, { method, headers, body });
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
  return parsed.json;
};

const cleanup = async () => {
  if (state.createdPersonId && state.token) {
    try {
      await request("cleanup delete person", `/api/persons/${state.createdPersonId}`, {
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
      await request("cleanup delete room", `/api/rooms/${state.createdRoomId}`, {
        method: "DELETE",
        token: state.token,
        expected: [200, 400, 404]
      });
    } catch (error) {
      console.error("Cleanup room failed:", error.message);
    }
  }

  if (state.createdAdminId && state.token) {
    try {
      await request("cleanup delete admin", `/api/auth/admins/${state.createdAdminId}`, {
        method: "DELETE",
        token: state.token,
        expected: [200, 404]
      });
    } catch (error) {
      console.error("Cleanup admin failed:", error.message);
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

    state.token = login?.data?.token || "";
    if (!state.token) {
      throw new Error("Login succeeded but token missing");
    }

    await request("auth me", "/api/auth/me", { token: state.token, expected: [200] });

    const createdAdmin = await request("auth register admin", "/api/auth/register", {
      method: "POST",
      token: state.token,
      json: {
        name: "Smoke Admin",
        email: adminEmail,
        password: "admin123",
        role: "admin"
      },
      expected: [201]
    });
    state.createdAdminId = createdAdmin?.data?.id || "";

    await request("auth admins list", "/api/auth/admins", { token: state.token, expected: [200] });

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
    state.createdRoomId = createdRoom?.data?.id || "";

    if (!state.createdRoomId) {
      throw new Error("Room created but id missing");
    }

    await request("rooms list", "/api/rooms", { token: state.token, expected: [200] });
    await request("rooms available", "/api/rooms/available", { token: state.token, expected: [200] });

    await request("rooms update", `/api/rooms/${state.createdRoomId}`, {
      method: "PUT",
      token: state.token,
      json: { floor: `${floor}-UPD` },
      expected: [200]
    });

    const createdPerson = await request("persons create", "/api/persons", {
      method: "POST",
      token: state.token,
      json: {
        name: "Smoke Tenant",
        phone,
        email,
        roomId: state.createdRoomId,
        joinDate: `${year}-${String(month).padStart(2, "0")}-01`,
        status: "active"
      },
      expected: [201]
    });
    state.createdPersonId = createdPerson?.data?.id || "";

    if (!state.createdPersonId) {
      throw new Error("Person created but id missing");
    }

    await request("persons list", "/api/persons", { token: state.token, expected: [200] });
    await request("persons one", `/api/persons/${state.createdPersonId}`, { token: state.token, expected: [200] });

    await request("persons update", `/api/persons/${state.createdPersonId}`, {
      method: "PUT",
      token: state.token,
      json: { email: `upd.${email}` },
      expected: [200]
    });

    const aadhaarForm = new FormData();
    aadhaarForm.append("file", new Blob(["dummy aadhaar"], { type: "application/pdf" }), "aadhaar.pdf");
    await request("persons aadhaar upload", `/api/persons/${state.createdPersonId}/aadhaar`, {
      method: "POST",
      token: state.token,
      formData: aadhaarForm,
      expected: [200]
    });

    await request("payments list", "/api/payments", { token: state.token, expected: [200] });
    const personPayments = await request("payments by person", `/api/payments/${state.createdPersonId}`, {
      token: state.token,
      expected: [200]
    });

    await request("payments month list", `/api/payments/month/${month}/${year}`, {
      token: state.token,
      expected: [200]
    });

    await request("payments sync due cycle", "/api/payments/sync-due-cycle", {
      method: "POST",
      token: state.token,
      json: { asOf: `${year}-${String(month).padStart(2, "0")}-15` },
      expected: [200]
    });

    await request("payments manual upsert", "/api/payments/manual", {
      method: "POST",
      token: state.token,
      json: {
        personId: state.createdPersonId,
        month,
        year,
        amount: 6500,
        isPaid: false
      },
      expected: [200, 201]
    });

    const personPaymentsAfter = await request("payments by person after manual", `/api/payments/${state.createdPersonId}`, {
      token: state.token,
      expected: [200]
    });

    const paymentsArray = personPaymentsAfter?.data || personPayments?.data || [];
    const targetPayment = paymentsArray.find((p) => p.month === month && p.year === year) || paymentsArray[0];

    if (!targetPayment?.id) {
      throw new Error("No payment row found for receipt/mark-paid tests");
    }

    state.createdPaymentId = targetPayment.id;

    if (!targetPayment.isPaid) {
      await request("payments mark paid", `/api/payments/${targetPayment.id}/mark-paid`, {
        method: "PUT",
        token: state.token,
        expected: [200]
      });
    }

    const receiptForm = new FormData();
    receiptForm.append("file", new Blob(["dummy receipt"], { type: "application/pdf" }), "receipt.pdf");
    await request("payments receipt upload", `/api/payments/${targetPayment.id}/receipt`, {
      method: "POST",
      token: state.token,
      formData: receiptForm,
      expected: [200]
    });

    await request("notifications trigger", "/api/notifications/trigger", {
      method: "POST",
      token: state.token,
      json: {
        paymentId: targetPayment.id,
        messageType: "reminder_1"
      },
      expected: [200]
    });

    await request("notifications logs", "/api/notifications/logs", {
      token: state.token,
      expected: [200]
    });

    await request("notifications trigger-auto", "/api/notifications/trigger-auto", {
      method: "POST",
      token: state.token,
      json: {
        mode: "scheduled",
        month,
        year
      },
      expected: [200]
    });

    console.log("\nAuthenticated API e2e smoke test passed.");
  } finally {
    await cleanup();
  }
};

run().catch((error) => {
  console.error("Authenticated API e2e smoke test failed:", error.message);
  process.exit(1);
});
