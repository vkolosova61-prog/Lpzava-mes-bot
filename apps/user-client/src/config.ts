import { z } from "zod";
import { loadEnv } from "./env.js";

loadEnv();

export const authConfig = z
  .object({
    TELEGRAM_API_ID: z.coerce.number().int().positive("TELEGRAM_API_ID is required"),
    TELEGRAM_API_HASH: z.string().min(1, "TELEGRAM_API_HASH is required"),
    TELEGRAM_FORCE_SMS: z.coerce.boolean().default(false)
  })
  .parse(process.env);

const listenerSchema = z.object({
  TELEGRAM_API_ID: z.coerce.number().int().positive("TELEGRAM_API_ID is required"),
  TELEGRAM_API_HASH: z.string().min(1, "TELEGRAM_API_HASH is required"),
  TELEGRAM_SESSION: z.string().min(1, "TELEGRAM_SESSION is required. Run npm run auth first."),
  DUMP_CHANNEL_ID: z.coerce.number().int("DUMP_CHANNEL_ID must be an integer"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  S3_ENDPOINT: z.string().url("S3_ENDPOINT must be a valid URL"),
  S3_REGION: z.string().min(1, "S3_REGION is required"),
  S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID is required"),
  S3_SECRET_ACCESS_KEY: z.string().min(1, "S3_SECRET_ACCESS_KEY is required")
});

export type ListenerConfig = z.infer<typeof listenerSchema>;

export function getListenerConfig(): ListenerConfig {
  return listenerSchema.parse(process.env);
}
