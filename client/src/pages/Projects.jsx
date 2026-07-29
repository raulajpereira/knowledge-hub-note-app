import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

const STATUSES = ['Ativo', 'Pausado', 'Concluído'];
const STATUS_HUES = { Ativo: 145, Pausado: 60, Concluído: 250 };
const COLOR_PRESETS = [250, 290, 60, 145, 20, 190, 330, 10];

function FieldLabel({ children, theme }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
      {children}
    </div>
  );
}

function StatusPill({ label, hue, active, onClick, theme }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        background: active ? `oklch(0.90 0.11 ${hue})` : theme.cardBg,
        color: active ? `oklch(0.32 0.17 ${hue})` : theme.textMuted,
        border: `1px solid ${active ? `oklch(0.90 0.11 ${hue})` : theme.border}`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? `oklch(0.55 0.20 ${hue})` : theme.textMuted, opacity: active ? 1 : 0.5, flexShrink: 0 }} />
      {label}
    </div>
  );
}

const emptyContact = () => ({ name: '', role: '', email: '', phone: '' });

export default function Projects() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [nameDraft, setNameDraft] = useState('');
  const [scopeDraft, setScopeDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [companyDraft, setCompanyDraft] = useState('');
  const [managerDraft, setManagerDraft] = useState('');
  const [contactsDraft, setContactsDraft] = useState([]);

  useEffect(() => {
    api.listProjects().then(({ projects }) => {
      setProjects(projects);
      setLoading(false);
    });
  }, []);

  const filtered = projects.filter((p) => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()));
  const selected = projects.find((p) => p.id === selectedId) || null;

  useEffect(() => {
    setNameDraft(selected?.name ?? '');
    setScopeDraft(selected?.scope ?? '');
    setDescDraft(selected?.description ?? '');
    setNotesDraft(selected?.notes ?? '');
    setCompanyDraft(selected?.company ?? '');
    setManagerDraft(selected?.manager ?? '');
    setContactsDraft(Array.isArray(selected?.contacts) ? selected.contacts : []);
  }, [selected?.id]);

  const patch = async (id, payload) => {
    const { project } = await api.updateProject(id, payload);
    setProjects((prev) => prev.map((p) => (p.id === id ? project : p)));
  };

  const commitField = (field, value) => {
    if (!selected || value === (selected[field] || '')) return;
    patch(selected.id, { [field]: value });
  };

  const commitContacts = (next) => {
    setContactsDraft(next);
    if (selected) patch(selected.id, { contacts: next });
  };

  const addProject = async () => {
    const { project } = await api.createProject({ name: t('projects.untitled') });
    setProjects((prev) => [project, ...prev]);
    setSelectedId(project.id);
  };

  const removeProject = async (id) => {
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    await api.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

  const fieldStyle = { width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, background: theme.cardBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' };
  const areaStyle = { ...fieldStyle, background: theme.subtleBg, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' };

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
      <div style={{ flex: '1 1 300px', minWidth: 260, maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{t('projects.title')}</div>
          <button onClick={addProject} title={t('projects.newProject')} style={{ display: 'flex', alignItems: 'center', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 12px', cursor: 'pointer' }}>
            <Icon name="plus" size={16} color="#fff" />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px' }}>
          <Icon name="search" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('projects.searchPlaceholder')}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
          />
        </div>
        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {filtered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('projects.noneYet')}</div>}
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: selectedId === p.id ? theme.accentSoftBg : 'transparent' }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: `oklch(0.6 0.19 ${p.color || STATUS_HUES[p.status] || 250})`, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.company || t('projects.noCompany')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: '1 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {selected ? (
          <div style={{ flex: 1, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => commitField('name', nameDraft)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 19, fontWeight: 800, color: theme.textPrimary }}
              />
              <span onClick={() => patch(selected.id, { favorite: !selected.favorite })} style={{ display: 'flex', cursor: 'pointer', flexShrink: 0 }}>
                <Icon name="pin" size={17} color={selected.favorite ? theme.accentText : theme.textMuted} />
              </span>
              <button onClick={() => removeProject(selected.id)} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '7px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                {t('common.delete')}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: theme.subtleBg, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <FieldLabel theme={theme}>{t('projects.company')}</FieldLabel>
                  <input value={companyDraft} onChange={(e) => setCompanyDraft(e.target.value)} onBlur={() => commitField('company', companyDraft)} style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel theme={theme}>{t('projects.manager')}</FieldLabel>
                  <input value={managerDraft} onChange={(e) => setManagerDraft(e.target.value)} onBlur={() => commitField('manager', managerDraft)} style={fieldStyle} />
                </div>
              </div>

              <div>
                <FieldLabel theme={theme}>{t('projects.status')}</FieldLabel>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {STATUSES.map((s) => (
                    <StatusPill key={s} label={s} hue={STATUS_HUES[s]} active={selected.status === s} onClick={() => patch(selected.id, { status: s })} theme={theme} />
                  ))}
                </div>
              </div>

              <div>
                <FieldLabel theme={theme}>{t('projects.color')}</FieldLabel>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLOR_PRESETS.map((hue) => (
                    <span
                      key={hue}
                      onClick={() => patch(selected.id, { color: String(hue) })}
                      style={{
                        width: 22, height: 22, borderRadius: '50%', background: `oklch(0.6 0.19 ${hue})`, cursor: 'pointer',
                        border: String(selected.color) === String(hue) ? `2px solid ${theme.textPrimary}` : '2px solid transparent',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <FieldLabel theme={theme}>{t('projects.startDate')}</FieldLabel>
                  <input type="date" value={selected.startDate || ''} onChange={(e) => patch(selected.id, { startDate: e.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel theme={theme}>{t('projects.endDate')}</FieldLabel>
                  <input type="date" value={selected.endDate || ''} onChange={(e) => patch(selected.id, { endDate: e.target.value })} style={fieldStyle} />
                </div>
              </div>
            </div>

            <div>
              <FieldLabel theme={theme}>{t('projects.scope')}</FieldLabel>
              <textarea value={scopeDraft} onChange={(e) => setScopeDraft(e.target.value)} onBlur={() => commitField('scope', scopeDraft)} rows={2} style={areaStyle} />
            </div>
            <div>
              <FieldLabel theme={theme}>{t('projects.description')}</FieldLabel>
              <textarea value={descDraft} onChange={(e) => setDescDraft(e.target.value)} onBlur={() => commitField('description', descDraft)} rows={3} style={areaStyle} />
            </div>
            <div>
              <FieldLabel theme={theme}>{t('projects.notes')}</FieldLabel>
              <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} onBlur={() => commitField('notes', notesDraft)} rows={3} style={areaStyle} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <FieldLabel theme={theme}>{t('projects.contacts')}</FieldLabel>
                <span
                  onClick={() => commitContacts([...contactsDraft, emptyContact()])}
                  style={{ fontSize: 11, fontWeight: 700, color: theme.accentText, cursor: 'pointer' }}
                >
                  + {t('projects.addContact')}
                </span>
              </div>
              {contactsDraft.length === 0 && <div style={{ fontSize: 12, color: theme.textMuted }}>{t('projects.noContacts')}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {contactsDraft.map((c, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 6, alignItems: 'center', background: theme.subtleBg, borderRadius: 8, padding: 8 }}>
                    <input
                      value={c.name || ''}
                      placeholder={t('projects.contactName')}
                      onChange={(e) => setContactsDraft((prev) => prev.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                      onBlur={() => commitContacts(contactsDraft)}
                      style={fieldStyle}
                    />
                    <input
                      value={c.role || ''}
                      placeholder={t('projects.contactRole')}
                      onChange={(e) => setContactsDraft((prev) => prev.map((x, xi) => (xi === i ? { ...x, role: e.target.value } : x)))}
                      onBlur={() => commitContacts(contactsDraft)}
                      style={fieldStyle}
                    />
                    <input
                      value={c.email || ''}
                      placeholder={t('projects.contactEmail')}
                      onChange={(e) => setContactsDraft((prev) => prev.map((x, xi) => (xi === i ? { ...x, email: e.target.value } : x)))}
                      onBlur={() => commitContacts(contactsDraft)}
                      style={fieldStyle}
                    />
                    <input
                      value={c.phone || ''}
                      placeholder={t('projects.contactPhone')}
                      onChange={(e) => setContactsDraft((prev) => prev.map((x, xi) => (xi === i ? { ...x, phone: e.target.value } : x)))}
                      onBlur={() => commitContacts(contactsDraft)}
                      style={fieldStyle}
                    />
                    <span onClick={() => commitContacts(contactsDraft.filter((_, xi) => xi !== i))} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '0 4px' }}>
                      &times;
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
            {t('projects.selectPrompt')}
          </div>
        )}
      </div>
    </div>
  );
}
