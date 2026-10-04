'use client';

import { useMemo, useState } from 'react';
import { Chip, ResizableTable, Tag, type Column, type SortState } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { Page, Row, Section } from './Section';
import { ENV_COLOR, SYSTEMS, type SysRow } from './systems';

export default function TableDemo() {
  const { t } = useI18n();
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const [sel, setSel] = useState<string | null>('s2');
  const [client, setClient] = useState('all');

  const columns = useMemo<Column<SysRow>[]>(
    () => [
      {
        key: 'name',
        label: t('s_system'),
        width: 200,
        sortable: true,
        render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span>,
      },
      {
        key: 'customer',
        label: t('s_customer'),
        width: 160,
        sortable: true,
        render: (r) => <span style={{ color: 'rgba(255,248,240,.82)' }}>{r.customer}</span>,
      },
      {
        key: 'sid',
        label: 'SID',
        width: 90,
        sortable: true,
        render: (r) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{r.sid}</span>,
      },
      {
        key: 'env',
        label: t('s_env'),
        width: 110,
        sortable: true,
        render: (r) => (
          <Tag
            shape="code"
            bg={ENV_COLOR[r.env].replace(')', ' / .26)')}
            style={{ boxShadow: `0 0 14px ${ENV_COLOR[r.env].replace(')', ' / .35)')}` }}
          >
            {r.env}
          </Tag>
        ),
      },
      {
        key: 'host',
        label: t('s_host'),
        width: 150,
        render: (r) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{r.host}</span>,
      },
      {
        key: 'mandt',
        label: t('s_mandt'),
        width: 100,
        render: (r) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{r.mandt}</span>,
      },
      { key: 'type', label: t('s_type'), width: 200, grow: true, render: (r) => r.type },
    ],
    [t],
  );

  const rows = useMemo(() => {
    const filtered = SYSTEMS.filter((s) => client === 'all' || s.customer === client);
    if (!sort) return filtered;
    const k = sort.key as keyof SysRow;
    return [...filtered].sort(
      (a, b) => String(a[k]).localeCompare(String(b[k])) * (sort.dir === 'asc' ? 1 : -1),
    );
  }, [client, sort]);

  return (
    <Page
      title="Tabela Redimensionável"
      desc="Grelha CSS (cabeçalho e linhas alinham sempre). Arraste a borda de um cabeçalho para ajustar a coluna (mín. 40px), duplo clique repõe; larguras memorizadas por tabela. Cabeçalho de vidro fixo; clique nos títulos ordena."
    >
      <Section title="Sistemas SAP" note={t('ui_resizeHint')}>
        <Row gap={8}>
          {['all', 'Banco SOL', 'Grupo ID'].map((c) => (
            <Chip
              key={c}
              selected={client === c}
              count={c === 'all' ? SYSTEMS.length : SYSTEMS.filter((s) => s.customer === c).length}
              onClick={() => setClient(c)}
            >
              {c === 'all' ? t('s_allClients') : c}
            </Chip>
          ))}
        </Row>
        <ResizableTable
          id="ui-demo-systems"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          selectedKey={sel}
          onRowClick={(r) => setSel(r.id)}
          sort={sort}
          onSortChange={setSort}
          emptyLabel={t('s_empty')}
          resizeLabel={t('ui_resizeHint')}
          minWidth={1010}
        />
      </Section>
      <Section title="Vazio">
        <ResizableTable
          id="ui-demo-empty"
          columns={columns.slice(0, 4)}
          rows={[]}
          rowKey={(r) => r.id}
          emptyLabel={t('s_empty')}
          resizeLabel={t('ui_resizeHint')}
        />
      </Section>
    </Page>
  );
}
