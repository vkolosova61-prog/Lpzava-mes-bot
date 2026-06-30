import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.js";
import { db, getMessageLimit, setMessageLimit } from "./db.js";
import { verifyTelegramInitData } from "./telegramAuth.js";
import { resolveVipInput } from "./vip.js";

let mediaBucket: S3Client | null = null;

export function startApiServer(): void {
  const app = express();

  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "nastya-mes API",
      health: "/health"
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", requireTelegramAuth);

  app.get("/api/chats", async (req, res, next) => {
    try {
      const query = String(req.query.q ?? "").trim().toLowerCase();
      const { rows } = await db.query('select * from public."Chat_List" order by last_message_at desc');

      const chats = query
        ? rows.filter((chat) =>
            [
              chat.display_name,
              chat.username,
              String(chat.user_id),
              chat.last_message_preview
            ]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(query))
          )
        : rows;

      chats.sort((left, right) => {
        if (left.is_pinned && !right.is_pinned) {
          return -1;
        }

        if (!left.is_pinned && right.is_pinned) {
          return 1;
        }

        return (
          new Date(right.last_message_at).getTime() -
          new Date(left.last_message_at).getTime()
        );
      });

      res.json({ chats });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/chats/:userId/messages", async (req, res, next) => {
    try {
      const userId = Number(req.params.userId);

      if (!Number.isSafeInteger(userId)) {
        res.status(400).json({ error: "Invalid userId" });
        return;
      }

      const { rows } = await db.query(
        `select id, user_id, chat_id, sender, text, media_file_id, media_type,
          media_storage_path, media_mime_type, media_size, timestamp
        from public."Messages"
        where user_id = $1
        order by timestamp asc, id asc`,
        [userId]
      );

      const messages = await Promise.all(
        rows.map(async (message) => ({
          ...message,
          media_url: message.media_storage_path
            ? await createMediaSignedUrl(message.media_storage_path)
            : null
        }))
      );

      res.json({ messages });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/chats/:userId/favorite", async (req, res, next) => {
    try {
      const userId = Number(req.params.userId);

      if (!Number.isSafeInteger(userId)) {
        res.status(400).json({ error: "Invalid userId" });
        return;
      }

      await db.query(
        'insert into public."VIP_Users" (telegram_id) values ($1) on conflict (telegram_id) do nothing',
        [userId]
      );

      res.json({ telegramId: userId, isFavorite: true });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/chats/:userId/favorite", async (req, res, next) => {
    try {
      const userId = Number(req.params.userId);

      if (!Number.isSafeInteger(userId)) {
        res.status(400).json({ error: "Invalid userId" });
        return;
      }

      await db.query('delete from public."VIP_Users" where telegram_id = $1', [userId]);

      res.json({ telegramId: userId, isFavorite: false });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/chats/:userId/pin", async (req, res, next) => {
    try {
      const userId = Number(req.params.userId);

      if (!Number.isSafeInteger(userId)) {
        res.status(400).json({ error: "Invalid userId" });
        return;
      }

      await db.query(
        'insert into public."Pinned_Chats" (telegram_id) values ($1) on conflict (telegram_id) do nothing',
        [userId]
      );

      res.json({ telegramId: userId, isPinned: true });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/chats/:userId/pin", async (req, res, next) => {
    try {
      const userId = Number(req.params.userId);

      if (!Number.isSafeInteger(userId)) {
        res.status(400).json({ error: "Invalid userId" });
        return;
      }

      await db.query('delete from public."Pinned_Chats" where telegram_id = $1', [userId]);

      res.json({ telegramId: userId, isPinned: false });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/settings", async (_req, res, next) => {
    try {
      const messageLimit = await getMessageLimit();
      res.json({ messageLimit });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/settings", async (req, res, next) => {
    try {
      const messageLimit = Number(req.body.messageLimit);

      if (![10, 15, 20, 25, 30].includes(messageLimit)) {
        res.status(400).json({ error: "messageLimit must be 10, 15, 20, 25, or 30" });
        return;
      }

      const updatedLimit = await setMessageLimit(messageLimit);
      res.json({ messageLimit: updatedLimit });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/vip", async (req, res, next) => {
    try {
      const input = String(req.body.input ?? "");
      const resolved = await resolveVipInput(input);

      if ("error" in resolved) {
        res.status(400).json({ error: resolved.error });
        return;
      }

      await db.query(
        'insert into public."VIP_Users" (telegram_id) values ($1) on conflict (telegram_id) do nothing',
        [resolved.telegramId]
      );

      res.json({
        telegramId: resolved.telegramId,
        source: resolved.source
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("API error:", error);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(config.API_PORT, "0.0.0.0", () => {
    console.log(`API server listening on 0.0.0.0:${config.API_PORT}`);
  });
}

async function createMediaSignedUrl(path: string): Promise<string | null> {
  const bucket = getS3Value("S3_BUCKET", "AWS_BUCKET", "BUCKET_NAME");
  const client = getMediaBucket();

  if (!bucket || !client) {
    console.warn("Railway Bucket is not configured; cannot sign media URL.");
    return null;
  }

  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: path
      }),
      { expiresIn: 60 * 60 }
    );
  } catch (error) {
    console.warn("Failed to sign media URL:", error);
    return null;
  }
}

function getMediaBucket(): S3Client | null {
  if (mediaBucket) {
    return mediaBucket;
  }

  const endpoint = getS3Value("S3_ENDPOINT", "AWS_ENDPOINT", "BUCKET_ENDPOINT");
  const accessKeyId = getS3Value(
    "S3_ACCESS_KEY_ID",
    "AWS_ACCESS_KEY_ID",
    "BUCKET_ACCESS_KEY_ID"
  );
  const secretAccessKey = getS3Value(
    "S3_SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
    "BUCKET_SECRET_ACCESS_KEY"
  );

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  mediaBucket = new S3Client({
    endpoint,
    region: getS3Value("S3_REGION", "AWS_REGION", "AWS_DEFAULT_REGION") ?? config.S3_REGION,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  return mediaBucket;
}

function getS3Value(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function requireTelegramAuth(req: Request, res: Response, next: NextFunction): void {
  const initData = req.header("x-telegram-init-data");

  if (!initData && process.env.NODE_ENV !== "production") {
    next();
    return;
  }

  if (!initData || !verifyTelegramInitData(initData)) {
    res.status(401).json({ error: "Invalid Telegram init data" });
    return;
  }

  next();
}
