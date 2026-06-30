import { Pool, types } from "pg";
import { config } from "./config.js";

types.setTypeParser(types.builtins.INT8, (value) => Number(value));

export const db = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined
});

export async function getMessageLimit(): Promise<number> {
  const { rows } = await db.query<{ message_limit: number }>(
    'select message_limit from public."Settings" where id = 1'
  );

  const settings = rows[0];

  if (!settings) {
    throw new Error("Settings row is missing");
  }

  return settings.message_limit;
}

export async function setMessageLimit(messageLimit: number): Promise<number> {
  const { rows } = await db.query<{ message_limit: number }>(
    'update public."Settings" set message_limit = $1 where id = 1 returning message_limit',
    [messageLimit]
  );

  const settings = rows[0];

  if (!settings) {
    throw new Error("Settings row is missing");
  }

  return settings.message_limit;
}
