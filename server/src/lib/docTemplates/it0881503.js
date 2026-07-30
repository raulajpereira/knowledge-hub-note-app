// Compiled from a real ITGest "Levantamento de Requisitos" (IT0881503) Word
// template. Same anchor mechanics as IT0291405 (see it0291405.js for the
// full anchor-type reference).
//
// Two chapters ("Presenças" and "Documentação a recolher") have their table
// living directly under the chapter heading with no separate narrative text
// worth capturing, so — same as "Planeamento" in IT0291405 — they're
// represented purely as table fields, not heading/block fields; the table
// anchor's `afterText` is the heading text itself.
//
// Three chapters in the source are unnamed placeholders (heading text
// literally "XXXXXXXXXXXXXXX", repeated three times) meant for the document
// author to title and write freeform in Word — the fill engine matches
// headings by exact text, so these aren't representable as distinct fields
// and are intentionally left out of this template; they remain as inert
// stub content in generated documents, same as any other untouched section.
export const IT0881503_TEMPLATE = {
  name: 'Levantamento de Requisitos (ITGest)',
  description: 'Documento de levantamento de requisitos no modelo ITGest — capa, presenças, planeamento, documentação a recolher e anexos.',
  sourceDocx: 'it0881503/source.docx',
  fields: [
    // --- Capa ---
    { key: 'nomeSistema', type: 'text', label: 'Nome do Sistema', anchor: { type: 'labelParagraph', text: 'Nome do Sistema' } },
    { key: 'nomeModulo', type: 'text', label: 'Nome do Módulo', anchor: { type: 'labelParagraph', text: 'Nome do Módulo' } },
    { key: 'identificacaoProjeto', type: 'text', label: 'Identificação do Projeto', anchor: { type: 'labelParagraph', text: 'Identificação do Projeto' } },
    { key: 'identificacaoCliente', type: 'text', label: 'Identificação do Cliente', anchor: { type: 'labelParagraph', text: 'Identificação do Cliente' } },
    {
      key: 'logoCliente', type: 'image', label: 'Logótipo do Cliente',
      anchor: { type: 'shapeFill', shapeName: 'Oval 14' },
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

    // --- 1. Introdução ---
    { key: 'introducao', type: 'block', label: '1. Introdução', help: 'Colocar aqui uma breve introdução ao levantamento de requisitos.', anchor: { type: 'heading', text: 'Introdução' } },

    // --- 2. Presenças (tabela repetível) ---
    {
      key: 'presencas', type: 'repeatableTable', label: '2. Presenças',
      help: 'Pessoas presentes nas sessões de levantamento de requisitos.',
      anchor: { type: 'table', afterText: 'Presenças' },
      hasNumberColumn: false,
      columns: [
        { key: 'nomeCliente', label: 'Nome do Cliente', type: 'text' },
        { key: 'nomeConsultoria', label: 'Equipa de Consultoria', type: 'text' },
      ],
    },

    // --- 3. Planeamento ---
    { key: 'planeamento', type: 'block', label: '3. Planeamento', help: 'Descrever o planeamento (configurações, testes, impacto).', anchor: { type: 'heading', text: 'Planeamento' } },

    // --- 7. Outras Considerações ---
    { key: 'outrasConsideracoes', type: 'block', label: '7. Outras Considerações', help: 'Outras considerações relevantes ao levantamento.', anchor: { type: 'heading', text: 'Outras Considerações' } },

    // --- 8. Documentação a recolher (tabela repetível) ---
    {
      key: 'documentacaoRecolher', type: 'repeatableTable', label: '8. Documentação a Recolher',
      help: 'Este capítulo deve ser removido do documento final se não for utilizado.',
      anchor: { type: 'table', afterText: 'Documentação a recolher' },
      hasNumberColumn: false,
      columns: [
        { key: 'designacao', label: 'Designação', type: 'text' },
        { key: 'estado', label: 'Estado', type: 'text' },
        { key: 'id', label: 'ID', type: 'text' },
      ],
    },

    // --- 9. Anexos ---
    { key: 'anexos', type: 'block', label: '9. Anexos', help: 'Este capítulo deve ser removido do documento final se não for utilizado.', anchor: { type: 'heading', text: 'Anexos' } },
  ],
};
