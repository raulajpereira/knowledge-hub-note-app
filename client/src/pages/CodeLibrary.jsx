import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import CodeBlock from '../components/CodeBlock.jsx';
import { useClickOutside } from '../lib/useClickOutside.js';

const FOLDER_KINDS = ['program', 'class', 'function_module', 'other'];
const ITEM_TYPES = ['snippet', 'characteristics', 'table', 'data_element', 'domain'];
const ITEM_ICON = { snippet: 'code', characteristics: 'settings', table: 'archive', data_element: 'tag', domain: 'doc' };
const optionStyle = { color: '#1a1a1a', background: '#fff' };

function inputStyle(theme) {
  return { border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', width: '100%', boxSizing: 'border-box' };
}

function Field({ label, children }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</label>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }) {
  const { theme } = useTheme();
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: theme.textPrimary, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Radio({ label, checked, onChange }) {
  const { theme } = useTheme();
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: theme.textPrimary, cursor: 'pointer' }}>
      <input type="radio" checked={!!checked} onChange={onChange} />
      {label}
    </label>
  );
}

function Block({ title, children, last }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 20, marginBottom: 20, borderBottom: last ? 'none' : `1px solid ${theme.border}` }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: theme.textPrimary }}>{title}</div>
      {children}
    </div>
  );
}

function SubTable({ title, columns, rows, onChange, t }) {
  const { theme } = useTheme();
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted }}>{title}</span>
        <span
          onClick={() => onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, c.type === 'checkbox' ? false : '']))])}
          style={{ fontSize: 11.5, fontWeight: 700, color: theme.accentText, cursor: 'pointer' }}
        >
          + {t('codeLibrary.addRow')}
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 'max-content' }}>
          {rows.map((row, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {columns.map((c) =>
                c.type === 'checkbox' ? (
                  <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, width: c.width || 90, flexShrink: 0, color: theme.textPrimary }}>
                    <input
                      type="checkbox"
                      checked={!!row[c.key]}
                      onChange={(e) => onChange(rows.map((r, i) => (i === idx ? { ...r, [c.key]: e.target.checked } : r)))}
                    />
                    {c.label}
                  </label>
                ) : (
                  <input
                    key={c.key}
                    value={row[c.key] || ''}
                    onChange={(e) => onChange(rows.map((r, i) => (i === idx ? { ...r, [c.key]: e.target.value } : r)))}
                    placeholder={c.label}
                    style={{ ...inputStyle(theme), width: c.width || 120, flexShrink: 0 }}
                  />
                )
              )}
              <span onClick={() => onChange(rows.filter((_, i) => i !== idx))} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '0 4px', flexShrink: 0 }}>
                &times;
              </span>
            </div>
          ))}
          {rows.length === 0 && <div style={{ fontSize: 12, color: theme.textMuted }}>{t('codeLibrary.noRows')}</div>}
        </div>
      </div>
    </div>
  );
}

function defaultAttributes(type, folderKind) {
  if (type === 'characteristics') {
    if (folderKind === 'class') {
      return {
        caracteristicas: { descricao: '', classeSuperior: '', classeMensagem: '', statusPrograma: 'Não classificado', categoria: '', pacote: '', idiomaOriginal: '', criadoPor: '', criadoEm: '', modificadoPor: '', modificadoEm: '', versaoIdiomaAbap: '', aritmeticaPontoFixo: false, memoriaCompartilhada: false },
        atributos: [],
        declaracoesProgressivas: [],
      };
    }
    if (folderKind === 'function_module') {
      return {
        caracteristicas: {
          grupoFuncoes: '', textoBreve: '', tipoProcesso: 'normal', acessibilidade: '', contratoInterface: '', basXmlSuportado: false,
          atualizacaoTipo: 'imediato', responsavel: '', ultimoModificador: '', dataModificacao: '', pacote: '', nomePrograma: '', nomeInclude: '', idiomaOriginal: '',
          naoLiberado: false, bloqueioProcesso: false, global: false,
        },
        importacao: [], exportacao: [], modificacao: [], tabelas: [], excecoes: [],
      };
    }
    return {
      caracteristicas: { titulo: '', idiomaOriginal: '', status: 'Ativo', criadoPor: '', criadoEm: '', modificadoPor: '', modificadoEm: '', pacote: '', tipo: 'Executable Program', statusAtributo: 'Não classificado', grupoAutorizacoes: '', aplicacao: '', versaoIdiomaAbap: '', nomeDbLogico: '', telaSelecao: '', aritmeticaPontoFixo: false, bloqueioEditor: false },
      textos: { simbolos: [], selecao: [], titulos: [] },
    };
  }
  if (type === 'table') {
    return {
      entrega: { classeEntrega: 'A', dataBrowser: '' },
      campos: [],
      tecnico: { categoriaDados: '', ctgTamanho: '', tpCompartmt: '', buffering: 'naoPermitido', bufferingTipo: { registosIndividuais: false, areaGeral: false, totalmenteArmazenado: false }, numCamposChave: '', registrarLog: false, avaliacao: '', motivo: '' },
    };
  }
  if (type === 'data_element') {
    return {
      ctgDds: { categoria: 'dominio', dominio: '', tipoIncorporadoCtgDados: '', tipoIncorporadoCompr: '', nomeTipoRefer: '', refInstaladoTpDados: '', refInstaladoCompr: '' },
      denominacaoCampo: { curto: '', medio: '', longo: '', heading: '' },
    };
  }
  if (type === 'domain') {
    return {
      definicao: { ctgDados: 'CHAR', numPosicoes: '', casasDecimais: '', comprSaida: '', rotinaConversao: '', sinal: false, minusculas: false },
      valoresFixos: [],
    };
  }
  return {};
}

