import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = neon(dbUrl);

const pgName = process.env.SEED_PG_NAME?.trim();
const adminUsersRaw = process.env.SEED_ADMIN_USERS?.trim();

if (!pgName || !adminUsersRaw) {
  throw new Error("SEED_PG_NAME and SEED_ADMIN_USERS are required");
}

let ADMIN_USERS = [];
try {
  ADMIN_USERS = JSON.parse(adminUsersRaw);
} catch {
  throw new Error("SEED_ADMIN_USERS must be valid JSON");
}

if (!Array.isArray(ADMIN_USERS) || ADMIN_USERS.length === 0) {
  throw new Error("SEED_ADMIN_USERS must be a non-empty array");
}

const pgRows = await sql`
  INSERT INTO pgs (name)
  VALUES (${pgName})
  ON CONFLICT (name)
  DO UPDATE SET name = EXCLUDED.name
  RETURNING id, name
`;

const pg = pgRows[0];

for (const adminUser of ADMIN_USERS) {
  const hashedPassword = await bcrypt.hash(adminUser.password, 10);

  await sql`
    INSERT INTO users (name, email, password, role, pg_id)
    VALUES (${adminUser.name}, ${adminUser.email}, ${hashedPassword}, 'superadmin', ${pg.id})
    ON CONFLICT (email)
    DO UPDATE SET
      name = EXCLUDED.name,
      password = EXCLUDED.password,
      role = EXCLUDED.role,
      pg_id = EXCLUDED.pg_id
  `;
}

const emails = ADMIN_USERS.map((entry) => entry.email);

const users = await sql`
  SELECT name, email, role, created_at
  FROM users
  WHERE email = ANY(${emails})
  ORDER BY email
`;

console.log(`Seeded PG: ${pg.name}`);
console.log("Seeded superadmin users:");
console.table(users);
