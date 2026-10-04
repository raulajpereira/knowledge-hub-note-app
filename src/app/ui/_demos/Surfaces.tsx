'use client';

import { AMBIENTS, AmbientBackground, Glass, Well } from '@/components/ui';
import { Label, Page, Row, Section } from './Section';

export default function Surfaces() {
  return (
    <Page
      title="Superfícies e Fundo"
      desc="Liquid glass sobre fundo quente — README §6. O desfoque segue o valor de cada superfície nos protótipos, salvo se o utilizador o ajustar nas Definições."
    >
      <Section title="Glass" note="painel 30px · cartão 24px · suave (drawer, painéis interiores)">
        <Row gap={16} align="stretch">
          <Glass variant="panel" style={{ width: 240, height: 140, padding: 20 }}>
            <Label>panel</Label>
          </Glass>
          <Glass variant="card" style={{ width: 240, height: 140, padding: 20 }}>
            <Label>card</Label>
          </Glass>
          <Glass variant="soft" style={{ width: 240, height: 140, padding: 20 }}>
            <Label>soft</Label>
          </Glass>
          <Well style={{ width: 240, height: 140, padding: 20 }}>
            <Label>well</Label>
          </Well>
        </Row>
      </Section>
      <Section
        title="Fundos"
        note="Areia (por omissão), Grafite, Crepúsculo — gradiente + 4 manchas desfocadas"
      >
        <Row gap={16}>
          {(Object.keys(AMBIENTS) as (keyof typeof AMBIENTS)[]).map((name) => (
            <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  position: 'relative',
                  width: 300,
                  height: 190,
                  borderRadius: 24,
                  overflow: 'hidden',
                  transform: 'translateZ(0)',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    transform: 'scale(.25)',
                    transformOrigin: '0 0',
                    width: '400%',
                    height: '400%',
                  }}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%', contain: 'paint' }}>
                    <AmbientPreview name={name} />
                  </div>
                </div>
                <Glass
                  variant="card"
                  style={{ position: 'absolute', left: 24, top: 40, width: 160, height: 80 }}
                />
              </div>
              <Label>{name}</Label>
            </div>
          ))}
        </Row>
      </Section>
    </Page>
  );
}

// The real background is position:fixed; previews render it inside a box.
function AmbientPreview({ name }: { name: keyof typeof AMBIENTS }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }} className="kh-ambient-preview">
      <style>{`.kh-ambient-preview .kh-ambient{position:absolute}`}</style>
      <AmbientBackground ambient={name} />
    </div>
  );
}
