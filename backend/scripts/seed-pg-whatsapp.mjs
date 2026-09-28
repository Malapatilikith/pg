import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const readFromDevVars = (key) => {
  const filePath = resolve(process.cwd(), ".dev.vars");
  if (!existsSync(filePath)) {
    return "";
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith(`${key}=`)) {
      continue;
    }
    return trimmed.slice(`${key}=`.length).trim().replace(/^['"]|['"]$/g, "");
  }

  return "";
};

const resolveValue = (key) => {
  return process.env[key]?.trim() || readFromDevVars(key);
};

const required = (key) => {
  const value = resolveValue(key);
  if (!value) {
    throw new Error(`Missing required value: ${key}`);
  }
  return value;
};

const databaseUrl = required("DATABASE_URL");
const pgName = required("SEED_PG_NAME");
const reminderTemplate = required("WHATSAPP_TEMPLATE_REMINDER");
const confirmationTemplate = required("WHATSAPP_TEMPLATE_CONFIRMATION");
const apiKey = required("FAST2SMS_API_KEY");
const phoneNumberId = required("FAST2SMS_PHONE_NUMBER_ID");
const languageCode = resolveValue("FAST2SMS_TEMPLATE_LANGUAGE_CODE") || "en";

const sql = neon(databaseUrl);

const pgRows = await sql`
  select id, name
  from pgs
  where name = ${pgName}
  limit 1
`;

const pg = pgRows[0];
if (!pg) {
  throw new Error(`PG not found: ${pgName}`);
}

await sql`
  insert into pg_whatsapp_settings (
    pg_id,
    whatsapp_enabled,
    whatsapp_api_key,
    whatsapp_phone_number_id,
    whatsapp_template_reminder,
    whatsapp_template_confirmation,
    whatsapp_template_language_code,
    updated_at
  )
  values (
    ${pg.id},
    true,
    ${apiKey},
    ${phoneNumberId},
    ${reminderTemplate},
    ${confirmationTemplate},
    ${languageCode},
    now()
  )
  on conflict (pg_id)
  do update set
    whatsapp_enabled = excluded.whatsapp_enabled,
    whatsapp_api_key = excluded.whatsapp_api_key,
    whatsapp_phone_number_id = excluded.whatsapp_phone_number_id,
    whatsapp_template_reminder = excluded.whatsapp_template_reminder,
    whatsapp_template_confirmation = excluded.whatsapp_template_confirmation,
    whatsapp_template_language_code = excluded.whatsapp_template_language_code,
    updated_at = now()
`;

console.log(`WhatsApp settings seeded for PG: ${pg.name}`);
