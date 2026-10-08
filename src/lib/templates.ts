// Modelos: ready-made SAP templates (meeting records, Functional records,
// project phases) and the person's own saved ones. Shared by the client (the
// picker, applying a template) and the server (validating a saved one).
import { z } from 'zod';
import { FN, FN_PAGES, fnSchemas, type FnPage, type FnRow } from './functional';

export const TPL_KINDS = ['meeting', ...FN_PAGES, 'project'] as const;
export type TplKind = (typeof TPL_KINDS)[number];

export type MeetingTpl = {
  title: string;
  participants: string[];
  topics: string;
  review: string[];
  todos: string[];
};
export type FnTpl = { title: string; code: string; f: Record<string, string>; rows: FnRow[] };
/** Consecutive phases from the project's first week. */
export type ProjectTpl = { phases: Array<{ name: string; weeks: number }> };
export type TplBody = MeetingTpl | FnTpl | ProjectTpl;

export type Tpl = { id: string; kind: TplKind; name: string; desc?: string; body: TplBody; own?: boolean };

/** The module whose data a template of this kind fills (the routes check it). */
export const tplModule = (k: TplKind) => (k === 'project' ? 'mg_projects' : k === 'meeting' ? 'meetings' : k);

// ── Validation of a saved template ───────────────────────────────────────────
const line = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[^\r\n]*$/);
const MeetingBody = z.strictObject({
  title: line(300),
  participants: z.array(z.string().trim().min(1).max(120)).max(100),
  topics: z.string().max(100_000),
  review: z.array(z.string().max(2000)).max(200),
  todos: z.array(z.string().max(2000)).max(200),
});
const ProjectBody = z.strictObject({
  phases: z
    .array(
      z.strictObject({ name: z.string().trim().min(1).max(120), weeks: z.number().int().min(1).max(104) }),
    )
    .min(1)
    .max(60),
});
/** Fields a Functional template keeps: text, selects and notes — never a client, project, person, number or date. */
export const fnTplFields = (page: FnPage) =>
  FN[page].fields.filter((f) => ['mod', 'sel', 'text', 'area'].includes(f.type)).map((f) => f.k);
function fnBody(page: FnPage) {
  const S = fnSchemas(page);
  return z
    .strictObject({ title: line(300), code: line(120), f: z.record(z.string(), z.string()), rows: S.rows })
    .refine(
      (b) => Object.keys(b.f).every((k) => fnTplFields(page).includes(k)) && S.f.safeParse(b.f).success,
      'invalid fields',
    );
}
export function tplBodySchema(kind: TplKind): z.ZodType<TplBody> {
  if (kind === 'meeting') return MeetingBody;
  if (kind === 'project') return ProjectBody;
  return fnBody(kind) as unknown as z.ZodType<TplBody>;
}

/** A Functional record as a template: shareable fields only, row results back to "to do". */
export function fnToTpl(
  page: FnPage,
  r: { title: string; code: string; f: Record<string, unknown>; rows: FnRow[] },
): FnTpl {
  const keep = fnTplFields(page);
  const f: Record<string, string> = {};
  for (const k of keep) if (typeof r.f[k] === 'string' && r.f[k]) f[k] = r.f[k] as string;
  const rst = FN[page].rows.cols.filter((c) => c[2] === 'rst').map((c) => c[0]);
  return {
    title: r.title,
    code: r.code,
    f,
    rows: r.rows.map((row) => ({ ...row, ...Object.fromEntries(rst.map((k) => [k, 'todo'])) })),
  };
}

// ── Ready-made templates ─────────────────────────────────────────────────────
type B = {
  id: string;
  kind: TplKind;
  name: [string, string];
  desc: [string, string];
  body: (en: boolean) => TplBody;
};
const lines = (s: string) =>
  s
    .trim()
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
/** Rows from "a | b | c" lines, in the order of the page's text columns. */
function rows(page: FnPage, s: string): FnRow[] {
  const cols = FN[page].rows.cols;
  const text = cols.filter((c) => c[2] === 'text').map((c) => c[0]);
  return lines(s).map((l) => {
    const parts = l.split('|').map((x) => x.trim());
    const r: FnRow = {};
    for (const c of cols) r[c[0]] = c[2] === 'rst' ? 'todo' : '';
    text.forEach((k, i) => (r[k] = parts[i] ?? ''));
    return r;
  });
}

