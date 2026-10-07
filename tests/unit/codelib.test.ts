import { describe, expect, it } from 'vitest';
import {
  CL_TPL,
  CL_TYPE_IDS,
  ClNodesSchema,
  clFileName,
  clFindRefs,
  clFmHdr,
  clFullCode,
  clGen,
  clMeta,
  clNewNodes,
  clPackage,
  clSearchText,
  clTokens,
  type ClNode,
  type ClObject,
} from '@/lib/codelib';

const obj = (type: ClObject['type'], name: string, nodes = clNewNodes(type, name)): ClObject => ({
  type,
  name,
  description: '',
  nodes,
});
const setTab = (o: ClObject, id: string, k: string, patch: object) => ({
  ...o,
  nodes: o.nodes.map((n) =>
    n.id === id ? { ...n, tabs: n.tabs.map((t) => (t.k === k ? { ...t, ...patch } : t)) } : n,
  ) as ClNode[],
});

describe('codelib model', () => {
  it('every new object is a valid node tree (server schema)', () => {
    for (const ty of CL_TYPE_IDS) {
      const nodes = clNewNodes(ty, 'ZTEST');
      expect(ClNodesSchema.safeParse(nodes).success, ty).toBe(true);
    }
    expect(clNewNodes('FUGR', 'ZHR_SF').map((n) => n.label)).toEqual(['LZHR_SFTOP', 'cl_n_attr']);
    expect(clNewNodes('PROG', 'ZREP')[0]!.tabs[0]).toMatchObject({
      code: expect.stringMatching(/^REPORT zrep\./),
    });
  });

  it('templates add user nodes with unique ids', () => {
    const o = obj('FUGR', 'ZHR_SF');
    const a = CL_TPL.fm();
    const b = CL_TPL.finc(o, 1);
    expect(a.id).not.toBe(b.id);
    expect(b).toMatchObject({ g: 'inc', label: 'LZHR_SFF01', user: true, sub: 'INCLUDE' });
    expect(ClNodesSchema.safeParse([...o.nodes, a, b]).success).toBe(true);
    expect(CL_TPL.meth({ type: 'INTF' }).tabs.map((t) => t.k)).toEqual(['attr', 'par', 'exc']);
    expect(CL_TPL.meth({ type: 'CLAS' }).tabs.map((t) => t.k)).toEqual(['attr', 'par', 'exc', 'code']);
  });

  it('rejects malformed trees', () => {
    const ok = clNewNodes('SNIP', 'x');
    expect(ClNodesSchema.safeParse([...ok, ...ok]).success).toBe(false); // duplicate id
    expect(ClNodesSchema.safeParse([{ ...ok[0], tabs: [] }]).success).toBe(false);
    expect(ClNodesSchema.safeParse([{ ...ok[0], extra: 1 }]).success).toBe(false);
    expect(ClNodesSchema.safeParse([{ ...ok[0], id: 'a b' }]).success).toBe(false);
    const grid = {
      id: 'g',
      g: 'cfg',
      label: 'cl_n_vals',
      tabs: [{ k: 'grid', view: 'grid', s: 'nope', rows: [] }],
    };
    expect(ClNodesSchema.safeParse([grid]).success).toBe(false);
    const badRow = { ...grid, tabs: [{ k: 'grid', view: 'grid', s: 'do_val', rows: [{ 'x y': 'a' }] }] };
    expect(ClNodesSchema.safeParse([badRow]).success).toBe(false);
    const obj2 = { ...grid, tabs: [{ k: 'grid', view: 'grid', s: 'do_val', rows: [{ low: { a: 1 } }] }] };
    expect(ClNodesSchema.safeParse([obj2]).success).toBe(false);
  });

  it('function module header lists the interface', () => {
    const fm = CL_TPL.fm();
    fm.label = 'Z_HR_SF_GET_ABSENCES';
    fm.tabs = fm.tabs.map((t) =>
      t.k === 'imp' && t.view === 'grid'
        ? { ...t, rows: [{ param: 'IV_PERNR', typing: 'TYPE', atype: 'PERNR_D', byval: true }] }
        : t.k === 'exc' && t.view === 'grid'
          ? { ...t, rows: [{ exc: 'NOT_FOUND' }] }
          : t,
    );
    const h = clFmHdr(fm);
    expect(h.split('\n')[0]).toBe('FUNCTION z_hr_sf_get_absences.');
    expect(h).toContain('*"  IMPORTING\n*"     VALUE(IV_PERNR) TYPE  PERNR_D');
    expect(h).toContain('*"  EXCEPTIONS\n*"      NOT_FOUND');
    expect(h).not.toContain('EXPORTING');
  });

  it('generates the class pool and the table DDL from the configuration', () => {
    let c = obj('CLAS', 'ZCL_SF_API_CLIENT');
    c = setTab(c, 'attrs', 'grid', {
      rows: [
        { name: 'GC_TIMEOUT', level: 'Constant', vis: 'Public', typing: 'Type', atype: 'I', init: '30' },
      ],
    });
    const m = CL_TPL.meth({ type: 'CLAS' });
    m.label = 'GET';
    m.tabs = m.tabs.map((t) =>
      t.k === 'par' && t.view === 'grid'
        ? { ...t, rows: [{ name: 'RT_DATA', kind: 'Returning', typing: 'Type', atype: 'STRING' }] }
        : t.k === 'code' && t.view === 'code'
          ? { ...t, code: '  METHOD get.\n  ENDMETHOD.' }
          : t,
    );
    c = { ...c, nodes: [...c.nodes, m] };
    const g = clGen(c, 'class');
    expect(g).toMatch(/^CLASS zcl_sf_api_client DEFINITION\n {2}PUBLIC\n {2}FINAL\n {2}CREATE public \./);
    expect(g).toContain('    CONSTANTS gc_timeout TYPE i VALUE 30 .');
    expect(g).toContain('    METHODS get\n      RETURNING\n        VALUE(rt_data) TYPE string .');
    expect(g).toContain('CLASS zcl_sf_api_client IMPLEMENTATION.\n\n  METHOD get.\n  ENDMETHOD.');
    expect(clFullCode(c).startsWith(g)).toBe(true);

    let t = obj('TABL', 'ZHR_T_LOG');
    t = setTab(t, 'attr', 'attr', {
      vals: {
        text: 'Log',
        deliv: 'C Customizing',
        browse: 'Display/Maintenance Allowed',
        enh: 'Cannot Be Enhanced',
        pkg: 'ZHR_PT',
      },
    });
    const ddl = clGen(t, 'table');
    expect(ddl).toContain("@EndUserText.label : 'Log'");
    expect(ddl).toContain('@AbapCatalog.deliveryClass : #C');
    expect(ddl).toContain('@AbapCatalog.dataMaintenance : #ALLOWED');
    expect(ddl).toContain('  key mandt : mandt not null;');
    expect(clPackage(t)).toBe('ZHR_PT');
    expect(clMeta(t)).toBe('1 camp');
  });

  it('interface generation and full code of a snippet', () => {
    const i = obj('INTF', 'ZIF_X');
    expect(clGen(i, 'intf')).toBe('INTERFACE zif_x\n  PUBLIC .\n\nENDINTERFACE.');
    const s = setTab(obj('SNIP', 'Snip'), 'code', 'code', { code: 'WRITE 1.' });
    expect(clFullCode(s)).toBe('WRITE 1.');
    expect(clMeta(s)).toBe('1 L');
    expect(clSearchText({ ...s, tags: ['ALV'] })).toContain('write 1.');
    expect(clFileName('ZHR PT/Recibos')).toBe('zhr_pt_recibos.abap');
  });

  it('highlighter tokens and references', () => {
    expect(clTokens('* comment')).toEqual([{ t: '* comment', c: 'cm' }]);
    const toks = clTokens("DATA lv TYPE i VALUE 'x'. \" note", new Set(['LV']));
    expect(toks.filter((x) => x.c).map((x) => [x.t, x.c])).toEqual(
      [
        ['DATA', 'kw'],
        ['lv', 'ref'],
        ['TYPE', 'kw'],
        ['i', undefined],
        ['VALUE', 'kw'],
        ["'x'", 'str'],
        ['" note', 'cm'],
      ].filter(([, c]) => c),
    );
    expect(clTokens('ls_emp-pernr', new Set(['LS_EMP']))[0]).toMatchObject({ c: 'ref', ref: 'LS_EMP' });
    expect(clTokens('sy-datum')[0]).toMatchObject({ c: 'sy' });
    const idx = new Map([
      ['ZCL_A', 1],
      ['ZINC', 1],
    ]);
    expect(clFindRefs("NEW zcl_a( ). \" zinc\n'ZINC' INCLUDE zinc.", idx)).toEqual(['ZCL_A', 'ZINC']);
  });
});
