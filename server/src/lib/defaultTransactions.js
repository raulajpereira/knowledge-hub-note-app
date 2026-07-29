// Starter catalog of well-known SAP transactions/apps, auto-seeded for every
// new user (and backfilled once for existing users via
// scripts/seed-transactions.js) so the Transações SAP page isn't empty on
// first visit. usageCount values are just plausible starting points so the
// "mais pesquisadas" quick-search list looks meaningful immediately.
export const DEFAULT_TRANSACTIONS = [
  // --- ABAP ---
  { tcode: 'SE38', description: 'Editor ABAP — criar e executar programas', module: 'ABAP', moduleGroup: 'ABAP', program: '—', type: 'Transação Standard', favorite: true, usageCount: 58 },
  { tcode: 'SE80', description: 'Object Navigator — pacotes e objetos de desenvolvimento', module: 'ABAP', moduleGroup: 'ABAP', program: '—', type: 'Transação Standard', favorite: true, usageCount: 55 },
  { tcode: 'SE11', description: 'ABAP Dictionary — tabelas, estruturas e domínios', module: 'ABAP', moduleGroup: 'ABAP', program: '—', type: 'Transação Standard', favorite: true, usageCount: 52 },
  { tcode: 'SE37', description: 'Function Builder — criar/testar módulos de função', module: 'ABAP', moduleGroup: 'ABAP', program: '—', type: 'Transação Standard', favorite: false, usageCount: 34 },
  { tcode: 'SE24', description: 'Class Builder — classes e interfaces ABAP OO', module: 'ABAP', moduleGroup: 'ABAP', program: '—', type: 'Transação Standard', favorite: false, usageCount: 27 },
  { tcode: 'SE16N', description: 'Data Browser — visualizar/filtrar conteúdo de tabelas', module: 'ABAP', moduleGroup: 'ABAP', program: '—', type: 'Transação Standard', favorite: true, usageCount: 47 },
  { tcode: 'SE91', description: 'Manutenção de classes de mensagens', module: 'ABAP', moduleGroup: 'ABAP', program: '—', type: 'Transação Standard', favorite: false, usageCount: 12 },
  { tcode: 'SE93', description: 'Manter/criar códigos de transação', module: 'ABAP', moduleGroup: 'ABAP', program: '—', type: 'Transação Standard', favorite: false, usageCount: 9 },
  { tcode: 'SE09 / SE10', description: 'Transport Organizer — ordens de transporte (Workbench/Customizing)', module: 'ABAP', moduleGroup: 'ABAP', program: '—', type: 'Transação Standard', favorite: false, usageCount: 31 },
  { tcode: 'SLG1', description: 'Visualizar log de aplicação (Application Log)', module: 'ABAP', moduleGroup: 'ABAP', program: 'SBAL_DISPLAY', type: 'Report / Query', favorite: false, usageCount: 14 },
  { tcode: 'ST05', description: 'SQL/Performance Trace', module: 'ABAP', moduleGroup: 'ABAP', program: '—', type: 'Transação Standard', favorite: false, usageCount: 11 },
  { tcode: 'SAT', description: 'Runtime Analysis — análise de performance de programas', module: 'ABAP', moduleGroup: 'ABAP', program: '—', type: 'Transação Standard', favorite: false, usageCount: 8 },
  { tcode: 'CMOD / SMOD', description: 'Enhancements — user exits e SAP enhancements', module: 'ABAP', moduleGroup: 'ABAP', program: '—', type: 'Transação Standard', favorite: false, usageCount: 10 },

  // --- Basis ---
  { tcode: 'SM30', description: 'Manutenção de tabelas de customizing', module: 'Basis', moduleGroup: 'Basis', program: 'RSVTPROT', type: 'Customizing (SPRO)', favorite: true, usageCount: 39 },
  { tcode: 'SPRO', description: 'SAP Reference IMG — customizing central', module: 'Basis', moduleGroup: 'Basis', program: '—', type: 'Customizing (SPRO)', favorite: true, usageCount: 35 },
  { tcode: 'ST22', description: 'Análise de dumps ABAP (runtime errors)', module: 'Basis', moduleGroup: 'Basis', program: '—', type: 'Transação Standard', favorite: false, usageCount: 22 },
  { tcode: 'SM37', description: 'Monitorizar jobs em background', module: 'Basis', moduleGroup: 'Basis', program: '—', type: 'Transação Standard', favorite: false, usageCount: 24 },
  { tcode: 'SM36', description: 'Agendar novo job em background', module: 'Basis', moduleGroup: 'Basis', program: '—', type: 'Transação Standard', favorite: false, usageCount: 13 },
  { tcode: 'SM21', description: 'System Log — eventos e erros do sistema', module: 'Basis', moduleGroup: 'Basis', program: '—', type: 'Transação Standard', favorite: false, usageCount: 9 },
  { tcode: 'SM50 / SM66', description: 'Visão geral de work processes (local/global)', module: 'Basis', moduleGroup: 'Basis', program: '—', type: 'Transação Standard', favorite: false, usageCount: 7 },
  { tcode: 'SU01', description: 'Manutenção de utilizadores', module: 'Basis', moduleGroup: 'Basis', program: '—', type: 'Transação Standard', favorite: false, usageCount: 17 },
  { tcode: 'PFCG', description: 'Manutenção de roles/perfis de autorização', module: 'Basis', moduleGroup: 'Basis', program: '—', type: 'Transação Standard', favorite: false, usageCount: 15 },
  { tcode: 'STMS', description: 'Transport Management System', module: 'Basis', moduleGroup: 'Basis', program: '—', type: 'Transação Standard', favorite: false, usageCount: 12 },
  { tcode: 'SICF', description: 'Manter serviços HTTP (ICF)', module: 'Basis', moduleGroup: 'Basis', program: '—', type: 'Transação Standard', favorite: false, usageCount: 6 },

  // --- HCM ---
  { tcode: 'PA20', description: 'Visualizar dados mestre de RH', module: 'HCM · PA', moduleGroup: 'HCM', program: 'SAPMP50A', type: 'Transação Standard', favorite: true, usageCount: 45 },
  { tcode: 'PA30', description: 'Manter dados mestre de RH', module: 'HCM · PA', moduleGroup: 'HCM', program: 'SAPMP50A', type: 'Transação Standard', favorite: true, usageCount: 43 },
  { tcode: 'PA40', description: 'Executar ação de pessoal (admissão, transferência…)', module: 'HCM · PA', moduleGroup: 'HCM', program: 'SAPMP50A', type: 'Transação Standard', favorite: false, usageCount: 26 },
  { tcode: 'PA10', description: 'Ficheiro de pessoal (Personnel File)', module: 'HCM · PA', moduleGroup: 'HCM', program: '—', type: 'Report / Query', favorite: false, usageCount: 10 },
  { tcode: 'PT60', description: 'Lista de presenças/faltas', module: 'HCM · PT', moduleGroup: 'HCM', program: 'RPTABS20', type: 'Report / Query', favorite: false, usageCount: 18 },
  { tcode: 'PT01', description: 'Criar horário de trabalho', module: 'HCM · PT', moduleGroup: 'HCM', program: '—', type: 'Transação Standard', favorite: false, usageCount: 7 },
  { tcode: 'CAT2', description: 'Registo de folha de horas (CATS)', module: 'HCM · PT', moduleGroup: 'HCM', program: 'SAPMCATT', type: 'Transação Standard', favorite: false, usageCount: 16 },
  { tcode: 'PT_QTA00', description: 'Overview de quotas de ausência', module: 'HCM · PT', moduleGroup: 'HCM', program: '—', type: 'Report / Query', favorite: false, usageCount: 8 },
  { tcode: 'PC00_M99_CALC', description: 'Executar folha de pagamento (driver internacional)', module: 'HCM · PY', moduleGroup: 'HCM', program: 'RPCALCX0', type: 'Report / Query', favorite: false, usageCount: 14 },
  { tcode: 'PC_PAYRESULT', description: 'Visualizar resultados de folha de pagamento', module: 'HCM · PY', moduleGroup: 'HCM', program: '—', type: 'Report / Query', favorite: false, usageCount: 11 },
  { tcode: 'PU19', description: 'Wage Type Reporter — onde é usado um tipo de rubrica', module: 'HCM · PY', moduleGroup: 'HCM', program: '—', type: 'Report / Query', favorite: false, usageCount: 5 },
  { tcode: 'PPOME', description: 'Alterar estrutura organizativa', module: 'HCM · OM', moduleGroup: 'HCM', program: 'SAPLRHCH', type: 'Transação Standard', favorite: true, usageCount: 29 },
  { tcode: 'PPOSE', description: 'Visualizar estrutura organizativa', module: 'HCM · OM', moduleGroup: 'HCM', program: 'SAPLRHCH', type: 'Transação Standard', favorite: false, usageCount: 19 },

  // --- SuccessFactors ---
  { tcode: 'Employee Central', description: 'Registo e manutenção de dados de colaboradores', module: 'SuccessFactors · EC', moduleGroup: 'SuccessFactors', program: '—', type: 'Admin Tool (SF)', favorite: true, usageCount: 33 },
  { tcode: 'Manage Business Configuration', description: 'Ativar/configurar objetos do EC (MDF/MBC)', module: 'SuccessFactors · MDF', moduleGroup: 'SuccessFactors', program: '—', type: 'Admin Tool (SF)', favorite: false, usageCount: 20 },
  { tcode: 'Manage Data', description: 'Criar/editar registos de qualquer objeto MDF', module: 'SuccessFactors · MDF', moduleGroup: 'SuccessFactors', program: '—', type: 'Admin Tool (SF)', favorite: false, usageCount: 21 },
  { tcode: 'Manage Permission Roles', description: 'Configurar permissões RBP', module: 'SuccessFactors · RBP', moduleGroup: 'SuccessFactors', program: '—', type: 'Admin Tool (SF)', favorite: false, usageCount: 16 },
  { tcode: 'Manage Permission Groups', description: 'Definir grupos de utilizadores para RBP', module: 'SuccessFactors · RBP', moduleGroup: 'SuccessFactors', program: '—', type: 'Admin Tool (SF)', favorite: false, usageCount: 9 },
  { tcode: 'Provisioning', description: 'Configuração ao nível do sistema (acesso restrito)', module: 'SuccessFactors · EC', moduleGroup: 'SuccessFactors', program: '—', type: 'Admin Tool (SF)', favorite: false, usageCount: 6 },
  { tcode: 'Position Management', description: 'Criar/gerir posições da estrutura organizativa', module: 'SuccessFactors · EC', moduleGroup: 'SuccessFactors', program: '—', type: 'Admin Tool (SF)', favorite: false, usageCount: 13 },
  { tcode: 'Import and Export Data', description: 'Carregar/exportar dados em massa (ficheiros CSV)', module: 'SuccessFactors · MDF', moduleGroup: 'SuccessFactors', program: '—', type: 'Admin Tool (SF)', favorite: false, usageCount: 15 },
  { tcode: 'Manage Job Requisitions', description: 'Gerir pedidos de recrutamento', module: 'SuccessFactors · MDF', moduleGroup: 'SuccessFactors', program: '—', type: 'Admin Tool (SF)', favorite: false, usageCount: 7 },
  { tcode: 'Manage Learning Activities', description: 'Gerir cursos e atividades de formação (LMS)', module: 'SuccessFactors · MDF', moduleGroup: 'SuccessFactors', program: '—', type: 'Admin Tool (SF)', favorite: false, usageCount: 5 },
  { tcode: 'Manage Compensation Plans', description: 'Configurar planos de compensação', module: 'SuccessFactors · MDF', moduleGroup: 'SuccessFactors', program: '—', type: 'Admin Tool (SF)', favorite: false, usageCount: 4 },
  { tcode: 'Employee Central Payroll Control Center', description: 'Monitorização do processo de payroll (EC Payroll)', module: 'SuccessFactors · EC', moduleGroup: 'SuccessFactors', program: '—', type: 'Admin Tool (SF)', favorite: false, usageCount: 8 },
];