const BUILTIN: B[] = [
  // Registos Reuniões
  {
    id: 'b:steering',
    kind: 'meeting',
    name: ['Comité de Direção (Steering)', 'Steering Committee'],
    desc: ['Estado RAG, marcos, riscos e decisões', 'RAG status, milestones, risks and decisions'],
    body: (en) =>
      en
        ? {
            title: 'Steering Committee',
            participants: ['Project sponsor', 'Client project manager', 'Partner project manager'],
            topics: `1. Overall status (RAG: scope, schedule, budget, quality)
2. Milestones reached since the last committee
3. Current SAP Activate phase and next milestones
4. Escalated risks and issues
5. Change requests for decision
6. Decisions taken
7. Next committee`,
            review: [
              'Updated plan and milestones',
              'Risk register (top 5)',
              'Pending change requests',
              'Budget consumption vs. plan',
            ],
            todos: [
              'Send the minutes and decisions to the attendees',
              'Update the risk and decision logs',
              'Schedule the next committee',
            ],
          }
        : {
            title: 'Comité de Direção',
            participants: [
              'Sponsor do projeto',
              'Gestor de projeto (cliente)',
              'Gestor de projeto (parceiro)',
            ],
            topics: `1. Estado geral (RAG: âmbito, prazo, orçamento, qualidade)
2. Marcos atingidos desde o último comité
3. Fase SAP Activate atual e próximos marcos
4. Riscos e problemas escalados
5. Pedidos de alteração para decisão
6. Decisões tomadas
7. Próximo comité`,
            review: [
              'Plano e marcos atualizados',
              'Registo de riscos (top 5)',
              'Pedidos de alteração pendentes',
              'Consumo do orçamento vs. planeado',
            ],
            todos: [
              'Enviar a ata e as decisões aos participantes',
              'Atualizar o registo de riscos e de decisões',
              'Agendar o próximo comité',
            ],
          },
  },
  {
    id: 'b:workshop',
    kind: 'meeting',
    name: ['Workshop Fit-to-Standard', 'Fit-to-Standard Workshop'],
    desc: [
      'Fase Explore: demo standard, gaps e decisões',
      'Explore phase: standard demo, gaps and decisions',
    ],
    body: (en) =>
      en
        ? {
            title: 'Fit-to-Standard Workshop — ',
            participants: ['Key user', 'Functional consultant', 'Process owner'],
            topics: `Process / scope item:
Objective and scope of the session:

Standard SAP demo (Best Practices):
-

Delta requirements (gaps):
-

Master and organisational data:
Integrations, reports and forms:
Authorisations / roles:`,
            review: ['Scope items shown', 'Open design decisions', 'Gaps without an agreed solution'],
            todos: [
              'Log the delta requirements in the backlog',
              'Confirm open decisions with the process owner',
              'Update the design document (BPD)',
              'Prepare the next session',
            ],
          }
        : {
            title: 'Workshop Fit-to-Standard — ',
            participants: ['Key user', 'Consultor funcional', 'Dono do processo'],
            topics: `Processo / scope item:
Objetivo e âmbito da sessão:

Demo do standard SAP (Best Practices):
-

Requisitos delta (gaps):
-

Dados mestre e organizacionais:
Integrações, relatórios e formulários:
Autorizações / perfis:`,
            review: [
              'Scope items demonstrados',
              'Decisões de desenho em aberto',
              'Gaps sem solução acordada',
            ],
            todos: [
              'Registar os requisitos delta no backlog',
              'Validar as decisões em aberto com o dono do processo',
              'Atualizar o documento de desenho (BPD)',
              'Preparar a próxima sessão',
            ],
          },
  },
  {
    id: 'b:daily',
    kind: 'meeting',
    name: ['Daily / Stand-up', 'Daily / Stand-up'],
    desc: ['Ontem, hoje e bloqueios', 'Yesterday, today and blockers'],
    body: (en) =>
      en
        ? {
            title: 'Daily',
            participants: [],
            topics: `Yesterday:
-

Today:
-

Blockers:
-`,
            review: ['Open blockers', 'Critical defects'],
            todos: ['Remove the blockers raised'],
          }
        : {
            title: 'Daily',
            participants: [],
            topics: `Ontem:
-

Hoje:
-

Bloqueios:
-`,
            review: ['Bloqueios em aberto', 'Defeitos críticos'],
            todos: ['Resolver os bloqueios identificados'],
          },
  },
  {
    id: 'b:gonogo',
    kind: 'meeting',
    name: ['Go / No-Go', 'Go / No-Go'],
    desc: ['Critérios de entrada em produção', 'Go-live entry criteria'],
    body: (en) =>
      en
        ? {
            title: 'Go / No-Go',
            participants: ['Project sponsor', 'Project managers', 'Business leads', 'Basis / IT lead'],
            topics: `Criteria:
1. UAT closed and signed off (no open critical/high defects)
2. Final data loads rehearsed and reconciled (mock results)
3. Production system ready (transports, manual configuration, jobs, interfaces)
4. Users trained, roles assigned in production
5. Support model and hypercare team in place
6. Cutover plan and rollback plan approved

Decision:`,
            review: ['Open defects by priority', 'Mock cutover results', 'Rollback plan'],
            todos: ['Communicate the decision', 'Start the cutover runbook'],
          }
        : {
            title: 'Go / No-Go',
            participants: [
              'Sponsor do projeto',
              'Gestores de projeto',
              'Responsáveis de negócio',
              'Responsável Basis / TI',
            ],
            topics: `Critérios:
1. UAT concluído e aprovado (sem defeitos críticos/altos em aberto)
2. Cargas finais ensaiadas e reconciliadas (resultados dos mocks)
3. Produção pronta (transportes, configuração manual, jobs, interfaces)
4. Utilizadores formados, perfis atribuídos em produção
5. Modelo de suporte e equipa de hypercare definidos
6. Plano de cutover e plano de rollback aprovados

Decisão:`,
            review: [
              'Defeitos em aberto por prioridade',
              'Resultados do ensaio de cutover',
              'Plano de rollback',
            ],
            todos: ['Comunicar a decisão', 'Arrancar o runbook de cutover'],
          },
  },

  // Funcional — Cutover
  {
    id: 'b:cut-runbook',
    kind: 'fn_cut',
    name: ['Runbook de cutover S/4HANA', 'S/4HANA cutover runbook'],
    desc: ['Pré-cutover, fim de semana de cutover e hypercare', 'Pre-cutover, cutover weekend and hypercare'],
    body: (en) => ({
      title: en ? 'Cutover runbook' : 'Runbook de cutover',
      code: en ? 'Go-live' : 'Go-live',
      f: {
        desc: en
          ? 'T-n = days before go-live (T-0). Each activity has an owner and is ticked during the cutover call.'
          : 'T-n = dias antes do go-live (T-0). Cada atividade tem um responsável e é marcada durante a chamada de cutover.',
      },
      rows: rows(
        'fn_cut',
        en
          ? `[Pre] Development freeze | T-21 | Technical lead
[Pre] Final transports to production approved and imported | T-14 | Basis
[Pre] Manual (non-transportable) configuration in production | T-10 | Functional team
[Pre] Users and roles created in production | T-7 | Security
[Pre] Static master data loaded (business partners, materials, assets) | T-7 | Data migration
[Pre] Cutover communication to users | T-5 | PMO
[Pre] Go / No-Go decision | T-2 | Steering
[Cutover] Legacy system closed for postings | T-0 18:00 | Business
[Cutover] Period close in legacy | T-0 | Finance
[Cutover] Extract balances and open items | T-0 | Data migration
[Cutover] Load G/L balances | T+1 | Data migration
[Cutover] Load open items (customers / suppliers) | T+1 | Data migration
[Cutover] Load stock quantities and values | T+1 | Data migration
[Cutover] Financial reconciliation legacy vs. S/4HANA | T+1 | Finance
[Cutover] Key users validate and sign off | T+1 | Business
[Cutover] Open posting periods, number ranges checked | T+1 | Finance
[Cutover] Background jobs scheduled (SM36) and interfaces on | T+1 | Basis
[Cutover] System opened to users | T+2 08:00 | PMO
[Hypercare] Daily monitoring (ST22, SM21, SM58, IDocs) | T+2 → T+30 | Basis
[Hypercare] Daily defects triage | T+2 → T+30 | PMO
[Hypercare] First month-end close supported | T+30 | Finance
[Hypercare] Hand over to support (AMS) | T+30 | PMO`
          : `[Pré] Congelamento de desenvolvimentos | T-21 | Lead técnico
[Pré] Transportes finais para produção aprovados e importados | T-14 | Basis
[Pré] Configuração manual (não transportável) em produção | T-10 | Equipa funcional
[Pré] Utilizadores e perfis criados em produção | T-7 | Segurança
[Pré] Carga de dados mestre estáticos (parceiros, materiais, ativos) | T-7 | Migração
[Pré] Comunicação do cutover aos utilizadores | T-5 | PMO
[Pré] Decisão Go / No-Go | T-2 | Steering
[Cutover] Fecho do sistema legado a lançamentos | T-0 18:00 | Negócio
[Cutover] Fecho de período no legado | T-0 | Finanças
[Cutover] Extração de saldos e itens em aberto | T-0 | Migração
[Cutover] Carga de saldos do razão | T+1 | Migração
[Cutover] Carga de itens em aberto (clientes / fornecedores) | T+1 | Migração
[Cutover] Carga de quantidades e valores de stock | T+1 | Migração
[Cutover] Reconciliação financeira legado vs. S/4HANA | T+1 | Finanças
[Cutover] Validação e aprovação pelos key users | T+1 | Negócio
[Cutover] Abertura de períodos e verificação de intervalos de numeração | T+1 | Finanças
[Cutover] Jobs agendados (SM36) e interfaces ativas | T+1 | Basis
[Cutover] Sistema aberto aos utilizadores | T+2 08:00 | PMO
[Hypercare] Monitorização diária (ST22, SM21, SM58, IDocs) | T+2 → T+30 | Basis
[Hypercare] Triagem diária de defeitos | T+2 → T+30 | PMO
[Hypercare] Primeiro fecho mensal acompanhado | T+30 | Finanças
[Hypercare] Passagem ao suporte (AMS) | T+30 | PMO`,
      ),
    }),
  },
  {
    id: 'b:cut-basis',
    kind: 'fn_cut',
    name: ['Checklist técnica de go-live (Basis)', 'Technical go-live checklist (Basis)'],
    desc: ['Sistema, segurança, jobs e monitorização', 'System, security, jobs and monitoring'],
    body: (en) => ({
      title: en ? 'Technical go-live checklist' : 'Checklist técnica de go-live',
      code: 'Basis',
      f: {},
      rows: rows(
        'fn_cut',
        en
          ? `Production client settings locked (SCC4) | T-1 | Basis
System change option closed (SE06) | T-1 | Basis
Backup taken before data loads | T-0 | Basis
RFC destinations and logical systems checked (SM59, BD54) | T-0 | Basis
Output devices and spool (SPAD) | T-0 | Basis
Background jobs scheduled (SM36 / SM37) | T+1 | Basis
Emergency users (firefighter) ready | T+1 | Security
Monitoring on: ST22, SM21, SM12, SM13, SM58, WE05 | T+1 | Basis
Backup after go-live | T+1 | Basis`
          : `Definições do mandante de produção bloqueadas (SCC4) | T-1 | Basis
Opção de modificação do sistema fechada (SE06) | T-1 | Basis
Backup antes das cargas de dados | T-0 | Basis
Destinos RFC e sistemas lógicos verificados (SM59, BD54) | T-0 | Basis
Dispositivos de saída e spool (SPAD) | T-0 | Basis
Jobs agendados (SM36 / SM37) | T+1 | Basis
Utilizadores de emergência (firefighter) prontos | T+1 | Segurança
Monitorização ativa: ST22, SM21, SM12, SM13, SM58, WE05 | T+1 | Basis
Backup depois do go-live | T+1 | Basis`,
      ),
    }),
  },

  // Funcional — Migração de Dados
  {
    id: 'b:mig-bp-cust',
    kind: 'fn_mig',
    name: ['Parceiro de negócio — Cliente', 'Business partner — Customer'],
    desc: [
      'Migration Cockpit: dados gerais, empresa e vendas',
      'Migration Cockpit: general, company code and sales data',
    ],
    body: (en) => ({
      title: en ? 'Customers (business partner)' : 'Clientes (parceiro de negócio)',
      code: 'BP-CUST',
      f: {
        module: 'SD',
        tool: 'Migration Cockpit',
        rules: en
          ? 'Remove duplicates (same tax number). Only customers with movements in the last 24 months or open items. Validate tax numbers and postcodes. Map payment terms and account groups with the mapping tables.'
          : 'Eliminar duplicados (mesmo NIF). Só clientes com movimentos nos últimos 24 meses ou com itens em aberto. Validar NIF e códigos postais. Converter condições de pagamento e grupos de contas pelas tabelas de correspondência.',
      },
      rows: rows(
        'fn_mig',
        en
          ? `KUNNR | BUT000-PARTNER | Keep legacy number or map old → new
NAME1 / NAME2 | BUT000-NAME_ORG1 / NAME_ORG2 | Trim, max 40 characters
STRAS | ADRC-STREET / HOUSE_NUM1 | Split street and number
PSTLZ | ADRC-POST_CODE1 | Country format (PT: 9999-999)
ORT01 | ADRC-CITY1 |
LAND1 | ADRC-COUNTRY | ISO code
STCD1 | DFKKBPTAXNUM-TAXNUM | Tax number; check digit
AKONT | KNB1-AKONT | Reconciliation account by account group
ZTERM | KNB1-ZTERM / KNVV-ZTERM | Payment terms mapping table
VKORG / VTWEG / SPART | KNVV | Sales area per customer`
          : `KUNNR | BUT000-PARTNER | Manter o número legado ou mapear antigo → novo
NAME1 / NAME2 | BUT000-NAME_ORG1 / NAME_ORG2 | Remover espaços, máx. 40 caracteres
STRAS | ADRC-STREET / HOUSE_NUM1 | Separar rua e número
PSTLZ | ADRC-POST_CODE1 | Formato do país (PT: 9999-999)
ORT01 | ADRC-CITY1 |
LAND1 | ADRC-COUNTRY | Código ISO
STCD1 | DFKKBPTAXNUM-TAXNUM | NIF; validar dígito de controlo
AKONT | KNB1-AKONT | Conta de reconciliação por grupo de contas
ZTERM | KNB1-ZTERM / KNVV-ZTERM | Tabela de correspondência das condições de pagamento
VKORG / VTWEG / SPART | KNVV | Área de vendas por cliente`,
      ),
    }),
  },
  {
    id: 'b:mig-material',
    kind: 'fn_mig',
    name: ['Material', 'Material'],
    desc: [
      'Dados básicos, centro, depósito e avaliação',
      'Basic, plant, storage location and valuation data',
    ],
    body: (en) => ({
      title: en ? 'Material master' : 'Mestre de materiais',
      code: 'MATERIAL',
      f: {
        module: 'MM',
        tool: 'Migration Cockpit',
        rules: en
          ? 'Only active materials (stock, open orders or movements in the last 24 months). Harmonise units of measure and material groups. Valuation class by material type.'
          : 'Só materiais ativos (stock, encomendas em aberto ou movimentos nos últimos 24 meses). Harmonizar unidades de medida e grupos de mercadorias. Classe de avaliação pelo tipo de material.',
      },
      rows: rows(
        'fn_mig',
        en
          ? `MATNR | MARA-MATNR | Keep number or map; 40 characters in S/4HANA
MAKTX | MAKT-MAKTX | Description per language
MTART | MARA-MTART | Material type mapping
MEINS | MARA-MEINS | Base unit of measure (ISO)
MATKL | MARA-MATKL | Material group mapping
WERKS | MARC-WERKS | Plant mapping
LGORT | MARD-LGORT | Storage location mapping
BKLAS | MBEW-BKLAS | Valuation class by material type
VPRSV / VERPR / STPRS | MBEW | Price control and price`
          : `MATNR | MARA-MATNR | Manter o número ou mapear; 40 caracteres em S/4HANA
MAKTX | MAKT-MAKTX | Descrição por idioma
MTART | MARA-MTART | Correspondência do tipo de material
MEINS | MARA-MEINS | Unidade de medida base (ISO)
MATKL | MARA-MATKL | Correspondência do grupo de mercadorias
WERKS | MARC-WERKS | Correspondência do centro
LGORT | MARD-LGORT | Correspondência do depósito
BKLAS | MBEW-BKLAS | Classe de avaliação pelo tipo de material
VPRSV / VERPR / STPRS | MBEW | Controlo de preço e preço`,
      ),
    }),
  },
  {
    id: 'b:mig-fi-open',
    kind: 'fn_mig',
    name: ['Saldos e itens em aberto (FI)', 'Balances and open items (FI)'],
    desc: [
      'Razão, clientes e fornecedores à data de corte',
      'G/L, customers and suppliers at the cut-off date',
    ],
    body: (en) => ({
      title: en ? 'G/L balances and open items' : 'Saldos do razão e itens em aberto',
      code: 'FI-OPEN',
      f: {
        module: 'FI',
        tool: 'Migration Cockpit',
        rules: en
          ? 'Cut-off date = last day of the closed period. Balances against the migration clearing account, which must end at zero. Reconcile totals per account and per partner with the legacy trial balance.'
          : 'Data de corte = último dia do período fechado. Saldos contra a conta de transição da migração, que tem de ficar a zero. Reconciliar totais por conta e por parceiro com o balancete do legado.',
      },
      rows: rows(
        'fn_mig',
        en
          ? `Legacy account | ACDOCA-RACCT | Chart of accounts mapping table
Cost / profit centre | ACDOCA-RCNTR / PRCTR | Mapping table
Customer number | BSEG-KUNNR | Via the business partner mapping
Supplier number | BSEG-LIFNR | Via the business partner mapping
Document date / due date | BKPF-BLDAT / BSEG-ZFBDT | Keep original due dates
Amount and currency | BSEG-WRBTR / WAERS | Document currency and local currency
Tax code | BSEG-MWSKZ | Tax code mapping`
          : `Conta legada | ACDOCA-RACCT | Tabela de correspondência do plano de contas
Centro de custo / lucro | ACDOCA-RCNTR / PRCTR | Tabela de correspondência
Número de cliente | BSEG-KUNNR | Pela correspondência dos parceiros
Número de fornecedor | BSEG-LIFNR | Pela correspondência dos parceiros
Data do documento / vencimento | BKPF-BLDAT / BSEG-ZFBDT | Manter os vencimentos originais
Montante e moeda | BSEG-WRBTR / WAERS | Moeda do documento e moeda interna
Código de IVA | BSEG-MWSKZ | Correspondência dos códigos de IVA`,
      ),
    }),
  },
  {
    id: 'b:mig-assets',
    kind: 'fn_mig',
    name: ['Ativos fixos', 'Fixed assets'],
    desc: ['Mestre e valores acumulados (FI-AA)', 'Master data and accumulated values (FI-AA)'],
    body: (en) => ({
      title: en ? 'Fixed assets' : 'Ativos fixos',
      code: 'FI-AA',
      f: {
        module: 'FI',
        tool: 'Migration Cockpit',
        rules: en
          ? 'Acquisition value and accumulated depreciation per depreciation area at the transfer date. Reconcile with the legacy asset register and the G/L.'
          : 'Valor de aquisição e amortização acumulada por área de avaliação à data de transferência. Reconciliar com o registo de ativos do legado e com o razão.',
      },
      rows: rows(
        'fn_mig',
        en
          ? `Asset number | ANLA-ANLN1 / ANLN2 | Internal numbering; keep the legacy number in the inventory number
Asset class | ANLA-ANLKL | Asset class mapping
Capitalisation date | ANLA-AKTIV |
Cost centre | ANLZ-KOSTL | Mapping table
Acquisition value | Transfer values (APC) | Per depreciation area
Accumulated depreciation | Transfer values | Per depreciation area
Useful life | ANLB-NDJAR / NDPER | Remaining life checked`
          : `Número do ativo | ANLA-ANLN1 / ANLN2 | Numeração interna; número legado no nº de inventário
Classe do ativo | ANLA-ANLKL | Correspondência das classes
Data de capitalização | ANLA-AKTIV |
Centro de custo | ANLZ-KOSTL | Tabela de correspondência
Valor de aquisição | Valores de transferência (APC) | Por área de avaliação
Amortização acumulada | Valores de transferência | Por área de avaliação
Vida útil | ANLB-NDJAR / NDPER | Verificar a vida restante`,
      ),
    }),
  },
  {
    id: 'b:mig-hcm',
    kind: 'fn_mig',
    name: ['Colaboradores (HCM)', 'Employees (HCM)'],
    desc: ['Infotipos base de administração de pessoal', 'Core personnel administration infotypes'],
    body: (en) => ({
      title: en ? 'Employees (personnel administration)' : 'Colaboradores (administração de pessoal)',
      code: 'PA',
      f: {
        module: 'HCM',
        tool: 'LSMW',
        rules: en
          ? 'Active employees and those who left this year (for year-end reporting). Personal data is confidential: limit access to the load files and delete them after validation.'
          : 'Colaboradores ativos e os que saíram este ano (para as declarações anuais). Dados pessoais confidenciais: limitar o acesso aos ficheiros de carga e apagá-los após a validação.',
      },
      rows: rows(
        'fn_mig',
        en
          ? `Employee number | PERNR | Keep legacy number if possible
Hiring / actions | IT0000 | Action type and reason mapping
Organisational assignment | IT0001 | Company code, personnel area, cost centre, position
Personal data | IT0002 | Name, date of birth, nationality
Address | IT0006 |
Basic pay | IT0008 | Pay scale and wage types mapping
Bank details | IT0009 | IBAN validated
Tax data (PT) | IT0331 / IT0332 | Country-specific`
          : `Número de colaborador | PERNR | Manter o número legado se possível
Admissão / medidas | IT0000 | Correspondência do tipo e motivo da medida
Atribuição organizacional | IT0001 | Empresa, área de pessoal, centro de custo, posição
Dados pessoais | IT0002 | Nome, data de nascimento, nacionalidade
Morada | IT0006 |
Remuneração base | IT0008 | Tabela salarial e rubricas
Dados bancários | IT0009 | IBAN validado
Dados fiscais (PT) | IT0331 / IT0332 | Específico do país`,
      ),
    }),
  },

  // Funcional — Processos
  {
    id: 'b:proc-o2c',
    kind: 'fn_proc',
    name: ['Order-to-Cash', 'Order-to-Cash'],
    desc: ['Da encomenda ao recebimento', 'From sales order to payment'],
    body: (en) => ({
      title: 'Order-to-Cash',
      code: 'O2C',
      f: { module: 'SD', area: en ? 'Standard sale' : 'Venda standard' },
      rows: rows(
        'fn_proc',
        en
          ? `Create sales order | VA01 / Manage Sales Orders | Sales clerk | Credit check and availability
Create outbound delivery | VL01N | Warehouse | Picking
Post goods issue | VL02N | Warehouse | Stock and COGS posting
Create billing document | VF01 / Create Billing Documents | Billing clerk | Accounting document created
Post incoming payment | F-28 / Post Incoming Payments | Accounts receivable | Clears the open item`
          : `Criar encomenda de venda | VA01 / Manage Sales Orders | Comercial | Verificação de crédito e disponibilidade
Criar entrega | VL01N | Armazém | Picking
Registar saída de mercadorias | VL02N | Armazém | Lançamento de stock e CMVMC
Criar fatura | VF01 / Create Billing Documents | Faturação | Gera o documento contabilístico
Registar recebimento | F-28 / Post Incoming Payments | Contas a receber | Compensa o item em aberto`,
      ),
    }),
  },
  {
    id: 'b:proc-p2p',
    kind: 'fn_proc',
    name: ['Procure-to-Pay', 'Procure-to-Pay'],
    desc: ['Da requisição ao pagamento', 'From requisition to payment'],
    body: (en) => ({
      title: 'Procure-to-Pay',
      code: 'P2P',
      f: { module: 'MM', area: en ? 'Stock material purchase' : 'Compra de material de stock' },
      rows: rows(
        'fn_proc',
        en
          ? `Create purchase requisition | ME51N | Requester | Release strategy if applicable
Create purchase order | ME21N / Manage Purchase Orders | Buyer | From the requisition
Post goods receipt | MIGO | Warehouse | GR/IR posting
Post supplier invoice | MIRO / Supplier Invoices | Accounts payable | Three-way match
Run payment program | F110 / Manage Automatic Payments | Accounts payable | Payment file to the bank`
          : `Criar requisição de compra | ME51N | Requisitante | Estratégia de liberação se aplicável
Criar pedido de compra | ME21N / Manage Purchase Orders | Comprador | A partir da requisição
Registar entrada de mercadorias | MIGO | Armazém | Lançamento GR/IR
Registar fatura do fornecedor | MIRO / Supplier Invoices | Contas a pagar | Conferência a três vias
Executar o programa de pagamentos | F110 / Manage Automatic Payments | Contas a pagar | Ficheiro de pagamento para o banco`,
      ),
    }),
  },

  // Funcional — Testes
  {
    id: 'b:test-o2c',
    kind: 'fn_test',
    name: ['Teste de integração Order-to-Cash', 'Order-to-Cash integration test'],
    desc: ['Cenário ponta a ponta SD → FI', 'End-to-end SD → FI scenario'],
    body: (en) => ({
      title: en ? 'O2C end to end' : 'O2C ponta a ponta',
      code: 'SIT-O2C-01',
      f: {
        module: 'SD',
        kind: 'Integração',
        pre: en
          ? 'Customer with sales area and credit limit; material with stock and price condition.'
          : 'Cliente com área de vendas e limite de crédito; material com stock e condição de preço.',
      },
      rows: rows(
        'fn_test',
        en
          ? `Create a sales order for the customer (VA01) | Order saved, price and tax determined, no credit block
Create the delivery and pick (VL01N) | Delivery created with the ordered quantity
Post goods issue | Stock reduced; accounting document for the cost of goods sold
Create the invoice (VF01) | Invoice and accounting document with the customer open item
Post the payment (F-28) | Open item cleared; customer balance zero`
          : `Criar encomenda de venda para o cliente (VA01) | Encomenda gravada, preço e IVA determinados, sem bloqueio de crédito
Criar a entrega e fazer o picking (VL01N) | Entrega criada com a quantidade encomendada
Registar a saída de mercadorias | Stock reduzido; documento contabilístico do custo das vendas
Criar a fatura (VF01) | Fatura e documento contabilístico com o item em aberto do cliente
Registar o recebimento (F-28) | Item em aberto compensado; saldo do cliente a zero`,
      ),
    }),
  },
  {
    id: 'b:test-p2p',
    kind: 'fn_test',
    name: ['Teste de integração Procure-to-Pay', 'Procure-to-Pay integration test'],
    desc: ['Cenário ponta a ponta MM → FI', 'End-to-end MM → FI scenario'],
    body: (en) => ({
      title: en ? 'P2P end to end' : 'P2P ponta a ponta',
      code: 'SIT-P2P-01',
      f: {
        module: 'MM',
        kind: 'Integração',
        pre: en
          ? 'Supplier with purchasing and company code data; material with purchasing info record.'
          : 'Fornecedor com dados de compras e de empresa; material com registo info de compras.',
      },
      rows: rows(
        'fn_test',
        en
          ? `Create the purchase requisition (ME51N) | Requisition saved and released
Create the purchase order from it (ME21N) | Order with price from the info record
Post the goods receipt (MIGO) | Stock increased; GR/IR posting
Post the supplier invoice (MIRO) | Invoice posted without price/quantity variance
Run the payment program (F110) | Supplier paid; open item cleared`
          : `Criar a requisição de compra (ME51N) | Requisição gravada e liberada
Criar o pedido a partir dela (ME21N) | Pedido com o preço do registo info
Registar a entrada de mercadorias (MIGO) | Stock aumentado; lançamento GR/IR
Registar a fatura do fornecedor (MIRO) | Fatura lançada sem desvios de preço/quantidade
Executar o programa de pagamentos (F110) | Fornecedor pago; item em aberto compensado`,
      ),
    }),
  },

  // Projetos — fases
  {
    id: 'b:activate',
    kind: 'project',
    name: ['SAP Activate — implementação (greenfield)', 'SAP Activate — implementation (greenfield)'],
    desc: [
      'Prepare, Explore, Realize, Deploy e Run (37 semanas)',
      'Prepare, Explore, Realize, Deploy and Run (37 weeks)',
    ],
    body: () => ({
      phases: [
        { name: 'Prepare', weeks: 3 },
        { name: 'Explore', weeks: 8 },
        { name: 'Realize', weeks: 16 },
        { name: 'Deploy', weeks: 4 },
        { name: 'Run (Hypercare)', weeks: 6 },
      ],
    }),
  },
  {
    id: 'b:rollout',
    kind: 'project',
    name: ['SAP Activate — rollout', 'SAP Activate — rollout'],
    desc: [
      'Novo país ou empresa sobre o template (21 semanas)',
      'New country or company on the template (21 weeks)',
    ],
    body: () => ({
      phases: [
        { name: 'Prepare', weeks: 2 },
        { name: 'Explore', weeks: 4 },
        { name: 'Realize', weeks: 8 },
        { name: 'Deploy', weeks: 3 },
        { name: 'Run (Hypercare)', weeks: 4 },
      ],
    }),
  },
  {
    id: 'b:conversion',
    kind: 'project',
    name: ['Conversão para S/4HANA (brownfield)', 'S/4HANA conversion (brownfield)'],
    desc: [
      'Readiness, sandbox, DEV/QAS, produção (28 semanas)',
      'Readiness, sandbox, DEV/QAS, production (28 weeks)',
    ],
    body: (en) => ({
      phases: en
        ? [
            { name: 'Prepare (readiness check)', weeks: 4 },
            { name: 'Sandbox conversion', weeks: 6 },
            { name: 'DEV / QAS conversion', weeks: 8 },
            { name: 'Tests (SIT / UAT)', weeks: 4 },
            { name: 'Production conversion', weeks: 2 },
            { name: 'Hypercare', weeks: 4 },
          ]
        : [
            { name: 'Prepare (readiness check)', weeks: 4 },
            { name: 'Conversão sandbox', weeks: 6 },
            { name: 'Conversão DEV / QAS', weeks: 8 },
            { name: 'Testes (SIT / UAT)', weeks: 4 },
            { name: 'Conversão de produção', weeks: 2 },
            { name: 'Hypercare', weeks: 4 },
          ],
    }),
  },
];

/** The ready-made templates of a kind, in the person's language. */
export function builtinTemplates(kind: TplKind, lang: string): Tpl[] {
  const en = lang === 'en';
  return BUILTIN.filter((b) => b.kind === kind).map((b) => ({
    id: b.id,
    kind: b.kind,
    name: en ? b.name[1] : b.name[0],
    desc: en ? b.desc[1] : b.desc[0],
    body: b.body(en),
  }));
}
export const BUILTIN_IDS = BUILTIN.map((b) => b.id);
