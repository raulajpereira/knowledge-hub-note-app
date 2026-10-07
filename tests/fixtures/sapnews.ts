import { createHash } from 'node:crypto';

// Articles for the SAP News page in tests and screenshots: written straight
// into the server's feed cache (kh:rssa:<sha256(url)>), so nothing is fetched
// from the internet.
const day = (n: number) => new Date(Date.UTC(2026, 9, 7 - n, 9, 30)).toISOString();
const art = (n: number, title: string, excerpt: string, author = '') => ({
  id: `fx-${n}`,
  title,
  link: `https://example.com/sap-news/${n}`,
  date: day(n % 6),
  author,
  img: '',
  excerpt,
  html: `<p>${excerpt}</p><h3>O que muda</h3><ul><li>Configuração revista</li><li>Novas apps Fiori</li></ul><blockquote>Disponível na próxima release.</blockquote><p><a href="https://example.com/sap-news/${n}" target="_blank" rel="noopener noreferrer nofollow">Ler mais</a></p>`,
});
export const SAP_NEWS_FIXTURE: Record<string, ReturnType<typeof art>[]> = {
  'https://news.sap.com/feed/': [
    art(
      1,
      'Novidades do SAP S/4HANA Cloud para equipas de finanças',
      'A nova release traz fecho contabilístico mais rápido, conciliação inteligente e novas análises em tempo real.',
      'SAP News',
    ),
    art(
      4,
      'SAP Business AI chega aos processos de compras',
      'Assistentes Joule passam a sugerir fornecedores e a resumir contratos diretamente no SAP Ariba.',
    ),
    art(
      7,
      'SAP Sapphire 2026: os anúncios mais importantes',
      'Business Data Cloud, agentes Joule e a evolução do RISE with SAP dominaram a conferência.',
    ),
  ],
  'https://erp.today/feed/': [
    art(
      2,
      'Planeamento da próxima release semestral: o que rever antes da atualização',
      'Uma lista prática de testes de regressão, notas SAP e extensões a validar antes de subir de release.',
      'ERP Today',
    ),
    art(
      5,
      'Clean core na prática: três casos de clientes',
      'Como três empresas portuguesas reduziram modificações e passaram a extensões na BTP.',
    ),
  ],
  'https://community.sap.com/khhcw49343/rss/board?board.id=technology-blog-sap': [
    art(
      3,
      'RAP: como estruturar behavior definitions em projetos grandes',
      'Padrões para dividir comportamento, validações e determinações em objetos RAP reutilizáveis.',
      'SAP Tech Bytes',
    ),
    art(
      6,
      'Migrar código ABAP clássico para ABAP Cloud',
      'Ferramentas ATC, released APIs e uma estratégia por fases para chegar ao nível A.',
    ),
  ],
};
export const sapNewsKey = (url: string) => `kh:rssa:${createHash('sha256').update(url).digest('hex')}`;
