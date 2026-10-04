'use client';

import { useState } from 'react';
import { Button, Field, Input, Modal, Select, useConfirm, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { Page, Row, Section } from './Section';

export default function ModalDemo() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [env, setEnv] = useState('DEV');

  const askDelete = async () => {
    const ok = await confirm({
      title: 'Eliminar sistema?',
      body: 'O sistema BSD - DEV vai para o Lixo. Pode restaurá-lo durante 30 dias.',
      confirmLabel: t('del'),
      cancelLabel: t('ui_cancel'),
      danger: true,
    });
    toast({ message: ok ? 'Sistema eliminado.' : 'Cancelado.', tone: ok ? 'success' : 'info' });
  };

  return (
    <Page
      title="Modal e Confirmação"
      desc="Blur em camadas: o fundo desfoca (8px) e o painel tem o seu próprio vidro (40px). Uma confirmação por cima de um modal abre numa segunda camada, mais leve. Esc fecha só a camada de cima; o foco fica preso no diálogo e volta ao botão de origem."
    >
      <Section title="Exemplos">
        <Row>
          <Button variant="primary" onClick={() => setOpen(true)} data-demo="open-modal">
            Abrir modal
          </Button>
          <Button variant="danger-ghost" onClick={askDelete} data-demo="open-confirm">
            Confirmação (perigo)
          </Button>
          <Button
            variant="glass"
            onClick={async () => {
              const ok = await confirm({
                title: 'Terminar sessão?',
                body: 'Vai precisar de iniciar sessão novamente.',
                confirmLabel: t('ui_confirm'),
                cancelLabel: t('ui_cancel'),
              });
              if (ok) toast({ message: 'Sessão terminada.' });
            }}
          >
            Confirmação (normal)
          </Button>
        </Row>
      </Section>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Editar sistema"
        subtitle="Banco SOL · S/4HANA"
        closeLabel={t('ui_close')}
        footer={
          <>
            <Button
              variant="danger-ghost"
              onClick={askDelete}
              style={{ marginRight: 'auto' }}
              data-demo="stack-confirm"
            >
              {t('del')}
            </Button>
            <Button variant="glass" onClick={() => setOpen(false)}>
              {t('ui_cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setOpen(false);
                toast({ message: 'Alterações guardadas.', tone: 'success' });
              }}
            >
              {t('acc_save')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Nome">{({ id }) => <Input id={id} size="md" defaultValue="BSD - DEV" />}</Field>
          <Field label="SID">
            {({ id }) => (
              <Input id={id} size="md" defaultValue="BSD" style={{ fontFamily: 'var(--font-mono)' }} />
            )}
          </Field>
          <Field label="Servidor">{({ id }) => <Input id={id} size="md" defaultValue="172.16.23.1" />}</Field>
          <Field label="Ambiente">
            {({ id }) => (
              <Select
                id={id}
                value={env}
                onChange={setEnv}
                options={['DEV', 'QAS', 'PRD'].map((v) => ({ value: v, label: v }))}
                searchPlaceholder={t('ui_search')}
              />
            )}
          </Field>
        </div>
      </Modal>
    </Page>
  );
}
