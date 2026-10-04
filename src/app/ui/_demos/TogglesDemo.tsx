'use client';

import { useState } from 'react';
import { Checkbox, Message, Segmented, Switch } from '@/components/ui';
import { Label, Page, Row, Section } from './Section';

export default function TogglesDemo() {
  const [remember, setRemember] = useState(true);
  const [off, setOff] = useState(false);
  const [sw, setSw] = useState({ weather: true, ticker: false });
  const [view, setView] = useState<'list' | 'cards'>('list');
  const [lang, setLang] = useState<'pt' | 'en'>('pt');
  return (
    <Page
      title="Checkbox, Switch, Segmentado"
      desc="Controlos binários e de escolha única, com role/aria-checked e foco visível."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20 }}>
        <Section title="Checkbox" note="Login › Lembrar-me">
          <Checkbox checked={remember} onChange={setRemember}>
            Lembrar-me
          </Checkbox>
          <Checkbox checked={off} onChange={setOff}>
            Mostrar tarefas concluídas
          </Checkbox>
        </Section>
        <Section title="Switch" note="Definições">
          <Row gap={14}>
            <Switch
              checked={sw.weather}
              onChange={(v) => setSw({ ...sw, weather: v })}
              label="Meteorologia"
            />
            <span style={{ fontSize: 14 }}>Meteorologia</span>
          </Row>
          <Row gap={14}>
            <Switch
              checked={sw.ticker}
              onChange={(v) => setSw({ ...sw, ticker: v })}
              label="Notícias no rodapé"
            />
            <span style={{ fontSize: 14 }}>Notícias no rodapé</span>
          </Row>
          <Row gap={14}>
            <Switch checked disabled onChange={() => {}} label="Desativado" />
            <span style={{ fontSize: 14, color: 'var(--text-3)' }}>Desativado</span>
          </Row>
        </Section>
        <Section title="Segmentado">
          <Segmented
            label="Idioma"
            value={lang}
            onChange={setLang}
            options={[
              { value: 'pt', label: 'PT' },
              { value: 'en', label: 'EN' },
            ]}
          />
          <Segmented
            label="Vista"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: 'Lista' },
              { value: 'cards', label: 'Cartões' },
            ]}
          />
        </Section>
        <Section title="Mensagens" note="resultado de formulários">
          <Message tone="ok">Sessão iniciada. A abrir o KnowledgeHub…</Message>
          <Message tone="error">Email ou password incorretos.</Message>
          <Label>role=status / role=alert para leitores de ecrã</Label>
        </Section>
      </div>
    </Page>
  );
}
