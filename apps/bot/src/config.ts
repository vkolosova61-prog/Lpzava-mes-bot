import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const envResult = dotenv.config({ path: resolve(projectRoot, ".env") });

if (envResult.error) {
  dotenv.config({ path: resolve(projectRoot, ".env.example") });
}

const rawEnv = {
  ...process.env,
  API_PORT: process.env.PORT ?? process.env.API_PORT
};

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  DUMP_CHANNEL_ID: z.coerce.number().int("DUMP_CHANNEL_ID must be an integer"),
  BOT_POLLING_ENABLED: z.coerce.boolean().default(true),
  API_PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  S3_ENDPOINT: z.string().url("S3_ENDPOINT must be a valid URL"),
  S3_REGION: z.string().min(1, "S3_REGION is required"),
  S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID is required"),
  S3_SECRET_ACCESS_KEY: z.string().min(1, "S3_SECRET_ACCESS_KEY is required"),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true)
});

export const config = envSchema.parse(rawEnv);
