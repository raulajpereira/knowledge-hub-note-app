'use client';

import { Button, IconButton, Icons } from '@/components/ui';
import { Label, Page, Row, Section } from './Section';

const VARIANTS = ['primary', 'glass', 'ghost', 'danger', 'danger-ghost', 'accent'] as const;

export default function Buttons() {
  return (
    <Page
      title="Botões"
      desc="Pílulas (raio 999px). Primário claro #fbf8f5 com texto #2a211c, como no Login e nos diálogos."
    >
      <Section title="Variantes">
        <Row>
          {VARIANTS.map((v) => (
            <Button key={v} variant={v}>
              {v === 'danger' || v === 'danger-ghost'
                ? 'Eliminar'
                : v === 'primary'
                  ? 'Guardar'
                  : v === 'accent'
                    ? 'Go PRO →'
                    : 'Cancelar'}
            </Button>
          ))}
        </Row>
      </Section>
      <Section title="Tamanhos e estados" note="sm 32px · md 42px · lg 46px (auth)">
        <Row>
          <Button variant="primary" size="sm">
            Pequeno
          </Button>
          <Button variant="primary">Médio</Button>
          <Button variant="primary" size="lg">
            Grande
          </Button>
          <Button variant="primary" loading>
            A guardar
          </Button>
          <Button variant="glass" disabled>
            Desativado
          </Button>
          <Button variant="glass" icon={<Icons.Plus />}>
            Nova Nota
          </Button>
        </Row>
        <div style={{ maxWidth: 420 }}>
          <Button variant="primary" size="lg" block>
            Entrar
          </Button>
        </div>
      </Section>
      <Section title="Botões de ícone" note="barra superior 40px · fechar 34px · acento / claro">
        <Row>
          <IconButton label="Notificações">
            <Icons.Bell />
          </IconButton>
          <IconButton label="Pesquisar">
            <Icons.Search />
          </IconButton>
          <IconButton label="Admin" tone="accent">
            <Icons.Info size={18} />
          </IconButton>
          <IconButton label="Bloquear" tone="light">
            <Icons.Lock />
          </IconButton>
          <IconButton label="Fechar" size="sm">
            <Icons.Close size={15} />
          </IconButton>
          <IconButton label="Grande" size="lg">
            <Icons.Plus />
          </IconButton>
          <IconButton label="Desativado" disabled>
            <Icons.Bell />
          </IconButton>
        </Row>
        <Label>Todos têm nome acessível (aria-label) e foco visível com a cor de destaque.</Label>
      </Section>
    </Page>
  );
}
