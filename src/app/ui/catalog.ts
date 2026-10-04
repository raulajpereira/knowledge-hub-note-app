// Component catalogue (Phase 1). Each entry is one page under /ui/<slug>.
export const CATALOG = [
  {
    slug: 'surfaces',
    title: 'Superfícies e Fundo',
    desc: 'Glass (painel, cartão, suave), Well e fundos Areia / Grafite / Crepúsculo.',
  },
  {
    slug: 'buttons',
    title: 'Botões',
    desc: 'Primário, vidro, contorno, perigo, acento; tamanhos, loading, disabled; botões de ícone.',
  },
  {
    slug: 'chips',
    title: 'Chips, Tags e Badges',
    desc: 'Chips de filtro com contagem, tags de estado e de código, contadores, pills.',
  },
  {
    slug: 'inputs',
    title: 'Campos de Texto',
    desc: 'Input (auth e compacto), password com mostrar/ocultar, pesquisa, textarea, erros.',
  },
  {
    slug: 'select',
    title: 'Select de Vidro',
    desc: 'Menu de vidro próprio com pesquisa (>10 opções) e teclado.',
  },
  {
    slug: 'toggles',
    title: 'Checkbox, Switch, Segmentado',
    desc: 'Lembrar-me, interruptores das Definições, seletor PT/EN, mensagens.',
  },
  {
    slug: 'modal',
    title: 'Modal e Confirmação',
    desc: 'Modal com blur em camadas e diálogo de confirmação (normal e perigo).',
  },
  {
    slug: 'drawer',
    title: 'Drawer Redimensionável',
    desc: 'Painel lateral com pega: arrastar para ajustar, duplo clique repõe.',
  },
  {
    slug: 'table',
    title: 'Tabela Redimensionável',
    desc: 'Colunas ajustáveis e memorizadas, ordenação, seleção, estado vazio.',
  },
  { slug: 'toast', title: 'Toasts', desc: 'Notificações temporárias: info, sucesso, aviso, erro.' },
  {
    slug: 'i18n',
    title: 'Idioma (PT / EN)',
    desc: 'Dicionários extraídos dos protótipos e troca de idioma em tempo real.',
  },
] as const;

export type CatalogSlug = (typeof CATALOG)[number]['slug'];
