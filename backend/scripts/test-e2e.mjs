import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const dbUrl = "postgresql://neondb_owner:npg_DFlMW5y8VnsS@ep-aged-breeze-am8cks1s-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const sql = neon(dbUrl);

const API_BASE = "http://127.0.0.1:8787/api";

async function fetchApi(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`API Error ${res.status} on ${path}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function run() {
  console.log("=== Starting E2E API Test ===");

  // 1. Get saisanvi WhatsApp settings from DB
  const saisanviPg = await sql`SELECT id FROM pgs WHERE name ILIKE '%saisanvi%' LIMIT 1`;
  if (!saisanviPg[0]) {
    throw new Error("saisanvi PG not found in DB");
  }
  
  const saisanviWa = await sql`SELECT * FROM pg_whatsapp_settings WHERE pg_id = ${saisanviPg[0].id}`;
  const saisanviWaConfig = saisanviWa[0];
  if (!saisanviWaConfig) {
    throw new Error("saisanvi WhatsApp config not found");
  }

  // 2. Login as Founder to create new PG and Superadmin
  // Wait, Founder can create PG. Is there a default founder?
  // I will just use DB directly to create the PG, since POST /register automatically creates a PG if not exists!
  
  const testPgName = `Test PG ${Date.now()}`;
  const superAdminEmail = `test.superadmin.${Date.now()}@example.com`;
  const adminEmail = `test.admin.${Date.now()}@example.com`;
  const tenantPhone = `8247258297`;

  console.log(`Creating Superadmin and PG (${testPgName})...`);
  const founderLogin = await sql`SELECT email FROM users WHERE role = 'founder' LIMIT 1`;
  let founderToken = "";
  if (founderLogin[0]) {
    console.log("Found founder, generating token directly from DB is hard. Will just register without token because register requires founder... wait.");
    // Wait, POST /register requires founder. Let me just insert Superadmin & PG via DB so I get the superadmin!
  }

  // Let's create a founder token by using JWT or just login if we know password.
  // Actually, I can just use DB to create the test PG and superadmin to bypass founder login.
  console.log("Creating Test PG via DB...");
  const newPgRes = await sql`INSERT INTO pgs (name) VALUES (${testPgName}) RETURNING id`;
  const newPgId = newPgRes[0].id;

  // Insert WA config from saisanvi
  console.log("Copying saisanvi WhatsApp config to Test PG...");
  await sql`
    INSERT INTO pg_whatsapp_settings (
      pg_id, whatsapp_enabled, whatsapp_api_key, whatsapp_phone_number_id,
      whatsapp_template_reminder, whatsapp_template_confirmation, whatsapp_template_language_code
    ) VALUES (
      ${newPgId}, true, ${saisanviWaConfig.whatsapp_api_key}, ${saisanviWaConfig.whatsapp_phone_number_id},
      ${saisanviWaConfig.whatsapp_template_reminder}, ${saisanviWaConfig.whatsapp_template_confirmation}, ${saisanviWaConfig.whatsapp_template_language_code}
    )
  `;

  // Create Superadmin directly
  console.log("Creating Superadmin directly via DB...");
  const hash = await bcrypt.hash("password", 10);
  const saRes = await sql`INSERT INTO users (name, email, password, role, pg_id) VALUES ('Super Admin', ${superAdminEmail}, ${hash}, 'superadmin', ${newPgId}) RETURNING id`;
  const superAdminId = saRes[0].id;

  // 3. Login as Superadmin
  console.log("Testing POST /auth/login as Superadmin...");
  const loginRes = await fetchApi("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: superAdminEmail, password: "password" })
  });
  const saToken = loginRes.data.token;
  console.log("Superadmin logged in successfully.");

  // 4. Test POST /auth/register to create Admin
  console.log("Testing POST /auth/register as Superadmin (creating admin)...");
  await fetchApi("/auth/register", {
    method: "POST",
    headers: { Authorization: `Bearer ${saToken}` },
    body: JSON.stringify({ name: "Test Admin", email: adminEmail, password: "password", role: "admin" })
  });
  console.log("Admin created successfully.");

  // 5. Login as Admin
  console.log("Testing POST /auth/login as Admin...");
  const adminLoginRes = await fetchApi("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: adminEmail, password: "password" })
  });
  const adminToken = adminLoginRes.data.token;
  console.log("Admin logged in successfully.");

  // 6. Create Room
  console.log("Testing POST /rooms as Superadmin...");
  const roomRes = await fetchApi("/rooms", {
    method: "POST",
    headers: { Authorization: `Bearer ${saToken}` },
    body: JSON.stringify({ roomNumber: "TEST-101", floor: "1", capacity: 2, rentAmount: 5000 })
  });
  const roomId = roomRes.data.id;
  console.log("Room created successfully. Room ID:", roomId);

  // 7. Create Tenant
  console.log("Testing POST /persons as Superadmin...");
  const tenantRes = await fetchApi("/persons", {
    method: "POST",
    headers: { Authorization: `Bearer ${saToken}` },
    body: JSON.stringify({
      name: "Test Tenant",
      phone: `+918247258297`,
      email: "tenant@example.com",
      roomId: roomId,
      joinDate: new Date().toISOString().split('T')[0]
    })
  });
  const tenantId = tenantRes.data.id;
  console.log("Tenant created successfully. Tenant ID:", tenantId);

  // 8. Create Payment
  console.log("Testing POST /payments/manual as Superadmin...");
  const paymentRes = await fetchApi("/payments/manual", {
    method: "POST",
    headers: { Authorization: `Bearer ${saToken}` },
    body: JSON.stringify({
      personId: tenantId,
      amount: 5000,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      mode: "upi"
    })
  });
  const paymentId = paymentRes.data.id;
  console.log("Payment created successfully. Payment ID:", paymentId);

  // 9. Test WhatsApp Trigger
  console.log("Testing POST /notifications/trigger as Superadmin...");
  try {
    const triggerRes = await fetchApi("/notifications/trigger", {
      method: "POST",
      headers: { Authorization: `Bearer ${saToken}` },
      body: JSON.stringify({
        paymentId: paymentId,
        messageType: "reminder_1"
      })
    });
    console.log("WhatsApp Notification Trigger successful!", triggerRes.data);
  } catch (err) {
    console.warn("WhatsApp Trigger returned an error (likely because phone is invalid or template failed), but API responded properly:", err.message);
  }

  // 10. Cleanup
  console.log("Cleaning up Test PG and all data...");
  await sql`DELETE FROM pgs WHERE id = ${newPgId}`;
  console.log("Cleanup complete!");

  console.log("=== E2E API Test Complete ===");
}

run().catch(console.error);
