'use client';

import { useState } from 'react';
import { Field, Select } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { Page, Section } from './Section';

const PRIOS = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica', disabled: true },
];

// > 10 options → the filter box appears (prototype rule).
const TCODES = [
  'SE38',
  'SE80',
  'SE11',
  'SE37',
  'SM30',
  'SM37',
  'ST22',
  'SU01',
  'PFCG',
  'STMS',
  'SE09',
  'SE10',
  'SPRO',
  'VA01',
  'ME21N',
  'FB60',
].map((c) => ({ value: c, label: c }));

export default function SelectDemo() {
  const { t } = useI18n();
  const [prio, setPrio] = useState('medium');
  const [tc, setTc] = useState<string | null>(null);
  const [env, setEnv] = useState<string | null>(null);
  return (
    <Page
      title="Select de Vidro"
      desc="Substitui todos os <select> nativos (initSelects): menu de vidro posicionado por baixo ou por cima, ✓ na opção ativa, pesquisa a partir de 11 opções, teclado (↑ ↓ Enter Esc Tab, Espaço/F4/Alt+↓ para abrir)."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
        <Section title="Curto">
          <Field label="Prioridade">
            {({ id }) => (
              <Select
                id={id}
                value={prio}
                options={PRIOS}
                onChange={setPrio}
                searchPlaceholder={t('ui_search')}
              />
            )}
          </Field>
        </Section>
        <Section title="Longo, com pesquisa" note="16 opções">
          <Field label="Transação">
            {({ id }) => (
              <Select
                id={id}
                value={tc}
                options={TCODES}
                onChange={setTc}
                placeholder="Escolha uma transação"
                searchPlaceholder={t('ui_search')}
                noResults={t('ui_noResults')}
              />
            )}
          </Field>
        </Section>
        <Section title="Erro e desativado">
          <Field label="Ambiente" error="Escolha um ambiente.">
            {({ id, invalid, describedBy }) => (
              <Select
                id={id}
                value={env}
                invalid={invalid}
                aria-describedby={describedBy}
                options={['DEV', 'QAS', 'PRD'].map((v) => ({ value: v, label: v }))}
                onChange={setEnv}
                placeholder="—"
                searchPlaceholder={t('ui_search')}
              />
            )}
          </Field>
          <Field label="Cliente">
            {({ id }) => (
              <Select
                id={id}
                value="sol"
                disabled
                options={[{ value: 'sol', label: 'Banco SOL' }]}
                onChange={() => {}}
                searchPlaceholder={t('ui_search')}
              />
            )}
          </Field>
        </Section>
        <Section title="Grande (auth)">
          <Field label="Idioma">
            {({ id }) => (
              <Select
                id={id}
                size="lg"
                value="pt"
                options={[
                  { value: 'pt', label: 'Português' },
                  { value: 'en', label: 'English' },
                ]}
                onChange={() => {}}
                searchPlaceholder={t('ui_search')}
              />
            )}
          </Field>
        </Section>
      </div>
    </Page>
  );
}
