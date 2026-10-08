'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { AI_SOURCE_HREF, aiProvider } from '@/lib/ai';
import { useConfirm } from '@/components/ui';
import { useAi } from './useAi';
import { AiText } from './AiText';
import './ai.css';

// Assistente IA: the side panel — ask about your own content (answers cite
// the notes, meetings, tasks… they come from), with saved conversations.

type Source = { type: string; id: string; title: string };
type Msg = { id: string; role: 'user' | 'assistant'; content: string; sources: Source[]; error?: boolean };
type Chat = { id: string; title: string; updatedAt: string };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const Svg = ({ d, s = 16 }: { d: string; s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);
const I = {
  x: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  hist: '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path><path d="M12 8v4l3 2"></path>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"></path>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>',
  spark:
    '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"></path><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"></path>',
};

export function AiPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const { ai, ready } = useAi();
  const [chatId, setChatId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [showHist, setShowHist] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  const loadChats = useCallback(() => {
    api<{ chats: Chat[] }>('/ai/chats')
      .then((r) => setChats(r.chats))
      .catch(() => setChats([]));
  }, []);
  const openChat = async (id: string) => {
    try {
      const r = await api<{ messages: Msg[] }>(`/ai/chats/${id}`);
      setChatId(id);
      setMsgs(r.messages);
      setShowHist(false);
    } catch {
      loadChats();
    }
  };
  const removeChat = async (c: Chat) => {
    const ok = await confirm({
      title: t('ai_delChatT'),
      body: c.title,
      confirmLabel: t('del'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    await api(`/ai/chats/${c.id}`, undefined, 'DELETE').catch(() => {});
    if (chatId === c.id) newChat();
    loadChats();
  };
  const newChat = () => {
    setChatId(null);
    setMsgs([]);
    setShowHist(false);
    setTimeout(() => input.current?.focus(), 30);
  };

  const errText = (code: string) =>
    t(
      (
        {
          ai_key_invalid: 'ai_errKey',
          ai_rate_limited: 'ai_errRate',
          ai_model_invalid: 'ai_errModel',
          ai_refused: 'ai_errRefused',
          too_many_requests: 'ai_errRate',
          ai_not_configured: 'ai_needSetup',
          ai_disabled: 'ai_needSetup',
        } as Record<string, string>
      )[code] ?? 'ai_errProvider',
    );

  const ask = async () => {
    const text = q.trim();
    if (!text || busy) return;
    setQ('');
    setBusy(true);
    const mine: Msg = { id: `u${Date.now()}`, role: 'user', content: text, sources: [] };
    const aid = `a${Date.now()}`;
    setMsgs((m) => [...m, mine, { id: aid, role: 'assistant', content: '', sources: [] }]);
    const set = (p: Partial<Msg>) => setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, ...p } : x)));
    try {
      const res = await fetch(`${BASE}/api/v1/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ chatId: chatId ?? undefined, message: text, today: today() }),
      });
      if (!res.ok || !res.body) {
        const d = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
        set({ content: errText(d.error?.code ?? ''), error: true });
        return;
      }
      const id = res.headers.get('X-Ai-Chat');
      if (id) setChatId(id);
      let sources: Source[] = [];
      try {
        sources = JSON.parse(decodeURIComponent(res.headers.get('X-Ai-Sources') ?? '[]')) as Source[];
      } catch {
        // no sources
      }
      set({ sources });
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let acc = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += value;
        set({ content: acc });
      }
    } catch (e) {
      set({ content: errText(isApiFailure(e) ? e.code : ''), error: true });
    } finally {
      setBusy(false);
      if (chats) loadChats();
    }
  };

  if (!open) return null;
  const cite = (sources: Source[]) =>
    function citation(n: number) {
      const s = sources[n - 1];
      if (!s) return `[${n}]`;
      const href = AI_SOURCE_HREF[s.type]?.(s.id);
      return href ? (
        <Link className="kh-ai-cite" href={href} title={s.title} onClick={onClose}>
          {n}
        </Link>
      ) : (
        <span className="kh-ai-cite">{n}</span>
      );
    };

  return (
    <aside className="kh-ai" role="dialog" aria-label={t('ai_panel')}>
      <div className="kh-ai__head">
        <span className="kh-ai__logo">
          <Svg d={I.spark} s={17} />
        </span>
        <div className="kh-ai__ttl">
          <b>{t('ai_panel')}</b>
          {ai?.configured && (
            <span>
              {aiProvider(ai.provider!)?.name} · {ai.model}
            </span>
          )}
        </div>
        {ready && (
          <>
            <button
              type="button"
              className="kh-ai__ic"
              title={t('ai_new')}
              aria-label={t('ai_new')}
              onClick={newChat}
            >
              <Svg d={I.plus} />
            </button>
            <button
              type="button"
              className="kh-ai__ic"
              title={t('ai_history')}
              aria-label={t('ai_history')}
              aria-pressed={showHist}
              onClick={() => {
                setShowHist((v) => !v);
                loadChats();
              }}
            >
              <Svg d={I.hist} />
            </button>
          </>
        )}
        <button
          type="button"
          className="kh-ai__ic"
          title={t('ai_close')}
          aria-label={t('ai_close')}
          onClick={onClose}
        >
          <Svg d={I.x} />
        </button>
      </div>

      {!ready ? (
        <div className="kh-ai__empty">
          <Svg d={I.spark} s={28} />
          <p>{t('ai_needSetup')}</p>
          <Link className="kh-ai__cta" href="/app/settings?tab=ai" onClick={onClose}>
            {t('ai_goSetup')}
          </Link>
        </div>
      ) : showHist ? (
        <div className="kh-ai__hist">
          {chats?.map((c) => (
            <div key={c.id} className="kh-ai__chat" data-on={c.id === chatId || undefined}>
              <button type="button" onClick={() => void openChat(c.id)}>
                <span>{c.title}</span>
                <small>{new Date(c.updatedAt).toLocaleString()}</small>
              </button>
              <button
                type="button"
                className="kh-ai__ic"
                title={t('del')}
                aria-label={`${t('del')} ${c.title}`}
                onClick={() => void removeChat(c)}
              >
                <Svg d={I.trash} s={14} />
              </button>
            </div>
          ))}
          {chats && !chats.length && <p className="kh-ai__none">{t('ai_noChats')}</p>}
        </div>
      ) : (
        <div className="kh-ai__msgs" ref={scroller} aria-live="polite">
          {!msgs.length && (
            <div className="kh-ai__hello">
              <p>{t('ai_hello')}</p>
              {['ai_ex1', 'ai_ex2', 'ai_ex3'].map((k) => (
                <button key={k} type="button" onClick={() => setQ(t(k))}>
                  {t(k)}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className="kh-ai__msg" data-role={m.role} data-error={m.error || undefined}>
              {m.role === 'user' ? (
                <p>{m.content}</p>
              ) : m.content ? (
                <AiText text={m.content} cite={cite(m.sources)} />
              ) : (
                <span className="kh-ai__dots" aria-label={t('ai_thinking')}>
                  <i />
                  <i />
                  <i />
                </span>
              )}
              {m.role === 'assistant' && m.sources.length > 0 && m.content && (
                <div className="kh-ai__srcs">
                  {m.sources.map((s, i) => {
                    const href = AI_SOURCE_HREF[s.type]?.(s.id);
                    return href ? (
                      <Link key={`${s.type}${s.id}`} href={href} onClick={onClose} title={s.title}>
                        <b>{i + 1}</b> {s.title}
                      </Link>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {ready && !showHist && (
        <form
          className="kh-ai__ask"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <textarea
            ref={input}
            value={q}
            rows={2}
            maxLength={4000}
            placeholder={t('ai_askPh')}
            aria-label={t('ai_askPh')}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
          />
          <button type="submit" disabled={busy || !q.trim()} title={t('ai_send')} aria-label={t('ai_send')}>
            <Svg d={I.send} />
          </button>
        </form>
      )}
      {ready && <div className="kh-ai__note">{t('ai_note')}</div>}
    </aside>
  );
}
