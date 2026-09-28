import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const resolveDatabaseUrl = () => {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  const files = [".dev.vars", ".env"];
  for (const fileName of files) {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith("DATABASE_URL=")) continue;
      const rawValue = trimmed.slice("DATABASE_URL=".length).trim();
      return rawValue.replace(/^['\"]|['\"]$/g, "");
    }
  }

  return "";
};

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  throw new Error("DATABASE_URL not found in env or .dev.vars/.env");
}

const sql = neon(databaseUrl);

const duplicates = await sql`
  select pg_id::text as pg_id, room_number, count(*)::int as count
  from rooms
  group by pg_id, room_number
  having count(*) > 1
`;

if (duplicates.length > 0) {
  console.error("Duplicate room_number entries found within same pg_id. Resolve these first:");
  for (const row of duplicates) {
    console.error(`pg_id=${row.pg_id ?? "null"}, room_number=${row.room_number}, count=${row.count}`);
  }
  process.exit(1);
}

await sql`alter table rooms drop constraint if exists rooms_room_number_unique`;
await sql`drop index if exists rooms_room_number_unique`;
await sql`create unique index if not exists rooms_pg_room_number_uidx on rooms (pg_id, room_number)`;

console.log("rooms unique constraint migrated to (pg_id, room_number)");
