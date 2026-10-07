import { describe, expect, it } from 'vitest';
import { MG_COLLECTIONS, MgSchemas, mgDiff, mgSample, mgWeeks, type MgData } from '@/lib/mg';
import { mgTr } from '@/lib/mgText';

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const sample = (): MgData => ({ ...mgSample(uuid, new Date('2026-10-07T12:00:00Z')), settings: {} });

describe('management model', () => {
  it('weeks start on Monday and count from the current week', () => {
    const W = mgWeeks(new Date('2026-10-07T12:00:00'));
    expect(W.wk(0)).toBe('2026-10-05');
    expect(W.wk(1)).toBe('2026-10-12');
    expect(W.wi('2026-10-19')).toBe(2);
    expect(W.dIso(0, 4)).toBe('2026-10-09');
  });

  it('sample data is valid for every schema and all references resolve', () => {
    const d = sample();
    for (const c of MG_COLLECTIONS) for (const x of d[c]) expect(() => MgSchemas[c].parse(x)).not.toThrow();
    const ids = (c: (typeof MG_COLLECTIONS)[number]) => new Set(d[c].map((x) => x.id));
    const people = ids('people');
    const projects = ids('projects');
    expect(d.people.length).toBe(38);
    expect(d.teams.length).toBe(3);
    for (const a of d.allocs) {
      expect(people.has(a.person)).toBe(true);
      expect(projects.has(a.project)).toBe(true);
    }
    for (const p of d.projects) if (p.client) expect(ids('clients').has(p.client)).toBe(true);
  });

  it('schemas are strict', () => {
    const t = sample().teams[0]!;
    expect(() => MgSchemas.teams.parse({ ...t, extra: 1 })).toThrow();
    expect(() => MgSchemas.teams.parse({ ...t, id: 'x' })).toThrow();
  });

  it('diff: puts in dependency order, deletes in reverse, settings when changed', () => {
    const a = sample();
    expect(mgDiff(a, a)).toEqual([]);
    const b = structuredClone(a);
    b.people[0]!.name = 'Outro Nome';
    const gone = b.allocs.shift()!;
    const t = { ...b.teams[0]!, id: uuid(), name: 'Nova' };
    b.teams.push(t);
    b.people[1]!.team = t.id;
    b.settings = { levels: ['', 'A', 'B'] };
    b.projects = b.projects.filter((p) => p.id !== gone.project);
    b.allocs = b.allocs.filter((x) => x.project !== gone.project);
    const ops = mgDiff(a, b);
    const puts = ops.filter((o) => o.op === 'put').map((o) => o.c);
    expect(puts).toEqual(['teams', 'people', 'people', 'settings']);
    const dels = ops.filter((o) => o.op === 'del').map((o) => o.c);
    expect(dels[0]).toBe('allocs');
    expect(dels.at(-1)).toBe('projects');
    expect(ops.findIndex((o) => o.op === 'del')).toBe(puts.length);
  });
});

describe('management labels', () => {
  const en = (s: string) => mgTr(s, 'en');
  it('the Teams, Skills and Settings strings have English text', () => {
    for (const s of [
      'Equipas',
      'Nova Equipa',
      'Sem responsável',
      'Responsável',
      'Remover Equipa',
      'Dados da Equipa',
      'Nome',
      'Descrição',
      'Responsável (team lead)',
      'Capacidade alvo (%)',
      'Cor',
      'Membros',
      'Adicionar Membros',
      'Pesquisar membros…',
      'Tornar responsável',
      'Remover da equipa',
      'Pesquisar Colaboradores',
      'Novo Colaborador',
      'Pesquisar por nome, função ou área…',
      'Pessoas sem equipa aparecem primeiro. Cada pessoa pertence a uma só equipa.',
      'Sem equipa',
      'Mover para esta equipa',
      'Mover',
      'Ninguém encontrado.',
      'Função',
      'Área principal',
      'Senioridade',
      'Capacidade',
      'Custo interno',
      'Preço de venda',
      'Localização',
      'Cancelar',
      'Criar e Adicionar',
      'Indique o nome do colaborador.',
      'Email inválido.',
      'Não foi possível repor os dados.',
      'Fechar',
      'Tipo',
      'Setor',
      'Contacto',
      'Recursos',
      'Gerir Equipas',
      'Todas as equipas',
      'Nome da nova área principal (ex.: SAP IBP)',
      'Função por omissão para esta área',
      'Nome do novo nível de senioridade (ex.: Principal)',
      'Remover a equipa X? As 3 pessoas ficam sem equipa.',
      'Repor todos os dados do Management (pessoas, projetos, alocações, timesheets) para os dados de exemplo?',
    ])
      expect(en(s), s).not.toBe(s);
    for (const s of [
      'Painel de Alocação',
      'Grelha Semanal',
      'Previsão final',
      'Criar Projeto',
      'Cliente Existente',
      'Ordenar',
      'Agrupar',
      'Agrupar por equipa',
      'Sobre-alocados',
      'Limpar filtros',
    ])
      expect(en(s), s).not.toBe(s);
    expect(en('38 pessoas · 8 projetos ativos · semana de 05/10/2026')).not.toContain('pessoas');
    expect(en('3 equipas · 38 pessoas')).toBe('3 teams · 38 people');
    expect(en('17 colaboradores')).toBe('17 members');
    expect(en('1 colaborador')).toBe('1 member');
    expect(en(' · 2 sem equipa')).toBe(' · 2 without a team');
    expect(en('5 pessoas')).toBe('5 people');
  });
});