function ProgramConfig({ a, set, t }) {
  const { theme } = useTheme();
  const c = a.caracteristicas || {};
  const setC = (patch) => set({ caracteristicas: { ...c, ...patch } });
  const textos = a.textos || {};
  const setTextos = (patch) => set({ textos: { ...textos, ...patch } });

  return (
    <>
      <Block title={t('codeLibrary.blockCaracteristicas')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label={t('codeLibrary.pTitulo')}><input value={c.titulo || ''} onChange={(e) => setC({ titulo: e.target.value })} style={inputStyle(theme)} /></Field>
          </div>
          <Field label={t('codeLibrary.pIdiomaOriginal')}><input value={c.idiomaOriginal || ''} onChange={(e) => setC({ idiomaOriginal: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.pStatus')}>
            <select value={c.status || 'Ativo'} onChange={(e) => setC({ status: e.target.value })} style={inputStyle(theme)}>
              {['Ativo', 'Inativo'].map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
            </select>
          </Field>
          <Field label={t('codeLibrary.pCriadoPor')}><input value={c.criadoPor || ''} onChange={(e) => setC({ criadoPor: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.pCriadoEm')}><input value={c.criadoEm || ''} onChange={(e) => setC({ criadoEm: e.target.value })} placeholder="DD.MM.AAAA" style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.pModificadoPor')}><input value={c.modificadoPor || ''} onChange={(e) => setC({ modificadoPor: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.pModificadoEm')}><input value={c.modificadoEm || ''} onChange={(e) => setC({ modificadoEm: e.target.value })} placeholder="DD.MM.AAAA" style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.pPacote')}><input value={c.pacote || ''} onChange={(e) => setC({ pacote: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.pTipo')}>
            <select value={c.tipo || 'Executable Program'} onChange={(e) => setC({ tipo: e.target.value })} style={inputStyle(theme)}>
              {['Executable Program', 'Include Program', 'Module Pool', 'Function Group', 'Class Pool', 'Interface Pool', 'Subroutine Pool'].map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
            </select>
          </Field>
          <Field label={t('codeLibrary.pStatusAtributo')}>
            <select value={c.statusAtributo || 'Não classificado'} onChange={(e) => setC({ statusAtributo: e.target.value })} style={inputStyle(theme)}>
              {['Não classificado', 'Programa teste', 'Programa standard SAP', 'Programa cliente'].map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
            </select>
          </Field>
          <Field label={t('codeLibrary.pGrupoAutorizacoes')}><input value={c.grupoAutorizacoes || ''} onChange={(e) => setC({ grupoAutorizacoes: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.pAplicacao')}><input value={c.aplicacao || ''} onChange={(e) => setC({ aplicacao: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.pVersaoIdiomaAbap')}><input value={c.versaoIdiomaAbap || ''} onChange={(e) => setC({ versaoIdiomaAbap: e.target.value })} placeholder="Standard ABAP" style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.pNomeDbLogico')}><input value={c.nomeDbLogico || ''} onChange={(e) => setC({ nomeDbLogico: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.pTelaSelecao')}><input value={c.telaSelecao || ''} onChange={(e) => setC({ telaSelecao: e.target.value })} style={inputStyle(theme)} /></Field>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', paddingTop: 18 }}>
            <Checkbox label={t('codeLibrary.pAritmeticaPontoFixo')} checked={c.aritmeticaPontoFixo} onChange={(v) => setC({ aritmeticaPontoFixo: v })} />
            <Checkbox label={t('codeLibrary.pBloqueioEditor')} checked={c.bloqueioEditor} onChange={(v) => setC({ bloqueioEditor: v })} />
          </div>
        </div>
      </Block>
      <Block title={t('codeLibrary.blockTextos')} last>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <SubTable
            title={t('codeLibrary.tSimbolos')}
            columns={[
              { key: 'nome', label: t('codeLibrary.colNome'), width: 90 },
              { key: 'texto', label: t('codeLibrary.colTexto'), width: 220 },
              { key: 'compr', label: t('codeLibrary.colCompr'), width: 70 },
              { key: 'max', label: t('codeLibrary.colMax'), width: 70 },
            ]}
            rows={textos.simbolos || []}
            onChange={(rows) => setTextos({ simbolos: rows })}
            t={t}
          />
          <SubTable
            title={t('codeLibrary.tSelecao')}
            columns={[
              { key: 'nome', label: t('codeLibrary.colNome'), width: 90 },
              { key: 'texto', label: t('codeLibrary.colTexto'), width: 240 },
              { key: 'referDict', label: t('codeLibrary.colReferDict'), type: 'checkbox', width: 130 },
            ]}
            rows={textos.selecao || []}
            onChange={(rows) => setTextos({ selecao: rows })}
            t={t}
          />
          <SubTable
            title={t('codeLibrary.tTitulos')}
            columns={[
              { key: 'nome', label: t('codeLibrary.colNome'), width: 90 },
              { key: 'texto', label: t('codeLibrary.colTexto'), width: 240 },
            ]}
            rows={textos.titulos || []}
            onChange={(rows) => setTextos({ titulos: rows })}
            t={t}
          />
        </div>
      </Block>
    </>
  );
}

function ClassConfig({ a, set, t }) {
  const { theme } = useTheme();
  const c = a.caracteristicas || {};
  const setC = (patch) => set({ caracteristicas: { ...c, ...patch } });
  const atributos = a.atributos || [];
  const declaracoesProgressivas = a.declaracoesProgressivas || [];

  return (
    <>
      <Block title={t('codeLibrary.blockCaracteristicas')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label={t('codeLibrary.cDescricao')}><input value={c.descricao || ''} onChange={(e) => setC({ descricao: e.target.value })} style={inputStyle(theme)} /></Field>
          </div>
          <Field label={t('codeLibrary.cClasseSuperior')}><input value={c.classeSuperior || ''} onChange={(e) => setC({ classeSuperior: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.cClasseMensagem')}><input value={c.classeMensagem || ''} onChange={(e) => setC({ classeMensagem: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.cStatusPrograma')}><input value={c.statusPrograma || ''} onChange={(e) => setC({ statusPrograma: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.cCategoria')}><input value={c.categoria || ''} onChange={(e) => setC({ categoria: e.target.value })} placeholder="6 Classe de comportamento" style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.cPacote')}><input value={c.pacote || ''} onChange={(e) => setC({ pacote: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.cIdiomaOriginal')}><input value={c.idiomaOriginal || ''} onChange={(e) => setC({ idiomaOriginal: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.cCriadoPor')}><input value={c.criadoPor || ''} onChange={(e) => setC({ criadoPor: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.cCriadoEm')}><input value={c.criadoEm || ''} onChange={(e) => setC({ criadoEm: e.target.value })} placeholder="DD.MM.AAAA" style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.cModificadoPor')}><input value={c.modificadoPor || ''} onChange={(e) => setC({ modificadoPor: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.cModificadoEm')}><input value={c.modificadoEm || ''} onChange={(e) => setC({ modificadoEm: e.target.value })} placeholder="DD.MM.AAAA" style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.cVersaoIdiomaAbap')}><input value={c.versaoIdiomaAbap || ''} onChange={(e) => setC({ versaoIdiomaAbap: e.target.value })} placeholder="Standard ABAP" style={inputStyle(theme)} /></Field>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', paddingTop: 18 }}>
            <Checkbox label={t('codeLibrary.cAritmeticaPontoFixo')} checked={c.aritmeticaPontoFixo} onChange={(v) => setC({ aritmeticaPontoFixo: v })} />
            <Checkbox label={t('codeLibrary.cMemoriaCompartilhada')} checked={c.memoriaCompartilhada} onChange={(v) => setC({ memoriaCompartilhada: v })} />
          </div>
        </div>
      </Block>
      <Block title={t('codeLibrary.blockAtributos')}>
        <SubTable
          title={t('codeLibrary.blockAtributos')}
          columns={[
            { key: 'atributo', label: t('codeLibrary.colAtributo'), width: 130 },
            { key: 'tipo', label: t('codeLibrary.colTipoAtrib'), width: 90 },
            { key: 'visibilidade', label: t('codeLibrary.colVisibilidade'), width: 100 },
            { key: 'readOnly', label: t('codeLibrary.colReadOnly'), type: 'checkbox', width: 90 },
            { key: 'atribuicaoTipo', label: t('codeLibrary.colAtribuicaoTipo'), width: 90 },
            { key: 'tipoReferencia', label: t('codeLibrary.colTipoReferencia'), width: 130 },
            { key: 'descricao', label: t('codeLibrary.colDescricao'), width: 200 },
          ]}
          rows={atributos}
          onChange={(rows) => set({ atributos: rows })}
          t={t}
        />
      </Block>
      <Block title={t('codeLibrary.blockDeclaracoesProgressivas')} last>
        <SubTable
          title={t('codeLibrary.blockDeclaracoesProgressivas')}
          columns={[{ key: 'grpTipoCtgObjeto', label: t('codeLibrary.colGrpTipoCtgObjeto'), width: 220 }]}
          rows={declaracoesProgressivas}
          onChange={(rows) => set({ declaracoesProgressivas: rows })}
          t={t}
        />
      </Block>
    </>
  );
}

function ParamTable({ title, rows, onChange, t, hasValorProposto, hasOpcional, hasTransfer }) {
  const columns = [
    { key: 'nome', label: t('codeLibrary.colNomeParam'), width: 130 },
    { key: 'atribTipo', label: t('codeLibrary.colAtribTipo'), width: 80 },
    { key: 'tipoReferencia', label: t('codeLibrary.colTipoReferencia'), width: 130 },
  ];
  if (hasValorProposto) columns.push({ key: 'valorProposto', label: t('codeLibrary.colValorProposto'), width: 110 });
  if (hasOpcional) columns.push({ key: 'opcional', label: t('codeLibrary.colOpcional'), type: 'checkbox', width: 80 });
  if (hasTransfer) columns.push({ key: 'transfer', label: t('codeLibrary.colTransfer'), type: 'checkbox', width: 100 });
  columns.push({ key: 'textoBreve', label: t('codeLibrary.colTextoBreve'), width: 200 });
  columns.push({ key: 'txtDescr', label: t('codeLibrary.colTxtDescr'), width: 130 });
  return <SubTable title={title} columns={columns} rows={rows} onChange={onChange} t={t} />;
}

function FunctionModuleConfig({ a, set, t }) {
  const { theme } = useTheme();
  const c = a.caracteristicas || {};
  const setC = (patch) => set({ caracteristicas: { ...c, ...patch } });

  return (
    <>
      <Block title={t('codeLibrary.blockCaracteristicas')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={t('codeLibrary.fGrupoFuncoes')}><input value={c.grupoFuncoes || ''} onChange={(e) => setC({ grupoFuncoes: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.fTextoBreve')}><input value={c.textoBreve || ''} onChange={(e) => setC({ textoBreve: e.target.value })} style={inputStyle(theme)} /></Field>
        </div>

        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>{t('codeLibrary.fTipoProcesso')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Radio label={t('codeLibrary.fTipoProcessoNormal')} checked={c.tipoProcesso === 'normal'} onChange={() => setC({ tipoProcesso: 'normal' })} />
            <Radio label={t('codeLibrary.fTipoProcessoRemoto')} checked={c.tipoProcesso === 'remoto'} onChange={() => setC({ tipoProcesso: 'remoto' })} />
            {c.tipoProcesso === 'remoto' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginLeft: 24 }}>
                <Field label={t('codeLibrary.fAcessibilidade')}><input value={c.acessibilidade || ''} onChange={(e) => setC({ acessibilidade: e.target.value })} style={inputStyle(theme)} /></Field>
                <Field label={t('codeLibrary.fContratoInterface')}><input value={c.contratoInterface || ''} onChange={(e) => setC({ contratoInterface: e.target.value })} style={inputStyle(theme)} /></Field>
                <Checkbox label={t('codeLibrary.fBasXmlSuportado')} checked={c.basXmlSuportado} onChange={(v) => setC({ basXmlSuportado: v })} />
              </div>
            )}
            <Radio label={t('codeLibrary.fTipoProcessoAtualizacao')} checked={c.tipoProcesso === 'atualizacao'} onChange={() => setC({ tipoProcesso: 'atualizacao' })} />
            {c.tipoProcesso === 'atualizacao' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 24 }}>
                <Radio label={t('codeLibrary.fAtualizacaoImediato')} checked={c.atualizacaoTipo === 'imediato'} onChange={() => setC({ atualizacaoTipo: 'imediato' })} />
                <Radio label={t('codeLibrary.fAtualizacaoImediatoSemPoster')} checked={c.atualizacaoTipo === 'imediatoSemPoster'} onChange={() => setC({ atualizacaoTipo: 'imediatoSemPoster' })} />
                <Radio label={t('codeLibrary.fAtualizacaoRetardado')} checked={c.atualizacaoTipo === 'retardado'} onChange={() => setC({ atualizacaoTipo: 'retardado' })} />
                <Radio label={t('codeLibrary.fAtualizacaoExecColetiva')} checked={c.atualizacaoTipo === 'execColetiva'} onChange={() => setC({ atualizacaoTipo: 'execColetiva' })} />
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={t('codeLibrary.fResponsavel')}><input value={c.responsavel || ''} onChange={(e) => setC({ responsavel: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.fUltimoModificador')}><input value={c.ultimoModificador || ''} onChange={(e) => setC({ ultimoModificador: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.fDataModificacao')}><input value={c.dataModificacao || ''} onChange={(e) => setC({ dataModificacao: e.target.value })} placeholder="DD.MM.AAAA" style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.fPacote')}><input value={c.pacote || ''} onChange={(e) => setC({ pacote: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.fNomePrograma')}><input value={c.nomePrograma || ''} onChange={(e) => setC({ nomePrograma: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.fNomeInclude')}><input value={c.nomeInclude || ''} onChange={(e) => setC({ nomeInclude: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.fIdiomaOriginal')}><input value={c.idiomaOriginal || ''} onChange={(e) => setC({ idiomaOriginal: e.target.value })} style={inputStyle(theme)} /></Field>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', paddingTop: 18 }}>
            <Checkbox label={t('codeLibrary.fNaoLiberado')} checked={c.naoLiberado} onChange={(v) => setC({ naoLiberado: v })} />
            <Checkbox label={t('codeLibrary.fBloqueioProcesso')} checked={c.bloqueioProcesso} onChange={(v) => setC({ bloqueioProcesso: v })} />
            <Checkbox label={t('codeLibrary.fGlobal')} checked={c.global} onChange={(v) => setC({ global: v })} />
          </div>
        </div>
      </Block>

      <Block title={t('codeLibrary.blockImportacao')}>
        <ParamTable title={t('codeLibrary.blockImportacao')} rows={a.importacao || []} onChange={(rows) => set({ importacao: rows })} t={t} hasValorProposto hasOpcional hasTransfer />
      </Block>
      <Block title={t('codeLibrary.blockExportacao')}>
        <ParamTable title={t('codeLibrary.blockExportacao')} rows={a.exportacao || []} onChange={(rows) => set({ exportacao: rows })} t={t} hasTransfer />
      </Block>
      <Block title={t('codeLibrary.blockModificacao')}>
        <ParamTable title={t('codeLibrary.blockModificacao')} rows={a.modificacao || []} onChange={(rows) => set({ modificacao: rows })} t={t} hasValorProposto hasOpcional hasTransfer />
      </Block>
      <Block title={t('codeLibrary.blockTabelas')}>
        <ParamTable title={t('codeLibrary.blockTabelas')} rows={a.tabelas || []} onChange={(rows) => set({ tabelas: rows })} t={t} hasOpcional />
      </Block>
      <Block title={t('codeLibrary.blockExcecoes')} last>
        <SubTable
          title={t('codeLibrary.blockExcecoes')}
          columns={[{ key: 'excecao', label: t('codeLibrary.colExcecao'), width: 150 }, { key: 'textoBreve', label: t('codeLibrary.colTextoBreve'), width: 250 }, { key: 'txtDescr', label: t('codeLibrary.colTxtDescr'), width: 130 }]}
          rows={a.excecoes || []}
          onChange={(rows) => set({ excecoes: rows })}
          t={t}
        />
      </Block>
    </>
  );
}

function TableConfig({ a, set, t }) {
  const { theme } = useTheme();
  const entrega = a.entrega || {};
  const setEntrega = (patch) => set({ entrega: { ...entrega, ...patch } });
  const tecnico = a.tecnico || {};
  const setTecnico = (patch) => set({ tecnico: { ...tecnico, ...patch } });
  const bufferingTipo = tecnico.bufferingTipo || {};
  const setBufferingTipo = (patch) => setTecnico({ bufferingTipo: { ...bufferingTipo, ...patch } });

  return (
    <>
      <Block title={t('codeLibrary.blockEntrega')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={t('codeLibrary.tbClasseEntrega')}>
            <select value={entrega.classeEntrega || 'A'} onChange={(e) => setEntrega({ classeEntrega: e.target.value })} style={inputStyle(theme)}>
              {['A', 'C', 'L', 'G', 'E', 'S', 'W'].map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
            </select>
          </Field>
          <Field label={t('codeLibrary.tbDataBrowser')}><input value={entrega.dataBrowser || ''} onChange={(e) => setEntrega({ dataBrowser: e.target.value })} style={inputStyle(theme)} /></Field>
        </div>
      </Block>

      <Block title={t('codeLibrary.blockCampos')}>
        <SubTable
          title={t('codeLibrary.blockCampos')}
          columns={[
            { key: 'campo', label: t('codeLibrary.colCampo'), width: 120 },
            { key: 'chave', label: t('codeLibrary.colChave'), type: 'checkbox', width: 70 },
            { key: 'valObrigatorio', label: t('codeLibrary.colValObrigatorio'), type: 'checkbox', width: 80 },
            { key: 'elementoDados', label: t('codeLibrary.colElementoDados'), width: 130 },
            { key: 'ctgDados', label: t('codeLibrary.colCtgDados'), width: 90 },
            { key: 'compr', label: t('codeLibrary.colCompr'), width: 70 },
            { key: 'casasDecimais', label: t('codeLibrary.colCasasDecimais'), width: 90 },
            { key: 'descricaoBreve', label: t('codeLibrary.colDescricaoBreve'), width: 200 },
          ]}
          rows={a.campos || []}
          onChange={(rows) => set({ campos: rows })}
          t={t}
        />
      </Block>

      <Block title={t('codeLibrary.blockTecnico')} last>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={t('codeLibrary.tbCategoriaDados')}><input value={tecnico.categoriaDados || ''} onChange={(e) => setTecnico({ categoriaDados: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.tbCtgTamanho')}><input value={tecnico.ctgTamanho || ''} onChange={(e) => setTecnico({ ctgTamanho: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.tbTpCompartmt')}><input value={tecnico.tpCompartmt || ''} onChange={(e) => setTecnico({ tpCompartmt: e.target.value })} style={inputStyle(theme)} /></Field>
        </div>

        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>{t('codeLibrary.tbBuffering')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Radio label={t('codeLibrary.tbBufferingNaoPermitido')} checked={tecnico.buffering === 'naoPermitido'} onChange={() => setTecnico({ buffering: 'naoPermitido' })} />
            <Radio label={t('codeLibrary.tbBufferingPermitidoDesativado')} checked={tecnico.buffering === 'permitidoDesativado'} onChange={() => setTecnico({ buffering: 'permitidoDesativado' })} />
            <Radio label={t('codeLibrary.tbBufferingAtivado')} checked={tecnico.buffering === 'ativado'} onChange={() => setTecnico({ buffering: 'ativado' })} />
          </div>
        </div>

        {tecnico.buffering === 'ativado' && (
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, marginBottom: 8 }}>{t('codeLibrary.tbBufferingTipo')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Checkbox label={t('codeLibrary.tbRegistosIndividuais')} checked={bufferingTipo.registosIndividuais} onChange={(v) => setBufferingTipo({ registosIndividuais: v })} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Checkbox label={t('codeLibrary.tbAreaGeral')} checked={bufferingTipo.areaGeral} onChange={(v) => setBufferingTipo({ areaGeral: v })} />
                {bufferingTipo.areaGeral && (
                  <input value={tecnico.numCamposChave || ''} onChange={(e) => setTecnico({ numCamposChave: e.target.value })} placeholder={t('codeLibrary.tbNumCamposChave')} style={{ ...inputStyle(theme), width: 140 }} />
                )}
              </div>
              <Checkbox label={t('codeLibrary.tbTotalmenteArmazenado')} checked={bufferingTipo.totalmenteArmazenado} onChange={(v) => setBufferingTipo({ totalmenteArmazenado: v })} />
            </div>
          </div>
        )}

        <div>
          <Checkbox label={t('codeLibrary.tbRegistrarLog')} checked={tecnico.registrarLog} onChange={(v) => setTecnico({ registrarLog: v })} />
          {tecnico.registrarLog && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
              <Field label={t('codeLibrary.tbAvaliacao')}><input value={tecnico.avaliacao || ''} onChange={(e) => setTecnico({ avaliacao: e.target.value })} style={inputStyle(theme)} /></Field>
              <Field label={t('codeLibrary.tbMotivo')}><input value={tecnico.motivo || ''} onChange={(e) => setTecnico({ motivo: e.target.value })} style={inputStyle(theme)} /></Field>
            </div>
          )}
        </div>
      </Block>
    </>
  );
}

function DataElementConfig({ a, set, t }) {
  const { theme } = useTheme();
  const ctgDds = a.ctgDds || {};
  const setCtgDds = (patch) => set({ ctgDds: { ...ctgDds, ...patch } });
  const denom = a.denominacaoCampo || {};
  const setDenom = (patch) => set({ denominacaoCampo: { ...denom, ...patch } });

  return (
    <>
      <Block title={t('codeLibrary.blockCtgDds')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Radio label={t('codeLibrary.deDominio')} checked={ctgDds.categoria === 'dominio'} onChange={() => setCtgDds({ categoria: 'dominio' })} />
          {ctgDds.categoria === 'dominio' && (
            <div style={{ marginLeft: 24 }}>
              <Field label={t('codeLibrary.deDominio')}><input value={ctgDds.dominio || ''} onChange={(e) => setCtgDds({ dominio: e.target.value })} style={inputStyle(theme)} /></Field>
            </div>
          )}

          <Radio label={t('codeLibrary.deTipoIncorporado')} checked={ctgDds.categoria === 'tipoIncorporado'} onChange={() => setCtgDds({ categoria: 'tipoIncorporado' })} />
          {ctgDds.categoria === 'tipoIncorporado' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginLeft: 24 }}>
              <Field label={t('codeLibrary.deCtgDados')}><input value={ctgDds.tipoIncorporadoCtgDados || ''} onChange={(e) => setCtgDds({ tipoIncorporadoCtgDados: e.target.value })} style={inputStyle(theme)} /></Field>
              <Field label={t('codeLibrary.deCompr')}><input value={ctgDds.tipoIncorporadoCompr || ''} onChange={(e) => setCtgDds({ tipoIncorporadoCompr: e.target.value })} style={inputStyle(theme)} /></Field>
            </div>
          )}

          <Radio label={t('codeLibrary.deTipoReferencia')} checked={ctgDds.categoria === 'tipoReferencia'} onChange={() => setCtgDds({ categoria: 'tipoReferencia' })} />
          {ctgDds.categoria === 'tipoReferencia' && (
            <div style={{ marginLeft: 24 }}>
              <Field label={t('codeLibrary.deNomeTipoRefer')}><input value={ctgDds.nomeTipoRefer || ''} onChange={(e) => setCtgDds({ nomeTipoRefer: e.target.value })} style={inputStyle(theme)} /></Field>
            </div>
          )}

          <Radio label={t('codeLibrary.deReferenciaTipoInstalado')} checked={ctgDds.categoria === 'referenciaTipoInstalado'} onChange={() => setCtgDds({ categoria: 'referenciaTipoInstalado' })} />
          {ctgDds.categoria === 'referenciaTipoInstalado' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginLeft: 24 }}>
              <Field label={t('codeLibrary.deTpDados')}><input value={ctgDds.refInstaladoTpDados || ''} onChange={(e) => setCtgDds({ refInstaladoTpDados: e.target.value })} style={inputStyle(theme)} /></Field>
              <Field label={t('codeLibrary.deCompr')}><input value={ctgDds.refInstaladoCompr || ''} onChange={(e) => setCtgDds({ refInstaladoCompr: e.target.value })} style={inputStyle(theme)} /></Field>
            </div>
          )}
        </div>
      </Block>

      <Block title={t('codeLibrary.blockDenominacaoCampo')} last>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={t('codeLibrary.deDenomCurto')}><input value={denom.curto || ''} onChange={(e) => setDenom({ curto: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.deDenomMedio')}><input value={denom.medio || ''} onChange={(e) => setDenom({ medio: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.deDenomLongo')}><input value={denom.longo || ''} onChange={(e) => setDenom({ longo: e.target.value })} style={inputStyle(theme)} /></Field>
          <Field label={t('codeLibrary.deDenomHeading')}><input value={denom.heading || ''} onChange={(e) => setDenom({ heading: e.target.value })} style={inputStyle(theme)} /></Field>
        </div>
      </Block>
    </>
  );
}

function DomainConfig({ a, set, t }) {
  const { theme } = useTheme();
  const def = a.definicao || {};
  const setDef = (patch) => set({ definicao: { ...def, ...patch } });

  return (
    <>
      <Block title={t('codeLibrary.blockDefinicao')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Field label={t('codeLibrary.doCtgDados')}>
              <select value={def.ctgDados || 'CHAR'} onChange={(e) => setDef({ ctgDados: e.target.value })} style={inputStyle(theme)}>
                {['CHAR', 'NUMC', 'DEC', 'DATS', 'TIMS', 'INT4', 'CUKY', 'QUAN', 'STRG'].map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
              </select>
            </Field>
            <Field label={t('codeLibrary.doNumPosicoes')}><input value={def.numPosicoes || ''} onChange={(e) => setDef({ numPosicoes: e.target.value })} style={inputStyle(theme)} /></Field>
            <Field label={t('codeLibrary.doCasasDecimais')}><input value={def.casasDecimais || ''} onChange={(e) => setDef({ casasDecimais: e.target.value })} style={inputStyle(theme)} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label={t('codeLibrary.doComprSaida')}><input value={def.comprSaida || ''} onChange={(e) => setDef({ comprSaida: e.target.value })} style={inputStyle(theme)} /></Field>
            <Field label={t('codeLibrary.doRotinaConversao')}><input value={def.rotinaConversao || ''} onChange={(e) => setDef({ rotinaConversao: e.target.value })} style={inputStyle(theme)} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            <Checkbox label={t('codeLibrary.doSinal')} checked={def.sinal} onChange={(v) => setDef({ sinal: v })} />
            <Checkbox label={t('codeLibrary.doMinusculas')} checked={def.minusculas} onChange={(v) => setDef({ minusculas: v })} />
          </div>
        </div>
      </Block>

      <Block title={t('codeLibrary.blockValoresFixos')} last>
        <SubTable
          title={t('codeLibrary.blockValoresFixos')}
          columns={[
            { key: 'inferior', label: t('codeLibrary.colInferior'), width: 110 },
            { key: 'superior', label: t('codeLibrary.colSuperior'), width: 110 },
            { key: 'texto', label: t('codeLibrary.colTextoBreve'), width: 240 },
          ]}
          rows={a.valoresFixos || []}
          onChange={(rows) => set({ valoresFixos: rows })}
          t={t}
        />
      </Block>
    </>
  );
}

export default function CodeLibrary() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const { refresh: refreshCounts } = useCounts();
  const location = useLocation();

  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [search, setSearch] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderParentId, setNewFolderParentId] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderKind, setNewFolderKind] = useState('program');
  const [newItemMenuOpen, setNewItemMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [folderTagInput, setFolderTagInput] = useState('');
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set());
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const newItemMenuRef = useRef(null);
  const linkMenuRef = useRef(null);
  useClickOutside(newItemMenuRef, () => setNewItemMenuOpen(false), newItemMenuOpen);
  useClickOutside(linkMenuRef, () => setLinkMenuOpen(false), linkMenuOpen);

  const toggleCollapsed = (id) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    api.listCodeFolders().then(({ folders }) => {
      setFolders(folders);
      const wanted = location.state?.folderId;
      if (wanted && folders.some((f) => f.id === wanted)) setSelectedFolderId(wanted);
      else if (folders.length > 0) setSelectedFolderId(folders[0].id);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedFolderId) {
      setItems([]);
      setSelectedItemId(null);
      return;
    }
    api.listCodeItems(selectedFolderId).then(({ items }) => {
      setItems(items);
      setSelectedItemId(items[0]?.id || null);
    });
  }, [selectedFolderId]);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId) || null;
  const selectedItem = items.find((i) => i.id === selectedItemId) || null;
  const filteredFolders = folders.filter((f) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      f.name.toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q) ||
      (f.tags || []).some((tag) => tag.toLowerCase().includes(q))
    );
  });

  const linkedFolders = (selectedFolder?.linkedFolderIds || [])
    .map((id) => folders.find((f) => f.id === id))
    .filter(Boolean);
  const linkCandidates = selectedFolder
    ? folders.filter((f) => {
        if (f.id === selectedFolder.id) return false;
        if ((selectedFolder.linkedFolderIds || []).includes(f.id)) return false;
        const q = linkSearch.trim().toLowerCase();
        return !q || f.name.toLowerCase().includes(q);
      })
    : [];

  const updateFolderMeta = async (id, patch) => {
    const { folder } = await api.updateCodeFolder(id, patch);
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, ...folder } : f)));
  };

  const addFolderTag = () => {
    const tag = folderTagInput.trim();
    if (!tag || !selectedFolder) return;
    const tags = [...(selectedFolder.tags || [])];
    if (!tags.includes(tag)) {
      setFolders((prev) => prev.map((f) => (f.id === selectedFolder.id ? { ...f, tags: [...tags, tag] } : f)));
      updateFolderMeta(selectedFolder.id, { tags: [...tags, tag] });
    }
    setFolderTagInput('');
  };

  const removeFolderTag = (tag) => {
    if (!selectedFolder) return;
    const tags = (selectedFolder.tags || []).filter((x) => x !== tag);
    setFolders((prev) => prev.map((f) => (f.id === selectedFolder.id ? { ...f, tags } : f)));
    updateFolderMeta(selectedFolder.id, { tags });
  };

  const addFolderLink = (id) => {
    if (!selectedFolder) return;
    const linkedFolderIds = [...(selectedFolder.linkedFolderIds || [])];
    if (!linkedFolderIds.includes(id)) {
      const next = [...linkedFolderIds, id];
      setFolders((prev) => prev.map((f) => (f.id === selectedFolder.id ? { ...f, linkedFolderIds: next } : f)));
      updateFolderMeta(selectedFolder.id, { linkedFolderIds: next });
    }
    setLinkSearch('');
    setLinkMenuOpen(false);
  };

  const removeFolderLink = (id) => {
    if (!selectedFolder) return;
    const linkedFolderIds = (selectedFolder.linkedFolderIds || []).filter((x) => x !== id);
    setFolders((prev) => prev.map((f) => (f.id === selectedFolder.id ? { ...f, linkedFolderIds } : f)));
    updateFolderMeta(selectedFolder.id, { linkedFolderIds });
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const { folder } = await api.createCodeFolder({ name: newFolderName.trim(), kind: newFolderKind, parentId: newFolderParentId });
    setFolders((prev) => [folder, ...prev]);
    setSelectedFolderId(folder.id);
    setNewFolderName('');
    setNewFolderKind('program');
    setNewFolderOpen(false);
    setNewFolderParentId(null);
    refreshCounts();
  };

  const deleteFolder = async (id) => {
    const ok = await confirm({ title: t('common.confirmDeleteTitle'), message: t('codeLibrary.deleteFolderConfirm'), confirmLabel: t('common.deleteForever') });
    if (!ok) return;
    const deleted = folders.find((f) => f.id === id);
    await api.deleteCodeFolder(id);
    setFolders((prev) =>
      prev.filter((f) => f.id !== id).map((f) => (f.parentId === id ? { ...f, parentId: deleted?.parentId ?? null } : f))
    );
    if (selectedFolderId === id) setSelectedFolderId(folders.find((f) => f.id !== id)?.id || null);
    refreshCounts();
  };

  const reparentFolder = async (folderId, parentId) => {
    if (folderId === parentId) return;
    const target = folders.find((f) => f.id === folderId);
    if (!target || target.parentId === parentId) return;
    let ancestor = parentId;
    while (ancestor) {
      if (ancestor === folderId) return; // would create a cycle
      ancestor = folders.find((f) => f.id === ancestor)?.parentId || null;
    }
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, parentId } : f)));
    await updateFolderMeta(folderId, { parentId });
  };

  const createItem = async (type) => {
    if (!selectedFolder) return;
    const nameKeys = {
      snippet: 'newSnippetName',
      characteristics: selectedFolder.kind === 'class' ? 'nameConfigClass' : selectedFolder.kind === 'function_module' ? 'nameConfigFunctionModule' : 'nameConfigProgram',
      table: 'nameTable',
      data_element: 'nameDataElement',
      domain: 'nameDomain',
    };
    const { item } = await api.createCodeItem(selectedFolder.id, {
      type,
      name: t(`codeLibrary.${nameKeys[type]}`),
      language: 'abap',
      content: type === 'snippet' ? '' : null,
      attributes: type === 'snippet' ? null : defaultAttributes(type, selectedFolder.kind),
    });
    setItems((prev) => [...prev, item]);
    setSelectedItemId(item.id);
    setNewItemMenuOpen(false);
    setFolders((prev) => prev.map((f) => (f.id === selectedFolder.id ? { ...f, itemCount: (f.itemCount || 0) + 1 } : f)));
  };

  const updateItem = async (patch) => {
    if (!selectedItem) return;
    const { item } = await api.updateCodeItem(selectedItem.id, patch);
    setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
  };

  const deleteItem = async (id) => {
    const ok = await confirm({ title: t('common.confirmDeleteTitle'), message: t('codeLibrary.deleteItemConfirm'), confirmLabel: t('common.deleteForever') });
    if (!ok) return;
    await api.deleteCodeItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selectedItemId === id) setSelectedItemId(items.find((i) => i.id !== id)?.id || null);
    if (selectedFolder) setFolders((prev) => prev.map((f) => (f.id === selectedFolder.id ? { ...f, itemCount: Math.max(0, (f.itemCount || 1) - 1) } : f)));
  };

  const kindLabel = (kind) => t(`codeLibrary.kind${kind === 'program' ? 'Program' : kind === 'class' ? 'Class' : kind === 'function_module' ? 'FunctionModule' : 'Other'}`);
  const configLabel = (kind) => t(`codeLibrary.newConfig${kind === 'class' ? 'Class' : kind === 'function_module' ? 'FunctionModule' : 'Program'}`);
  const itemTypesFor = (kind) => (kind === 'other' ? ITEM_TYPES.filter((t) => t !== 'characteristics') : ITEM_TYPES);

  const rowStyle = (isActive) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
    background: isActive ? theme.accentSoftBg : 'transparent', color: isActive ? theme.accentText : theme.textMuted,
  });

  const renderFolderNode = (f, depth) => {
    const kids = folders.filter((c) => c.parentId === f.id);
    const hasKids = kids.length > 0;
    const collapsed = collapsedFolders.has(f.id);
    return (
      <div key={f.id}>
        <div
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/code-folder-id', f.id)}
          onDragOver={(e) => { e.preventDefault(); setDragOverFolderId(f.id); }}
          onDragLeave={() => setDragOverFolderId((v) => (v === f.id ? null : v))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverFolderId(null);
            const draggedId = e.dataTransfer.getData('text/code-folder-id');
            if (draggedId) reparentFolder(draggedId, f.id);
          }}
          onClick={() => setSelectedFolderId(f.id)}
          style={{
            ...rowStyle(selectedFolderId === f.id),
            paddingLeft: 10 + depth * 16,
            outline: dragOverFolderId === f.id ? `2px dashed ${theme.accent}` : 'none',
            outlineOffset: -2,
          }}
        >
          {hasKids ? (
            <span
              onClick={(e) => { e.stopPropagation(); toggleCollapsed(f.id); }}
              style={{ display: 'flex', cursor: 'pointer', opacity: 0.6, flexShrink: 0, transform: collapsed ? 'none' : 'rotate(90deg)' }}
            >
              <Icon name="chevron" size={11} />
            </span>
          ) : (
            <span style={{ width: 11, flexShrink: 0 }} />
          )}
          <Icon name="folder" size={15} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
            <div style={{ fontSize: 10.5, opacity: 0.7 }}>{kindLabel(f.kind)}</div>
          </div>
          <span
            onClick={(e) => { e.stopPropagation(); setNewFolderParentId(f.id); setNewFolderOpen(true); }}
            title={t('codeLibrary.newSubfolder')}
            style={{ display: 'flex', opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="plus" size={12} />
          </span>
          <span style={{ fontSize: 11.5, opacity: 0.7, flexShrink: 0 }}>{f.itemCount}</span>
        </div>
        {hasKids && !collapsed && kids.map((k) => renderFolderNode(k, depth + 1))}
      </div>
    );
  };

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
      <div style={{ flex: '1 1 280px', minWidth: 240, maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px' }}>
          <span style={{ opacity: 0.5, display: 'flex' }}><Icon name="search" size={15} /></span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('codeLibrary.searchPlaceholder')}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
          />
        </div>

        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {filteredFolders.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('codeLibrary.noFolders')}</div>}
          {search.trim()
            ? filteredFolders.map((f) => (
                <div key={f.id} onClick={() => setSelectedFolderId(f.id)} style={rowStyle(selectedFolderId === f.id)}>
                  <Icon name="folder" size={15} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                    <div style={{ fontSize: 10.5, opacity: 0.7 }}>{kindLabel(f.kind)}</div>
                  </div>
                  <span style={{ fontSize: 11.5, opacity: 0.7 }}>{f.itemCount}</span>
                </div>
              ))
            : folders
                .filter((f) => !f.parentId)
                .map((f) => renderFolderNode(f, 0))}

          {newFolderOpen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 4px 2px' }}>
              {newFolderParentId && (
                <div style={{ fontSize: 11, color: theme.textMuted }}>
                  {t('codeLibrary.newFolderInside', { name: folders.find((f) => f.id === newFolderParentId)?.name || '' })}
                </div>
              )}
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                placeholder={t('codeLibrary.newFolderNamePlaceholder')}
                autoFocus
                style={{ border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
              <select value={newFolderKind} onChange={(e) => setNewFolderKind(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}>
                {FOLDER_KINDS.map((k) => <option key={k} value={k} style={optionStyle}>{kindLabel(k)}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={createFolder} style={{ flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {t('common.add')}
                </button>
                <button onClick={() => { setNewFolderOpen(false); setNewFolderParentId(null); }} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => { setNewFolderParentId(null); setNewFolderOpen(true); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: theme.accent, color: '#fff', borderRadius: 8, padding: '9px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', marginTop: 2 }}
            >
              <Icon name="plus" size={13} color="#fff" /> {t('codeLibrary.newFolder')}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: '1 1 240px', minWidth: 220, maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {selectedFolder ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedFolder.name}</div>
                <div style={{ fontSize: 11.5, color: theme.textMuted }}>{kindLabel(selectedFolder.kind)}</div>
              </div>
              <span onClick={() => updateFolderMeta(selectedFolder.id, { favorite: !selectedFolder.favorite })} style={{ cursor: 'pointer', display: 'flex' }}>
                <Icon name="pin" size={15} color={selectedFolder.favorite ? theme.accentText : theme.textMuted} />
              </span>
              <span onClick={() => deleteFolder(selectedFolder.id)} style={{ cursor: 'pointer', color: theme.textMuted, display: 'flex' }}>
                <Icon name="trash" size={15} />
              </span>
            </div>

            <textarea
              value={selectedFolder.description || ''}
              onChange={(e) => setFolders((prev) => prev.map((f) => (f.id === selectedFolder.id ? { ...f, description: e.target.value } : f)))}
              onBlur={(e) => updateFolderMeta(selectedFolder.id, { description: e.target.value })}
              placeholder={t('codeLibrary.folderDescriptionPlaceholder')}
              rows={2}
              style={{ ...inputStyle(theme), resize: 'none', fontSize: 12, fontFamily: 'inherit' }}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {(selectedFolder.tags || []).map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
                    background: theme.accentSoftBg, color: theme.accentText,
                  }}
                >
                  {tag}
                  <span onClick={() => removeFolderTag(tag)} style={{ cursor: 'pointer', opacity: 0.7 }}>&times;</span>
                </span>
              ))}
              <input
                value={folderTagInput}
                onChange={(e) => setFolderTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addFolderTag()}
                onBlur={addFolderTag}
                placeholder={t('codeLibrary.addTag')}
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 11, color: theme.textPrimary, width: 72 }}
              />
            </div>

            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                {t('codeLibrary.relatedFolders')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {linkedFolders.map((lf) => (
                  <span
                    key={lf.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
                      background: theme.subtleBg, color: theme.textPrimary, border: `1px solid ${theme.border}`,
                    }}
                  >
                    <span onClick={() => setSelectedFolderId(lf.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="folder" size={11} /> {lf.name}
                    </span>
                    <span onClick={() => removeFolderLink(lf.id)} style={{ cursor: 'pointer', opacity: 0.7 }}>&times;</span>
                  </span>
                ))}
                <div ref={linkMenuRef} style={{ position: 'relative' }}>
                  <span
                    onClick={() => setLinkMenuOpen((v) => !v)}
                    style={{ fontSize: 11, fontWeight: 600, color: theme.accentText, cursor: 'pointer' }}
                  >
                    {t('codeLibrary.linkFolder')}
                  </span>
                  {linkMenuOpen && (
                    <div
                      style={{
                        position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, width: 220,
                        background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
                        borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
                      }}
                    >
                      <input
                        value={linkSearch}
                        onChange={(e) => setLinkSearch(e.target.value)}
                        placeholder={t('codeLibrary.searchFoldersPlaceholder')}
                        autoFocus
                        style={{ border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 12, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
                      />
                      <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {linkCandidates.length === 0 && (
                          <div style={{ fontSize: 11.5, color: theme.textMuted, padding: '4px 2px' }}>{t('codeLibrary.noFoldersToLink')}</div>
                        )}
                        {linkCandidates.map((f) => (
                          <div
                            key={f.id}
                            onClick={() => addFolderLink(f.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: theme.textPrimary }}
                          >
                            <Icon name="folder" size={13} /> {f.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {items.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('codeLibrary.noItems')}</div>}
              {items.map((it) => (
                <div key={it.id} onClick={() => setSelectedItemId(it.id)} style={rowStyle(selectedItemId === it.id)}>
                  <Icon name={ITEM_ICON[it.type] || 'doc'} size={15} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                </div>
              ))}
            </div>

            <div ref={newItemMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
              <div
                onClick={() => setNewItemMenuOpen((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: theme.accent, color: '#fff', borderRadius: 8, padding: '9px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
              >
                <Icon name="plus" size={13} color="#fff" /> {t('codeLibrary.newItem')}
              </div>
              {newItemMenuOpen && (
                <div
                  style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20,
                    background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
                    borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                >
                  {itemTypesFor(selectedFolder.kind).map((type) => (
                    <div
                      key={type}
                      onClick={() => createItem(type)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: theme.textPrimary }}
                    >
                      <Icon name={ITEM_ICON[type]} size={14} />
                      {type === 'characteristics' ? configLabel(selectedFolder.kind) : t(`codeLibrary.new${type === 'snippet' ? 'Snippet' : type === 'table' ? 'Table' : type === 'data_element' ? 'DataElement' : 'Domain'}`)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ padding: 20, fontSize: 13, color: theme.textMuted }}>{t('codeLibrary.selectFolder')}</div>
        )}
      </div>

      <div style={{ flex: 2, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', padding: '2px 18px 24px 2px' }}>
        {selectedItem && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                value={selectedItem.name}
                onChange={(e) => setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, name: e.target.value } : i)))}
                onBlur={(e) => updateItem({ name: e.target.value })}
                placeholder={t('codeLibrary.itemNamePlaceholder')}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 20, fontWeight: 700, color: theme.textPrimary }}
              />
              <span onClick={() => deleteItem(selectedItem.id)} style={{ cursor: 'pointer', color: theme.textMuted, display: 'flex' }}>
                <Icon name="trash" size={16} />
              </span>
            </div>

            {selectedItem.type === 'snippet' && (
              <CodeBlock
                value={selectedItem.content || ''}
                language={selectedItem.language || 'abap'}
                onChange={(value) => {
                  setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, content: value } : i)));
                  updateItem({ content: value });
                }}
                onLanguageChange={(language) => updateItem({ language })}
                onDelete={() => deleteItem(selectedItem.id)}
              />
            )}

            {selectedItem.type === 'characteristics' && selectedFolder?.kind === 'program' && (
              <ProgramConfig a={selectedItem.attributes || {}} set={(patch) => updateItem({ attributes: { ...selectedItem.attributes, ...patch } })} t={t} />
            )}
            {selectedItem.type === 'characteristics' && selectedFolder?.kind === 'class' && (
              <ClassConfig a={selectedItem.attributes || {}} set={(patch) => updateItem({ attributes: { ...selectedItem.attributes, ...patch } })} t={t} />
            )}
            {selectedItem.type === 'characteristics' && selectedFolder?.kind === 'function_module' && (
              <FunctionModuleConfig a={selectedItem.attributes || {}} set={(patch) => updateItem({ attributes: { ...selectedItem.attributes, ...patch } })} t={t} />
            )}
            {selectedItem.type === 'table' && (
              <TableConfig a={selectedItem.attributes || {}} set={(patch) => updateItem({ attributes: { ...selectedItem.attributes, ...patch } })} t={t} />
            )}
            {selectedItem.type === 'data_element' && (
              <DataElementConfig a={selectedItem.attributes || {}} set={(patch) => updateItem({ attributes: { ...selectedItem.attributes, ...patch } })} t={t} />
            )}
            {selectedItem.type === 'domain' && (
              <DomainConfig a={selectedItem.attributes || {}} set={(patch) => updateItem({ attributes: { ...selectedItem.attributes, ...patch } })} t={t} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
