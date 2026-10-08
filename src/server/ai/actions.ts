import 'server-only';
import { z } from 'zod';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { getVoice, readVoiceAudio, updateVoice } from '@/server/content/voice';
import { createMeeting, updateMeeting } from '@/server/content/meetings';
import { linkItems } from '@/server/content/notes';
import { aiConfig } from './settings';
import { complete, transcribe } from './provider';

// The assistant's actions inside the pages: organise a meeting record, turn a
// voice note into a transcript and a meeting record, explain code, write test
// steps. Structured answers are asked for as JSON and checked before use.

const lang = (auth: AuthContext) => (auth.user.lang === 'en' ? 'English' : 'português de Portugal');

/** The first JSON object in the model's answer, checked against a schema. */
function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new ApiError(502, 'ai_bad_output');
  try {
    return schema.parse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    throw new ApiError(502, 'ai_bad_output');
  }
}

const line = z.string().trim().min(1).max(2000);
const MeetingOut = z.object({
  title: z.string().trim().max(300).optional(),
  summary: z.string().max(20_000).default(''),
  review: z.array(line).max(50).default([]),
  todos: z.array(line).max(50).default([]),
});
export type MeetingSuggestion = z.infer<typeof MeetingOut>;

const MEETING_SYSTEM = (l: string) =>
  `You turn raw meeting notes or a transcript into a meeting record for an SAP consultant. Answer in ${l}. ` +
  `Reply with JSON only, no other text, exactly in this shape: ` +
  `{"title": "short subject", "summary": "the topics discussed, as short paragraphs or bullet lines", ` +
  `"review": ["point to review", ...], "todos": ["action — owner if known", ...]}. ` +
  `Keep names, dates, SAP terms and numbers exactly as given; do not invent facts. Empty arrays when there is nothing.`;

/** "Organizar com IA" in a meeting record: summary, points to review, actions. */
export async function organiseMeeting(
  auth: AuthContext,
  input: { title: string; participants: string[]; topics: string },
): Promise<MeetingSuggestion> {
  const cfg = await aiConfig(auth);
  const text = await complete(cfg, {
    system: MEETING_SYSTEM(lang(auth)),
    messages: [
      {
        role: 'user',
        content: `Subject: ${input.title}\nParticipants: ${input.participants.join(', ') || '—'}\n\nNotes:\n${input.topics}`,
      },
    ],
    maxTokens: 3000,
  });
  return parseJson(text, MeetingOut);
}

/** "Transcrever": the voice note's audio to text (kept in the note). */
export async function transcribeVoice(auth: AuthContext, id: string) {
  const cfg = await aiConfig(auth);
  const audio = await readVoiceAudio(auth, id);
  if (!audio) throw new ApiError(404, 'not_found');
  if (audio.body.length > 25 * 1024 * 1024) throw new ApiError(413, 'file_too_large');
  const text = await transcribe(cfg, audio.body, audio.mime, auth.user.lang === 'en' ? 'en' : 'pt');
  await updateVoice(auth, id, { transcript: text.slice(0, 100_000) });
  return text;
}

/** "Criar registo de reunião": a meeting record from the voice note, linked to it. */
export async function meetingFromVoice(auth: AuthContext, id: string, folderId?: string | null) {
  const v = await getVoice(auth, id);
  let transcript = v.transcript?.trim() ?? '';
  if (!transcript) transcript = await transcribeVoice(auth, id);
  if (!transcript) throw new ApiError(400, 'ai_empty_audio');
  const cfg = await aiConfig(auth);
  const out = parseJson(
    await complete(cfg, {
      system: MEETING_SYSTEM(lang(auth)),
      messages: [{ role: 'user', content: `Subject: ${v.title}\n\nTranscript:\n${transcript}` }],
      maxTokens: 3000,
    }),
    MeetingOut,
  );
  const m = await createMeeting(auth, {
    title: (out.title || v.title || 'Reunião').slice(0, 300),
    heldOn: v.createdAt.slice(0, 10),
    folderId: folderId ?? null,
  });
  const full = await updateMeeting(auth, m.id, {
    topics: out.summary,
    review: out.review.map((t) => ({ t, done: false })),
    todos: out.todos.map((t) => ({ t, done: false })),
  });
  await linkItems(auth, { type: 'meeting', id: m.id }, { type: 'voice', id });
  return full;
}

/** "Explicar código" (Code Library, Biblioteca de Código SAP). */
export async function explainCode(auth: AuthContext, input: { code: string; lang?: string; name?: string }) {
  const cfg = await aiConfig(auth);
  return complete(cfg, {
    system:
      `You explain code to an SAP consultant. Answer in ${lang(auth)}, in markdown: first a two-line summary of what the code does, ` +
      `then the main steps, then risks or improvements (performance, SAP best practices, security). Be concise; quote identifiers in backticks.`,
    messages: [
      {
        role: 'user',
        content: `${input.name ? `${input.name}\n` : ''}Language: ${input.lang || 'auto'}\n\n\`\`\`\n${input.code}\n\`\`\``,
      },
    ],
    maxTokens: 3000,
  });
}

const StepsOut = z.object({
  steps: z
    .array(
      z.object({
        step: z.string().trim().min(1).max(2000),
        expected: z.string().trim().max(2000).default(''),
      }),
    )
    .min(1)
    .max(40),
});

/** "Gerar passos de teste" (Funcional › Testes). */
export async function testSteps(
  auth: AuthContext,
  input: { title: string; module?: string; kind?: string; pre?: string; existing: string[] },
) {
  const cfg = await aiConfig(auth);
  const out = parseJson(
    await complete(cfg, {
      system:
        `You write SAP test cases. Answer in ${lang(auth)}. Reply with JSON only, exactly: ` +
        `{"steps": [{"step": "action, with the transaction or Fiori app when relevant", "expected": "expected result"}, ...]}. ` +
        `Between 4 and 12 concrete, executable steps; do not repeat the existing steps.`,
      messages: [
        {
          role: 'user',
          content: [
            `Test: ${input.title}`,
            input.module ? `Module: ${input.module}` : '',
            input.kind ? `Type: ${input.kind}` : '',
            input.pre ? `Preconditions / data: ${input.pre}` : '',
            input.existing.length ? `Existing steps:\n- ${input.existing.join('\n- ')}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      maxTokens: 3000,
    }),
    StepsOut,
  );
  return out.steps;
}
