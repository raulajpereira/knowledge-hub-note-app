import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { voiceNotes, VOICE_KINDS } from '@/db/schema';
import { env } from '@/lib/env';
import { randomToken } from '@/lib/crypto';
import { s3 } from '@/lib/storage';
import { ApiError } from '@/server/errors';
import { assertWithinLimit } from '@/server/licensing/entitlements';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from './tenant';

// Voice notes (prototype isVoice). The audio is recorded in the browser
// (MediaRecorder), uploaded once and streamed back only to its owner.

export const MAX_AUDIO = 25 * 1024 * 1024; // ~ 1 h of Opus at 48 kbit/s
export const MAX_DURATION_MS = 3 * 60 * 60 * 1000;
export type VoiceKind = (typeof VOICE_KINDS)[number];

/** Container type from the first bytes (never trust the browser's Content-Type). */
export function sniffAudio(b: Uint8Array): string | null {
  const s = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length < 12) return null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  if (s(0, 4) === 'OggS') return 'audio/ogg';
  if (s(4, 4) === 'ftyp') return 'audio/mp4';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WAVE') return 'audio/wav';
  if (s(0, 3) === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0)) return 'audio/mpeg';
  return null;
}

export type VoiceItem = {
  id: string;
  title: string;
  kind: VoiceKind;
  durationMs: number;
  levels: number[];
  transcript: string;
  notes: string;
  pinned: boolean;
  mime: string;
  createdAt: string;
};

const cols = {
  id: voiceNotes.id,
  title: voiceNotes.title,
  kind: voiceNotes.kind,
  durationMs: voiceNotes.durationMs,
  levels: voiceNotes.levels,
  transcript: voiceNotes.transcript,
  notes: voiceNotes.notes,
  pinned: voiceNotes.pinned,
  mime: voiceNotes.mime,
  createdAt: voiceNotes.createdAt,
};
const toItem = (r: Omit<VoiceItem, 'createdAt'> & { createdAt: Date }): VoiceItem => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
});

export async function listVoice(auth: AuthContext): Promise<VoiceItem[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select(cols)
      .from(voiceNotes)
      .where(isNull(voiceNotes.deletedAt))
      .orderBy(desc(voiceNotes.createdAt))
      .limit(1000);
    return rows.map(toItem);
  });
}

export async function getVoice(auth: AuthContext, id: string): Promise<VoiceItem> {
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .select(cols)
      .from(voiceNotes)
      .where(and(eq(voiceNotes.id, id), isNull(voiceNotes.deletedAt)));
    if (!r) throw new ApiError(404, 'not_found');
    return toItem(r);
  });
}

/** 72 bars, each 0–1 (prototype waveform). */
const cleanLevels = (l: unknown): number[] =>
  Array.isArray(l)
    ? l
        .slice(0, 72)
        .map((x) =>
          typeof x === 'number' && Number.isFinite(x)
            ? Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000
            : 0,
        )
    : [];

export async function createVoice(
  auth: AuthContext,
  input: { title: string; kind: VoiceKind; durationMs: number; levels: unknown; data: Uint8Array },
): Promise<VoiceItem> {
  if (input.data.length > MAX_AUDIO) throw new ApiError(413, 'file_too_large', undefined, { max: MAX_AUDIO });
  const mime = sniffAudio(input.data);
  if (!mime) throw new ApiError(415, 'unsupported_audio');
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(voiceNotes)
      .where(isNull(voiceNotes.deletedAt))) as [{ n: number }];
    await assertWithinLimit(auth.tenant.id, 'voice', n);
    const key = `tenants/${auth.tenant.id}/voice/${randomToken(16)}`;
    await s3().send(
      new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: input.data, ContentType: mime }),
    );
    const [r] = await tx
      .insert(voiceNotes)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        title: input.title,
        kind: input.kind,
        storageKey: key,
        mime,
        size: input.data.length,
        durationMs: Math.round(Math.min(MAX_DURATION_MS, Math.max(0, input.durationMs))),
        levels: cleanLevels(input.levels),
      })
      .returning(cols);
    return toItem(r!);
  });
}

export async function updateVoice(
  auth: AuthContext,
  id: string,
  patch: Partial<{ title: string; transcript: string; notes: string; pinned: boolean }>,
): Promise<VoiceItem> {
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .update(voiceNotes)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(voiceNotes.id, id), isNull(voiceNotes.deletedAt)))
      .returning(cols);
    if (!r) throw new ApiError(404, 'not_found');
    return toItem(r);
  });
}

export async function trashVoice(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(voiceNotes)
      .set({ deletedAt: new Date() })
      .where(and(eq(voiceNotes.id, id), isNull(voiceNotes.deletedAt)))
      .returning({ id: voiceNotes.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

export async function readVoiceAudio(auth: AuthContext, id: string) {
  const row = await asUser(auth, async (tx) => {
    const [r] = await tx
      .select({ key: voiceNotes.storageKey, mime: voiceNotes.mime })
      .from(voiceNotes)
      .where(and(eq(voiceNotes.id, id), isNull(voiceNotes.deletedAt)));
    return r;
  });
  if (!row) return null;
  const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: row.key }));
  const body = await obj.Body?.transformToByteArray();
  return body ? { body, mime: row.mime } : null;
}
