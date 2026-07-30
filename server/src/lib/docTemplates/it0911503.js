// Compiled from a real ITGest "Guia de Configurações" (IT0911503) Word
// template. Same anchor mechanics as IT0291405 (see it0291405.js for the
// full anchor-type reference).
//
// "Introdução" contains two illustrative example tables ("Exemplos de
// tabelas a utilizar ao longo do documento") that are reference material for
// whoever is writing the document, not real template data — they sit inside
// the heading's replaceable region, so filling the Introdução block removes
// them along with the rest of the placeholder content, same as any other
// narrative chapter's stub text.
//
// "Ordens de Transporte" reuses the exact same 6-column layout as
// IT0291405's table of the same name (including its "Escolha uma opção:"
// content-control cells), so it's configured identically here.
export const IT0911503_TEMPLATE = {
  name: 'Guia de Configurações (ITGest)',
  description: 'Documento de guia de configurações no modelo ITGest — capa, processo, planeamento e ordens de transporte.',
  sourceDocx: 'it0911503/source.docx',
  fields: [
    // --- Capa ---
    { key: 'nomeSistema', type: 'text', label: 'Nome do Sistema', anchor: { type: 'labelParagraph', text: 'Nome do Sistema' } },
    { key: 'nomeModulo', type: 'text', label: 'Nome do Módulo', anchor: { type: 'labelParagraph', text: 'Nome do Módulo' } },
    { key: 'identificacaoProjeto', type: 'text', label: 'Identificação do Projeto', anchor: { type: 'labelParagraph', text: 'Identificação do Projeto' } },
    { key: 'identificacaoCliente', type: 'text', label: 'Identificação do Cliente', anchor: { type: 'labelParagraph', text: 'Identificação do Cliente' } },
    {
      key: 'logoCliente', type: 'image', label: 'Logótipo do Cliente',
      anchor: { type: 'shapeFill', shapeName: 'Oval 8' },
    },
    {
      key: 'empresa', type: 'select', allowCustom: true, label: 'Escolha a Empresa',
      options: ['ITGest - Software e Sistemas Informáticos, Lda.', 'ITGest, Lda.', 'ITGest Moçambique, Lda.'],
      anchor: { type: 'contentControl', tag: 'Escolha a Empresa' },
    },
    { key: 'dataCapa', type: 'date', label: 'Data', anchor: { type: 'literal', text: 'DD/MM/AAAA', occurrence: 1 } },

    // --- Revisão do documento ---
    { key: 'autor', type: 'text', label: 'Autor(es)', anchor: { type: 'literal', text: 'Nome', occurrence: 1 } },
    { key: 'dataVersao', type: 'date', label: 'Data da versão', anchor: { type: 'literal', text: 'DD.MM.AAAA', occurrence: 1 } },

    // --- Capítulos narrativos ---
    { key: 'introducao', type: 'block', label: '1. Introdução', help: 'Colocar aqui uma breve introdução ao guia de configurações.', anchor: { type: 'heading', text: 'Introdução' } },
    { key: 'processo', type: 'block', label: '2. Processo', help: 'Descrever o processo (configurações, testes, impacto).', anchor: { type: 'heading', text: 'Processo XXXX' } },
    { key: 'planeamento', type: 'block', label: '3. Planeamento', help: 'Descrever o planeamento (configurações, testes, impacto).', anchor: { type: 'heading', text: 'Planeamento' } },

    // --- 4. Ordens de Transporte (tabela repetível) ---
    {
      key: 'ordensTransporte', type: 'repeatableTable', label: '4. Ordens de Transporte',
      help: 'Formato do código: AAAAMMDD-XX-YY (Ano, Mês, Dia, Iniciais de quem cria, Área: SD/MM/FI/RH).',
      anchor: { type: 'table', afterText: 'Ordens de Transporte:' },
      columns: [
        { key: 'codigo', label: 'Código da Ordem', type: 'text' },
        { key: 'descricao', label: 'Descrição', type: 'text' },
        { key: 'ambiente', label: 'Ambiente Mandante e Origem', type: 'text' },
        { key: 'liberada', label: 'Liberada', type: 'select', options: ['Sim', 'Não'] },
        { key: 'transporteQas', label: 'Transporte para QAS', type: 'select', options: ['Sim', 'Não'] },
        { key: 'transportePrd', label: 'Transporte para PRD', type: 'select', options: ['Sim', 'Não'] },
      ],
    },
  ],
};
