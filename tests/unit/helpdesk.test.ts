import { describe, expect, it } from 'vitest';
import { guessHdMapping, readRow, splitSubject, splitWhoWhen } from '@/lib/helpdesk';

const HEADERS = [
  'Assunto',
  'Tarefa Pai',
  'Tempo gasto',
  'Atribuído a',
  'Estado',
  'Prioridade',
  'Tipo',
  'Reportado por',
  'Último comentário',
  'Cliente',
];

describe('helpdesk rows', () => {
  it('splits the subject and "who (when)"', () => {
    expect(splitSubject('#146975 Solicitação de Desenvolvimento')).toEqual({
      number: '146975',
      summary: 'Solicitação de Desenvolvimento',
    });
    expect(splitSubject('INC0012345 - Erro IDoc')).toEqual({ number: 'INC0012345', summary: 'Erro IDoc' });
    expect(splitSubject('sem número')).toEqual({ number: '', summary: 'sem número' });
    expect(splitWhoWhen('Jurema Makanda Cortez (16/11/2026 11:20)')).toEqual({
      who: 'Jurema Makanda Cortez',
      when: '2026-11-16 11:20',
    });
    expect(splitWhoWhen('6 Observadores')).toEqual({ who: '6 Observadores', when: '' });
  });
  it('guesses the mapping from the page headers', () => {
    expect(guessHdMapping(HEADERS)).toEqual({
      Assunto: 'subject',
      'Tarefa Pai': 'parent',
      'Atribuído a': 'assignee',
      Estado: 'status',
      Prioridade: 'priority',
      Tipo: 'type',
      'Reportado por': 'reported',
      'Último comentário': 'comment',
      Cliente: 'client',
    });
  });
  it('reads a row; every column kept; rows without a number skipped', () => {
    const map = guessHdMapping(HEADERS);
    const r = readRow(
      HEADERS,
      [
        '#146233 Regularização',
        '–',
        '6h 00m',
        'Raul Pereira',
        'Em progresso',
        'Baixa',
        'Incidente',
        'Aldino Fila (06/11/2026 08:41)',
        'Aldino Fila (13/11/2026 16:29)',
        'Cliente X',
      ],
      map,
      ['https://hd.example/t/146233', null, null, null, null, null, null, null, null, null],
    )!;
    expect(r).toMatchObject({
      number: '146233',
      summary: 'Regularização',
      parent: '',
      assignee: 'Raul Pereira',
      status: 'Em progresso',
      client: 'Cliente X',
      reportedBy: 'Aldino Fila',
      reportedAt: '2026-11-06 08:41',
      commentAt: '2026-11-13 16:29',
      url: 'https://hd.example/t/146233',
    });
    expect(r.cells['Tempo gasto']).toBe('6h 00m');
    expect(readRow(HEADERS, ['Total', '', '', '', '', '', '', '', '', ''], map)).toBeNull();
    expect(readRow(HEADERS, ['#1 x'], map, ['javascript:alert(1)'])?.url).toBe('');
  });
});

import { hdRank, hdStatusKind } from '@/lib/helpdesk';
describe('helpdesk status', () => {
  it('colours and order: Aberto, Reaberto, Em progresso first', () => {
    expect(
      ['Aberto', 'Reaberto', 'Em progresso', 'Pendente-Cliente', 'Resolvido', 'Fechado', 'Outro'].map(
        hdStatusKind,
      ),
    ).toEqual(['open', 'reopen', 'progress', 'pending', 'done', 'done', 'other']);
    expect(hdRank('Em progresso', true)).toBeLessThan(hdRank('Pendente-Cliente', true));
    expect(hdRank('Pendente-Cliente', true)).toBeLessThan(hdRank('Fechado', true));
    expect(hdRank('Aberto', false)).toBeGreaterThan(hdRank('Fechado', true));
  });
});
