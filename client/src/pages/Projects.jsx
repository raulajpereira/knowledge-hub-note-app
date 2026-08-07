import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import IconPicker from '../components/IconPicker.jsx';
import { useIsMobile } from '../lib/useIsMobile.js';
import PanelDivider from '../components/PanelDivider.jsx';
import { useResizablePanel } from '../lib/useResizablePanel.js';

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
  const isMobile = useIsMobile();
  const listPanel = useResizablePanel('projects.list', 300, { min: 260, max: 520 });
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
  const mobileShowDetail = isMobile && !!selectedId;

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

  const onCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected) return;
    const { url } = await api.uploadProjectCover(file);
    await patch(selected.id, { coverUrl: url });
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
    <div style={{ padding: isMobile ? 14 : '24px 28px', flex: 1, display: 'flex', gap: isMobile ? 0 : 12, minHeight: 0 }}>
      {(!isMobile || !mobileShowDetail) && (
      <div style={{ flex: isMobile ? '1 1 auto' : `0 0 ${listPanel.width}px`, minWidth: isMobile ? 0 : 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.icon ? `${p.icon} ` : ''}{p.name}</div>
                <div style={{ fontSize: 11.5, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.company || t('projects.noCompany')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {!isMobile && <PanelDivider theme={theme} onResize={listPanel.onResize} onResizeEnd={listPanel.onResizeEnd} />}

      {(!isMobile || mobileShowDetail) && (
      <div style={{ flex: isMobile ? '1 1 auto' : '1 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {selected ? (
          <div style={{ flex: 1, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: isMobile ? 16 : 24, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
            {selected.coverUrl ? (
              <div style={{ position: 'relative', margin: isMobile ? '-16px -16px 0' : '-24px -24px 0', borderRadius: '14px 14px 0 0', overflow: 'hidden', height: 180, flexShrink: 0 }}>
                <img src={selected.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 7, padding: '6px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                    {t('common.changeCover')}
                    <input type="file" accept="image/*" onChange={onCoverUpload} style={{ display: 'none' }} />
                  </label>
                  <span
                    onClick={() => patch(selected.id, { coverUrl: null })}
                    style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 7, padding: '6px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {t('common.removeCover')}
                  </span>
                </div>
              </div>
            ) : (
              <label style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: theme.textMuted, cursor: 'pointer' }}>
                <Icon name="plus" size={12} /> {t('common.addCover')}
                <input type="file" accept="image/*" onChange={onCoverUpload} style={{ display: 'none' }} />
              </label>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isMobile && (
                <span onClick={() => setSelectedId(null)} style={{ display: 'flex', cursor: 'pointer', color: theme.textMuted, transform: 'rotate(180deg)', flexShrink: 0 }}>
                  <Icon name="chevron" size={18} />
                </span>
              )}
              <IconPicker
                theme={theme} t={t} value={selected.icon} onChange={(icon) => patch(selected.id, { icon })}
                size={32} fallback={<Icon name="users" size={16} color={theme.accentText} />}
                triggerStyle={{ background: theme.accentSoftBg }}
              />
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => commitField('name', nameDraft)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 19, fontWeight: 800, color: theme.textPrimary }}
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
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr auto', gap: 6, alignItems: 'center', background: theme.subtleBg, borderRadius: 8, padding: 8 }}>
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
      )}
    </div>
  );
}
