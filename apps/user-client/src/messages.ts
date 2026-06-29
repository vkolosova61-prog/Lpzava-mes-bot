import { Api, TelegramClient } from "telegram";
import type { NewMessageEvent } from "telegram/events/index.js";
import { getListenerConfig } from "./config.js";
import { getPeerProfile, getPeerStorageId } from "./peer.js";
import { applyRetentionBeforeInsert } from "./retention.js";
import { uploadMessageMedia, type StoredMedia } from "./storage.js";
import { supabaseAdmin } from "./supabase.js";

const listenerConfig = getListenerConfig();

export async function handleNewMessage(
  client: TelegramClient,
  event: NewMessageEvent
): Promise<void> {
  const message = event.message;
  const peerId = getPeerStorageId(message.peerId);

  if (peerId === listenerConfig.DUMP_CHANNEL_ID) {
    return;
  }

  await upsertPeerProfile(client, message.peerId, peerId);

  const text = message.message?.trim() ? message.message : null;
  const originalMediaType = getMediaType(message);
  let mediaType = originalMediaType;
  let mediaFileId: string | null = null;
  let storedMedia: StoredMedia | null = null;

  if (originalMediaType) {
    try {
      storedMedia = await uploadMessageMedia(client, message, peerId, originalMediaType);
      mediaFileId = await forwardMediaToDump(client, message);
    } catch (error) {
      if (!storedMedia) {
        mediaType = "protected_or_failed";
      }

      console.warn("Failed to store media:", formatError(error));
    }
  }

  await applyRetentionBeforeInsert(peerId);

  const { error } = await supabaseAdmin.from("Messages").insert({
    user_id: peerId,
    chat_id: peerId,
    sender: message.out ? "bot" : "user",
    text,
    media_file_id: mediaFileId,
    media_type: mediaType,
    media_storage_path: storedMedia?.path ?? null,
    media_mime_type: storedMedia?.mimeType ?? null,
    media_size: storedMedia?.size ?? null,
    timestamp: new Date(message.date * 1000).toISOString()
  });

  if (error) {
    throw error;
  }
}

async function upsertPeerProfile(
  client: TelegramClient,
  peer: Api.TypePeer,
  peerId: number
): Promise<void> {
  const entity = (await client.getEntity(peer)) as Api.TypeUser | Api.TypeChat;
  const profile = getPeerProfile(entity, peerId);

  const { error } = await supabaseAdmin.from("Users").upsert(
    {
      telegram_id: profile.telegramId,
      username: profile.username,
      phone: profile.phone,
      first_name: profile.firstName,
      last_name: profile.lastName,
      display_name: profile.displayName,
      last_seen_at: new Date().toISOString()
    },
    { onConflict: "telegram_id" }
  );

  if (error) {
    throw error;
  }
}

async function forwardMediaToDump(
  client: TelegramClient,
  message: Api.Message
): Promise<string> {
  const forwarded = await client.forwardMessages(listenerConfig.DUMP_CHANNEL_ID, {
    messages: message.id,
    fromPeer: message.peerId,
    silent: true,
    dropAuthor: true
  });

  const dumpedMessage = forwarded[0];

  if (!dumpedMessage) {
    throw new Error("Dump forward returned no message");
  }

  return `dump:${listenerConfig.DUMP_CHANNEL_ID}:${dumpedMessage.id}`;
}

function getMediaType(message: Api.Message): string | null {
  if (message.photo) {
    return "photo";
  }

  if (message.video) {
    return "video";
  }

  if (message.gif) {
    return "animation";
  }

  if (message.voice) {
    return "voice";
  }

  if (message.videoNote) {
    return "video_note";
  }

  if (message.sticker) {
    return "sticker";
  }

  if (message.audio) {
    return "audio";
  }

  if (message.document) {
    return "document";
  }

  if (message.contact) {
    return "contact";
  }

  if (message.geo) {
    return "geo";
  }

  if (message.poll) {
    return "poll";
  }

  if (message.media) {
    return "media";
  }

  return null;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
