'use client';

import { useState } from 'react';
import { Button, Drawer, Field, Input, Select, Switch } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { Page, Row, Section } from './Section';

export default function DrawerDemo() {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [plan, setPlan] = useState('PRO');
  const [active, setActive] = useState(true);
  return (
    <Page
      title="Drawer Redimensionável"
      desc="Painel de detalhe à direita (Admin Console). Pega na borda esquerda: arrastar ajusta a largura (320–760px), duplo clique repõe, setas ← → também funcionam com foco na pega. Largura memorizada."
    >
      <div style={{ display: 'flex', gap: 20, alignItems: 'stretch', minHeight: 560 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Section title="Conteúdo principal">
            <Row>
              <Button variant="glass" onClick={() => setOpen((o) => !o)} data-demo="toggle-drawer">
                {open ? 'Fechar drawer' : 'Abrir drawer'}
              </Button>
            </Row>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>
              A lista fica à esquerda e encolhe quando o drawer cresce.
            </p>
          </Section>
        </div>
        {open && (
          <Drawer
            storageKey="ui-demo"
            title="Banco SOL"
            subtitle="Empresa · cliente desde 03/06/2026 · 240 €/mês"
            onClose={() => setOpen(false)}
            closeLabel={t('ui_close')}
            resizeLabel={t('ui_resizeHint')}
          >
            <Field label="Pacote">
              {({ id }) => (
                <Select
                  id={id}
                  value={plan}
                  onChange={setPlan}
                  options={['FREE', 'PRO', 'DEVELOPER', 'SAP', 'MANAGEMENT', 'ULTRA'].map((p) => ({
                    value: p,
                    label: p,
                  }))}
                  searchPlaceholder={t('ui_search')}
                />
              )}
            </Field>
            <Field label="Lugares">
              {({ id }) => <Input id={id} size="md" type="number" defaultValue={8} />}
            </Field>
            <Field label="Renovação">
              {({ id }) => (
                <Input
                  id={id}
                  size="md"
                  type="date"
                  defaultValue="2027-06-03"
                  style={{ colorScheme: 'dark' }}
                />
              )}
            </Field>
            <Row gap={12}>
              <Switch checked={active} onChange={setActive} label="Ativo" />
              <span style={{ fontSize: 14 }}>Ativo</span>
            </Row>
            <Row>
              <Button variant="primary">{t('acc_save')}</Button>
              <Button variant="danger-ghost">Revogar código</Button>
            </Row>
          </Drawer>
        )}
      </div>
    </Page>
  );
}
