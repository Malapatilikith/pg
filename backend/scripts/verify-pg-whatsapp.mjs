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

const databaseUrl = process.env.DATABASE_URL?.trim() || readFromDevVars("DATABASE_URL");
if (!databaseUrl) {
  throw new Error("DATABASE_URL not found in env or .dev.vars");
}

const sql = neon(databaseUrl);

const columns = await sql(
  "select column_name, data_type, is_nullable from information_schema.columns where table_name = 'pg_whatsapp_settings' order by ordinal_position"
);
const pgs = await sql("select id, name from pgs order by created_at");
const settings = await sql(
  "select p.name, s.whatsapp_enabled, s.whatsapp_phone_number_id, s.whatsapp_template_reminder, s.whatsapp_template_confirmation, s.whatsapp_template_language_code from pgs p left join pg_whatsapp_settings s on s.pg_id = p.id order by p.created_at"
);

console.log("Columns:");
console.table(columns);
console.log("PGs:");
console.table(pgs);
console.log("Settings:");
console.table(settings);
