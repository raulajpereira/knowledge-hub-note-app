'use client';

import { useState } from 'react';
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useI18n } from '@/i18n/client';
import { NOTE_LANGS, guessLang, langName } from '@/lib/codeHighlight';

/** Code block: language (Automático = detected from the code), copy, highlighted text below. */
export function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const { t } = useI18n();
  const lang = (node.attrs.language as string | null) || '';
  const detected = lang ? null : langName(guessLang(node.textContent));
  const [copied, setCopied] = useState(false);
  return (
    <NodeViewWrapper className="kh-ne-code">
      <div className="kh-ne-code__bar" contentEditable={false}>
        <select
          aria-label={t('ne_codeLang')}
          value={lang}
          disabled={!editor.isEditable}
          onChange={(e) => updateAttributes({ language: e.target.value || null })}
        >
          <option value="">{detected ? `${t('ne_codeAuto')} · ${detected}` : t('ne_codeAuto')}</option>
          {NOTE_LANGS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          <option value="plain">{t('ne_codePlain')}</option>
        </select>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(node.textContent).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
      <pre spellCheck={false}>
        <NodeViewContent<'code'> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
