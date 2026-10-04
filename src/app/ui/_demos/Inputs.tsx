'use client';

import { useState } from 'react';
import { Button, Checkbox, Field, Glass, Input, PasswordInput, SearchInput, Textarea } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { Page, Section } from './Section';

export default function Inputs() {
  const { t } = useI18n();
  const [email, setEmail] = useState('raul@');
  const [remember, setRemember] = useState(true);
  return (
    <Page
      title="Campos de Texto"
      desc="Grande (46px, raio 14) nas páginas de autenticação; compacto (38px, raio 12) em painéis, drawers e Definições. Foco: contorno rgba(255,255,255,.45); erro: #ffc9b8."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 20 }}>
        <Section title="Autenticação (lg)">
          <Field label="Email" error={email.includes('.') ? undefined : 'Indique um email válido.'}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="nome@empresa.pt"
              />
            )}
          </Field>
          <Field label="Password">
            {({ id }) => (
              <PasswordInput
                id={id}
                toggleLabel={t('ui_showHidePassword')}
                placeholder="••••••••"
                defaultValue="segredo-123"
              />
            )}
          </Field>
          <Field label="Licença" hint="KH-INV-###### ou KH-LIC-######">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                placeholder="KH-LIC-000000"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            )}
          </Field>
        </Section>
        <Section title="Compacto (md)">
          <Field label="Nome do sistema">
            {({ id }) => <Input id={id} size="md" defaultValue="BSD - DEV" />}
          </Field>
          <Field label="Servidor" error="Campo obrigatório.">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                size="md"
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="172.16.23.1"
              />
            )}
          </Field>
          <Field label="Desativado">
            {({ id }) => <Input id={id} size="md" disabled defaultValue="Só leitura" />}
          </Field>
          <Field label="Notas">
            {({ id }) => <Textarea id={id} size="md" placeholder="Escreva aqui…" />}
          </Field>
        </Section>
      </div>
      <Section
        title="Composição: cartão de Login"
        note="só com componentes da Fase 1 — comparação com Login.dc.html"
      >
        <Glass
          as="form"
          variant="panel"
          data-demo="login-card"
          onSubmit={(e) => e.preventDefault()}
          style={{
            width: 420,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            padding: 34,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em' }}>Bem-vindo de volta</span>
            <span style={{ fontSize: 14, color: 'rgba(255,248,240,.75)' }}>
              Inicie sessão no KnowledgeHub
            </span>
          </div>
          <Field label="Email">
            {({ id }) => <Input id={id} type="email" placeholder="nome@empresa.pt" />}
          </Field>
          <Field label="Password">
            {({ id }) => (
              <PasswordInput id={id} toggleLabel={t('ui_showHidePassword')} placeholder="••••••••" />
            )}
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Checkbox checked={remember} onChange={setRemember}>
              Lembrar-me
            </Checkbox>
            <a href="#" style={{ marginLeft: 'auto', fontSize: 13, color: 'rgba(255,248,240,.82)' }}>
              Esqueceu-se da password?
            </a>
          </div>
          <Button type="submit" variant="primary" size="lg" block>
            Entrar
          </Button>
          <span style={{ textAlign: 'center', fontSize: 13.5, color: 'rgba(255,248,240,.78)' }}>
            Ainda não tem conta?{' '}
            <a href="#" style={{ color: '#fbf8f5', fontWeight: 600 }}>
              Criar conta
            </a>
          </span>
        </Glass>
      </Section>
      <Section title="Pesquisa (barra superior)">
        <SearchInput placeholder={t('search')} style={{ maxWidth: 250 }} />
      </Section>
    </Page>
  );
}
