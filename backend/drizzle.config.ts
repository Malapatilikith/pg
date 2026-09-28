import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const resolveDatabaseUrl = () => {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  const candidateFiles = [".dev.vars", ".env"];

  for (const fileName of candidateFiles) {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith("DATABASE_URL=")) {
        continue;
      }

      return trimmed.slice("DATABASE_URL=".length).trim();
    }
  }

  return "";
};

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDatabaseUrl()
  }
});
