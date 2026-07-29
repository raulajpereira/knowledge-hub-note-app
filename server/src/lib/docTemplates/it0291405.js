// Compiled from a real ITGest "Especificação Funcional Técnica" (IT0291405)
// Word template. Each field carries an `anchor` describing where in the
// source docx it maps to, for the fill engine (built separately) to locate:
//   - labelParagraph: a text-box paragraph whose text equals `text` is the
//     field's on-page label; the value goes into the first empty paragraph
//     directly below it.
//   - heading: a paragraph styled `ITtitle` whose text equals `text` marks
//     the start of that chapter; the block's content replaces everything
//     between it and the next ITtitle heading (the "Texto" stub + grey
//     instruction line get removed).
//   - contentControl: a native Word content control (<w:sdt>) identified by
//     its `tag`; its display run is replaced with the chosen value.
//   - literal: a plain placeholder string (e.g. "DD/MM/AAAA") replaced by a
//     straight text substitution, first occurrence.
//   - table: the table immediately following a paragraph containing
//     `afterText`; `fixed` tables keep their row count and only fill named
//     cells, `repeatable` tables clone a template row per data row.
export const IT0291405_TEMPLATE = {
  name: 'Especificação Funcional Técnica (ITGest)',
  description: 'Documento de especificação funcional e técnica no modelo ITGest — capa, 8 capítulos, planeamento e ordens de transporte.',
  sourceDocx: 'it0291405/source.docx',
  fields: [
    // --- Capa ---
    { key: 'sistemaModulo', type: 'text', label: 'Sistema e Módulo', anchor: { type: 'labelParagraph', text: 'Sistema e Módulo' } },
    { key: 'descricaoTarefa', type: 'text', label: 'Descrição da Tarefa', anchor: { type: 'labelParagraph', text: 'Descrição da Tarefa' } },
    { key: 'identificacaoProjeto', type: 'text', label: 'Identificação do Projeto', anchor: { type: 'labelParagraph', text: 'Identificação do Projeto' } },
    { key: 'identificacaoCliente', type: 'text', label: 'Identificação do Cliente', anchor: { type: 'labelParagraph', text: 'Identificação do Cliente' } },
    {
      key: 'logoCliente', type: 'image', label: 'Logótipo do Cliente',
      anchor: { type: 'shapeFill', shapeName: 'Oval 3' },
    },
    {
      key: 'empresa', type: 'select', label: 'Escolha a Empresa',
      options: ['ITGest - Software e Sistemas Informáticos, Lda.', 'ITGest, Lda.', 'ITGest Moçambique, Lda.'],
      anchor: { type: 'contentControl', tag: 'Escolha a Empresa' },
    },
    { key: 'dataCapa', type: 'date', label: 'Data', anchor: { type: 'literal', text: 'DD/MM/AAAA', occurrence: 1 } },

    // --- Revisão do documento ---
    { key: 'autor', type: 'text', label: 'Autor(es)', anchor: { type: 'literal', text: 'Nome', occurrence: 1 } },
    { key: 'dataVersao', type: 'date', label: 'Data da versão', anchor: { type: 'literal', text: 'DD.MM.AAAA', occurrence: 1 } },

    // --- Capítulos narrativos (bloco: texto + código + imagens) ---
    { key: 'introducao', type: 'block', label: '1. Introdução', help: 'Colocar aqui uma breve introdução do pedido.', anchor: { type: 'heading', text: 'Introdução' } },
    { key: 'detalheFuncionalidade', type: 'block', label: '2. Detalhe da Funcionalidade', help: 'Descrever o mais detalhadamente possível qual é a funcionalidade a disponibilizar ao cliente.', anchor: { type: 'heading', text: 'Detalhe da Funcionalidade' } },
    { key: 'impacto', type: 'block', label: '3. Impacto', help: 'Identificar qual é o impacto que a nova solução vai trazer para o Cliente.', anchor: { type: 'heading', text: 'Impacto' } },

    // --- 4. Planeamento (tabela fixa) ---
    {
      key: 'planeamento', type: 'fixedTable', label: '4. Planeamento',
      anchor: { type: 'table', afterText: 'Planeamento' },
      columns: [
        { key: 'responsavel', label: 'Responsável', type: 'text' },
        { key: 'data', label: 'Data Prevista de Conclusão', type: 'date' },
      ],
      rows: [
        { key: 'especificacaoFuncional', label: 'Especificação Funcional' },
        { key: 'parametrizacoesRow', label: 'Parametrizações' },
        { key: 'desenvolvimento', label: 'Desenvolvimento' },
        { key: 'especificacaoTecnica', label: 'Especificação Técnica' },
        { key: 'testesFuncionais', label: 'Testes Funcionais' },
      ],
    },
    { key: 'totalHoras', type: 'text', label: 'Total Tempo Estimado (ex.: 16 horas)', anchor: { type: 'literal', text: 'XX horas', occurrence: 1 } },

    { key: 'parametrizacoes', type: 'block', label: '5. Parametrizações', help: 'Colocar o descritivo e prints das configurações realizadas.', anchor: { type: 'heading', text: 'Parametrizações' } },
    { key: 'desenvolvimentos', type: 'block', label: '6. Desenvolvimentos', help: 'Colocar aqui o código desenvolvido.', anchor: { type: 'heading', text: 'Desenvolvimentos' } },
    { key: 'testesUnitarios', type: 'block', label: '7. Testes Unitários', help: 'Colocar o descritivo e prints dos testes efetuados.', anchor: { type: 'heading', text: 'Testes Unitários' } },

    // --- 8. Outras Considerações — Ordens de Transporte (tabela repetível) ---
    {
      key: 'ordensTransporte', type: 'repeatableTable', label: '8. Outras Considerações — Ordens de Transporte',
      help: 'Formato do código: AAAAMMDD-XX-YY (Ano, Mês, Dia, Iniciais de quem cria, Área: SD/MM/FI/RH).',
      anchor: { type: 'table', afterText: 'Ordens de Transporte' },
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
