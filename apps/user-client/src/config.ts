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
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: z.coerce.boolean().default(false)
});

export type ListenerConfig = z.infer<typeof listenerSchema>;

export function getListenerConfig(): ListenerConfig {
  return listenerSchema.parse(process.env);
}
