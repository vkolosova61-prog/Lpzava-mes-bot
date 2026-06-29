import { Api } from "telegram";
import type { TelegramClient } from "telegram";

export type StoredMedia = {
  path: string;
  mimeType: string;
  size: number;
};

export async function uploadMessageMedia(
  client: TelegramClient,
  message: Api.Message,
  peerId: number,
  mediaType: string
): Promise<StoredMedia | null> {
  const downloaded = await client.downloadMedia(message, {});

  if (!Buffer.isBuffer(downloaded)) {
    return null;
  }

  const mimeType = getMimeType(message, mediaType);
  const extension = getExtension(mimeType, mediaType);
  const safePeerId = String(peerId).replace(/^-/, "m");
  const path = `${safePeerId}/${message.id}-${Date.now()}.${extension}`;

  await Bun.write(Bun.s3.file(path, { type: mimeType }), downloaded);

  return {
    path,
    mimeType,
    size: downloaded.byteLength
  };
}

function getMimeType(message: Api.Message, mediaType: string): string {
  if (message.document?.mimeType) {
    return message.document.mimeType;
  }

  if (mediaType === "photo" || mediaType === "sticker") {
    return "image/jpeg";
  }

  if (mediaType === "video" || mediaType === "video_note") {
    return "video/mp4";
  }

  if (mediaType === "voice") {
    return "audio/ogg";
  }

  if (mediaType === "audio") {
    return "audio/mpeg";
  }

  if (mediaType === "animation") {
    return "video/mp4";
  }

  return "application/octet-stream";
}

function getExtension(mimeType: string, mediaType: string): string {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/webm": "webm"
  };

  if (byMime[mimeType]) {
    return byMime[mimeType];
  }

  if (mediaType === "photo") {
    return "jpg";
  }

  if (mediaType === "video" || mediaType === "video_note" || mediaType === "animation") {
    return "mp4";
  }

  if (mediaType === "voice") {
    return "ogg";
  }

  return "bin";
}
