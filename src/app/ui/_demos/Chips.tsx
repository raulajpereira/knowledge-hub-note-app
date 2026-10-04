'use client';

import { useState } from 'react';
import { Badge, Chip, Pill, STATUS_TONES, Tag } from '@/components/ui';
import { Page, Row, Section } from './Section';

const ENV = { DEV: 'oklch(0.82 0.11 210)', QAS: 'oklch(0.85 0.12 75)', PRD: 'oklch(0.72 0.17 25)' } as const;

export default function Chips() {
  const [f, setF] = useState('all');
  const chips = [
    ['all', 'Todos', 6],
    ['open', 'Aberto', 3, 'oklch(0.75 0.12 245)'],
    ['progress', 'Em Curso', 2, 'oklch(0.82 0.13 85)'],
    ['done', 'Concluído', 1, 'oklch(0.78 0.14 150)'],
  ] as const;
  return (
    <Page
      title="Chips, Tags e Badges"
      desc="Chips de filtro (prototype chip(on)), tags de estado (chipC) e de código (SID, ambiente), contadores da barra lateral."
    >
      <Section title="Chips de filtro" note="clique para alternar">
        <Row gap={8}>
          {chips.map(([id, label, n, dot]) => (
            <Chip key={id} selected={f === id} count={n} dot={dot} onClick={() => setF(id)}>
              {label}
            </Chip>
          ))}
        </Row>
      </Section>
      <Section title="Tags de estado" note="Admin Console › clientes e pedidos">
        <Row gap={8}>
          <Tag tone="ok">Ativo</Tag>
          <Tag tone="info">Trial</Tag>
          <Tag tone="warn">Pendente</Tag>
          <Tag tone="danger">Suspenso</Tag>
          <Tag tone="neutral">Cancelado</Tag>
        </Row>
      </Section>
      <Section title="Tags de código" note="ambientes SAP com brilho, tipos de objeto">
        <Row gap={8}>
          {(Object.keys(ENV) as (keyof typeof ENV)[]).map((e) => (
            <Tag
              key={e}
              shape="code"
              bg={ENV[e].replace(')', ' / .26)')}
              style={{ boxShadow: `0 0 14px ${ENV[e].replace(')', ' / .35)')}` }}
            >
              {e}
            </Tag>
          ))}
          <Tag shape="code">CLAS</Tag>
          <Tag shape="code">PROG</Tag>
          <Tag shape="code">FUGR</Tag>
        </Row>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          Tons disponíveis: {Object.keys(STATUS_TONES).join(' · ')}
        </span>
      </Section>
      <Section title="Contadores e pills">
        <Row gap={8}>
          <Badge>6</Badge>
          <Badge>10</Badge>
          <Badge>128</Badge>
          <Pill>Máx / Mín 24° / 16°</Pill>
          <Pill>Humidade 62%</Pill>
          <Pill>Vento 14 km/h</Pill>
        </Row>
      </Section>
    </Page>
  );
}
