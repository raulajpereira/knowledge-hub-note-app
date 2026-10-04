'use client';

import appPt from '@/i18n/dict/app.pt.json';
import adminEx from '@/i18n/dict/admin.pt-en.json';
import mgEx from '@/i18n/dict/mg.pt-en.json';
import { Segmented, Tag } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { Label, Page, Row, Section } from './Section';

const SAMPLE_KEYS = [
  'newNote',
  'newFolder',
  'settings',
  'lock',
  'nav_systems',
  'nav_transports',
  'glassTitle',
  'langDesc',
] as const;
const ADMIN = ['Voltar à App', '3 de 10 lugares vendidos', 'há 5 dias'];
const MG = ['Recursos', 'alvo 90%', '4 equipas'];

export default function I18nDemo() {
  const { lang, setLang, t, tAdmin, tMg } = useI18n();
  return (
    <Page
      title="Idioma (PT / EN)"
      desc="Dicionários extraídos automaticamente dos protótipos (scripts/extract-i18n.mjs). A escolha fica num cookie e o servidor desenha logo no idioma certo; depois do login passa para as preferências do utilizador."
    >
      <Section title="Idioma atual">
        <Segmented
          label="Idioma"
          value={lang}
          onChange={setLang}
          options={[
            { value: 'pt', label: 'PT' },
            { value: 'en', label: 'EN' },
          ]}
        />
        <Row gap={8}>
          <Tag shape="code">I18N · {Object.keys(appPt).length} chaves</Tag>
          <Tag shape="code">AD_EX · {Object.keys(adminEx).length}</Tag>
          <Tag shape="code">MG_EX · {Object.keys(mgEx).length}</Tag>
        </Row>
      </Section>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20 }}>
        <Section title="App (por chave)">
          {SAMPLE_KEYS.map((k) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
              <Label>{k}</Label>
              <span>{t(k)}</span>
            </div>
          ))}
        </Section>
        <Section title="Admin Console e Management (PT → EN)">
          {[...ADMIN.map((s) => [s, tAdmin(s)]), ...MG.map((s) => [s, tMg(s)])].map(([src, out]) => (
            <div
              key={src}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}
            >
              <span style={{ color: 'var(--text-3)' }}>{src}</span>
              <span>{out}</span>
            </div>
          ))}
        </Section>
      </div>
    </Page>
  );
}
