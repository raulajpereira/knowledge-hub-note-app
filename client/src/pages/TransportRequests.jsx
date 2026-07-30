import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import DateInput from '../components/DateInput.jsx';
import { backdropClose } from '../lib/backdropClose.js';
import { useIsMobile } from '../lib/useIsMobile.js';

function Field({ label, children, theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      {children}
    </div>
  );
}

function inputStyle(theme) {
  return {
    border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg,
    color: theme.textPrimary, outline: 'none', width: '100%', boxSizing: 'border-box',
  };
}

function FlagPill({ label, on, theme }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
      background: on ? 'oklch(0.88 0.13 150)' : theme.subtleBg,
      color: on ? 'oklch(0.32 0.15 150)' : theme.textMuted,
      border: `1px solid ${on ? 'oklch(0.75 0.15 150)' : theme.border}`,
    }}>
      {label}
    </span>
  );
}

const emptyForm = { code: '', description: '', projectId: '', systemId: '', environment: '', liberada: false, transportQas: false, transportPrd: false, plannedDate: '', notes: '' };

export default function TransportRequests() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    Promise.all([api.listTransportRequests(), api.listProjects(), api.listSapSystems()]).then(([trRes, projRes, sysRes]) => {
      setItems(trRes.transportRequests);
      setProjects(projRes.projects);
      setSystems(sysRes.systems);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((tr) => {
      if (projectFilter !== 'all' && tr.projectId !== projectFilter) return false;
      if (!q) return true;
      return tr.code.toLowerCase().includes(q) || (tr.description || '').toLowerCase().includes(q);
    });
  }, [items, search, projectFilter]);

  const openNew = () => {
    setForm(emptyForm);
    setEditing({});
  };

  const openEdit = (tr) => {
    setForm({
      code: tr.code, description: tr.description || '', projectId: tr.projectId || '', systemId: tr.systemId || '',
      environment: tr.environment || '', liberada: tr.liberada, transportQas: tr.transportQas, transportPrd: tr.transportPrd,
      plannedDate: tr.plannedDate || '', notes: tr.notes || '',
    });
    setEditing(tr);
  };

  const closeModal = () => setEditing(null);

  const save = async () => {
    if (!form.code.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, projectId: form.projectId || null, systemId: form.systemId || null };
      if (editing?.id) {
        const { transportRequest } = await api.updateTransportRequest(editing.id, payload);
        setItems((prev) => prev.map((tr) => (tr.id === transportRequest.id ? transportRequest : tr)));
      } else {
        const { transportRequest } = await api.createTransportRequest(payload);
        setItems((prev) => [transportRequest, ...prev]);
      }
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing?.id) return;
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    await api.deleteTransportRequest(editing.id);
    setItems((prev) => prev.filter((tr) => tr.id !== editing.id));
    setEditing(null);
  };

  return (
    <div style={{ padding: isMobile ? 14 : '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{t('transportRequests.title')}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>{t('transportRequests.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '8px 12px' }}>
            <Icon name="search" size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('transportRequests.searchPlaceholder')}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: theme.textPrimary, width: isMobile ? 120 : 170 }}
            />
          </div>
          <button
            onClick={openNew}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            <Icon name="plus" size={14} color="#fff" /> {t('transportRequests.newTransport')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div
          onClick={() => setProjectFilter('all')}
          style={{ padding: '6px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: projectFilter === 'all' ? theme.accent : theme.subtleBg, color: projectFilter === 'all' ? '#fff' : theme.textMuted, border: `1px solid ${projectFilter === 'all' ? theme.accent : theme.border}` }}
        >
          {t('transportRequests.allProjects')}
        </div>
        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => setProjectFilter(p.id)}
            style={{ padding: '6px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: projectFilter === p.id ? theme.accent : theme.subtleBg, color: projectFilter === p.id ? '#fff' : theme.textMuted, border: `1px solid ${projectFilter === p.id ? theme.accent : theme.border}` }}
          >
            {p.name}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1.6fr 1fr 1fr 1.4fr', minWidth: '100%' }}>
          {!isMobile && ['transportRequests.colCode', 'transportRequests.colDescription', 'transportRequests.colProject', 'transportRequests.colSystem', 'transportRequests.colStatus'].map((k, i) => (
            <div key={i} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `2px solid ${theme.border}`, background: theme.subtleBg }}>
              {t(k)}
            </div>
          ))}
          {!loading && filtered.map((tr) => {
            const isHovered = hoveredId === tr.id;
            const cell = { padding: '12px 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', background: isHovered ? theme.subtleBg : 'transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
            const statusPills = (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <FlagPill label={t('transportRequests.flagLiberada')} on={tr.liberada} theme={theme} />
                <FlagPill label="QAS" on={tr.transportQas} theme={theme} />
                <FlagPill label="PRD" on={tr.transportPrd} theme={theme} />
              </div>
            );
            if (isMobile) {
              return (
                <div key={tr.id} onClick={() => openEdit(tr)} style={{ padding: '12px 14px', borderBottom: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 12.5, color: theme.accentText, background: theme.accentSoftBg, padding: '3px 8px', borderRadius: 6 }}>{tr.code}</span>
                    {tr.project && <span style={{ fontSize: 11, color: theme.textMuted }}>{tr.project.name}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: theme.textPrimary }}>{tr.description}</div>
                  {statusPills}
                </div>
              );
            }
            return (
              <div key={tr.id} style={{ display: 'contents' }} onMouseEnter={() => setHoveredId(tr.id)} onMouseLeave={() => setHoveredId(null)} onClick={() => openEdit(tr)}>
                <div style={cell}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 12.5, color: theme.accentText, background: theme.accentSoftBg, padding: '3px 8px', borderRadius: 6 }}>{tr.code}</span>
                </div>
                <div style={{ ...cell, whiteSpace: 'normal' }}><span style={{ color: theme.textPrimary }}>{tr.description}</span></div>
                <div style={cell}>{tr.project?.name || '—'}</div>
                <div style={cell}>{tr.system?.name || '—'}</div>
                <div style={{ ...cell, whiteSpace: 'normal' }}>{statusPills}</div>
              </div>
            );
          })}
        </div>
      </div>

      {editing !== null && (
        <div onMouseDown={backdropClose(closeModal)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 500, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
              border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{editing?.id ? editing.code : t('transportRequests.newTransport')}</div>
              <span onClick={closeModal} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 20, lineHeight: 1 }}>&times;</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={t('transportRequests.fieldCode')} theme={theme}>
                <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder={t('transportRequests.fieldCodePlaceholder')} style={{ ...inputStyle(theme), fontFamily: 'var(--font-mono)', fontWeight: 700 }} />
              </Field>
              <Field label={t('transportRequests.fieldPlannedDate')} theme={theme}>
                <DateInput value={form.plannedDate} onChange={(v) => setForm((f) => ({ ...f, plannedDate: v }))} style={inputStyle(theme)} />
              </Field>
            </div>

            <Field label={t('transportRequests.fieldDescription')} theme={theme}>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={inputStyle(theme)} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={t('transportRequests.fieldProject')} theme={theme}>
                <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} style={inputStyle(theme)}>
                  <option value="">{t('transportRequests.fieldProjectNone')}</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label={t('transportRequests.fieldSystem')} theme={theme}>
                <select value={form.systemId} onChange={(e) => setForm((f) => ({ ...f, systemId: e.target.value }))} style={inputStyle(theme)}>
                  <option value="">{t('transportRequests.fieldSystemNone')}</option>
                  {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>

            <Field label={t('transportRequests.fieldEnvironment')} theme={theme}>
              <input value={form.environment} onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))} placeholder={t('transportRequests.fieldEnvironmentPlaceholder')} style={inputStyle(theme)} />
            </Field>

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: theme.textPrimary, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.liberada} onChange={(e) => setForm((f) => ({ ...f, liberada: e.target.checked }))} /> {t('transportRequests.flagLiberada')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: theme.textPrimary, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.transportQas} onChange={(e) => setForm((f) => ({ ...f, transportQas: e.target.checked }))} /> {t('transportRequests.flagQas')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: theme.textPrimary, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.transportPrd} onChange={(e) => setForm((f) => ({ ...f, transportPrd: e.target.checked }))} /> {t('transportRequests.flagPrd')}
              </label>
            </div>

            <Field label={t('transportRequests.fieldNotes')} theme={theme}>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle(theme), resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              {editing?.id && (
                <button onClick={remove} style={{ background: 'transparent', border: `1px solid oklch(0.6 0.2 25)`, color: 'oklch(0.6 0.2 25)', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  <Icon name="trash" size={14} color="oklch(0.6 0.2 25)" />
                </button>
              )}
              <button onClick={closeModal} style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {t('common.cancel')}
              </button>
              <button onClick={save} disabled={saving || !form.code.trim()} style={{ flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving || !form.code.trim() ? 0.6 : 1 }}>
                {editing?.id ? t('common.save') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
