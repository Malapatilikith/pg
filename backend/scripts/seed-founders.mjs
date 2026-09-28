import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const requiredEnv = [
  "DATABASE_URL",
  "NEW_PG_NAME",
  "FOUNDER1_EMAIL",
  "FOUNDER1_PASSWORD",
  "FOUNDER2_EMAIL",
  "FOUNDER2_PASSWORD"
];

for (const key of requiredEnv) {
  if (!process.env[key]?.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const dbUrl = process.env.DATABASE_URL;
const newPgName = process.env.NEW_PG_NAME.trim();
const founderAccounts = [
  {
    name: process.env.FOUNDER1_EMAIL.split("@")[0],
    email: process.env.FOUNDER1_EMAIL.trim().toLowerCase(),
    password: process.env.FOUNDER1_PASSWORD
  },
  {
    name: process.env.FOUNDER2_EMAIL.split("@")[0],
    email: process.env.FOUNDER2_EMAIL.trim().toLowerCase(),
    password: process.env.FOUNDER2_PASSWORD
  }
];

const sql = neon(dbUrl);

const pgRows = await sql`
  INSERT INTO pgs (name)
  VALUES (${newPgName})
  ON CONFLICT (name)
  DO UPDATE SET name = EXCLUDED.name
  RETURNING id, name
`;

const pg = pgRows[0];
if (!pg) {
  throw new Error("Failed to upsert PG");
}

await sql`
  INSERT INTO pg_whatsapp_settings (
    pg_id,
    whatsapp_enabled,
    whatsapp_api_key,
    whatsapp_phone_number_id,
    whatsapp_template_reminder,
    whatsapp_template_confirmation,
    whatsapp_template_language_code,
    updated_at
  )
  VALUES (
    ${pg.id},
    false,
    NULL,
    NULL,
    NULL,
    NULL,
    'en',
    now()
  )
  ON CONFLICT (pg_id)
  DO UPDATE SET
    whatsapp_enabled = EXCLUDED.whatsapp_enabled,
    whatsapp_api_key = EXCLUDED.whatsapp_api_key,
    whatsapp_phone_number_id = EXCLUDED.whatsapp_phone_number_id,
    whatsapp_template_reminder = EXCLUDED.whatsapp_template_reminder,
    whatsapp_template_confirmation = EXCLUDED.whatsapp_template_confirmation,
    whatsapp_template_language_code = EXCLUDED.whatsapp_template_language_code,
    updated_at = now()
`;

for (const founder of founderAccounts) {
  const hashedPassword = await bcrypt.hash(founder.password, 10);
  await sql`
    INSERT INTO users (name, email, password, role, pg_id)
    VALUES (${founder.name}, ${founder.email}, ${hashedPassword}, 'superadmin', NULL)
    ON CONFLICT (email)
    DO UPDATE SET
      name = EXCLUDED.name,
      password = EXCLUDED.password,
      role = EXCLUDED.role,
      pg_id = NULL
  `;
}

console.log(`Seeded PG: ${pg.name}`);
console.log("Seeded founder accounts:");
console.table(founderAccounts.map(({ name, email }) => ({ name, email, role: "superadmin" })));
