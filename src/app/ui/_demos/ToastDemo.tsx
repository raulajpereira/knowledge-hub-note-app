'use client';

import { Button, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { Page, Row, Section } from './Section';

export default function ToastDemo() {
  const toast = useToast();
  const { t } = useI18n();
  return (
    <Page
      title="Toasts"
      desc="Pílula de vidro ao fundo, ao centro. Não existe nos protótipos como componente — estilizado a partir do menu de vidro. Erros ficam 6 s, os restantes 3 s; máximo de 4 visíveis; aria-live para leitores de ecrã."
    >
      <Section title="Tipos">
        <Row>
          <Button variant="glass" onClick={() => toast({ message: t('copied') })} data-demo="toast-info">
            Info
          </Button>
          <Button
            variant="glass"
            onClick={() => toast({ message: 'Nota guardada.', tone: 'success' })}
            data-demo="toast-success"
          >
            Sucesso
          </Button>
          <Button
            variant="glass"
            onClick={() => toast({ message: 'A licença expira em 7 dias.', tone: 'warning' })}
            data-demo="toast-warning"
          >
            Aviso
          </Button>
          <Button
            variant="glass"
            onClick={() => toast({ message: 'Não foi possível guardar. Tente novamente.', tone: 'error' })}
            data-demo="toast-error"
          >
            Erro
          </Button>
        </Row>
      </Section>
    </Page>
  );
}
