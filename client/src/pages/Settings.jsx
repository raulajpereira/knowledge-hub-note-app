import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAgents } from '../context/AgentsContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { FONT_OPTIONS } from '../styles/theme.js';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import ColorWheel from '../components/ColorWheel.jsx';
import SidebarSettingsModal from '../components/SidebarSettingsModal.jsx';
import logoDefault from '../assets/logo-default.png';
import { backdropClose } from '../lib/backdropClose.js';
import { useIsMobile } from '../lib/useIsMobile.js';

function TeamCard({ theme, t, card, outlineButton }) {
  const confirm = useConfirm();
  const [team, setTeam] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);

  const load = () => api.getTeam().then(setTeam);

  useEffect(() => {
    load();
  }, []);

  const invite = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || !password) return;
    setInviting(true);
    try {
      await api.inviteTeamMember({ name: name.trim(), email: email.trim(), password });
      setName('');
      setEmail('');
      setPassword('');
      setInviteOpen(false);
      await load();
    } catch (err) {
      setError(err.message || t('settings.couldNotInvite'));
    } finally {
      setInviting(false);
    }
  };

  const remove = async (id) => {
    const ok = await confirm({ message: t('common.confirmRemoveMemberMessage') });
    if (!ok) return;
    await api.removeTeamMember(id);
    await load();
  };

  if (!team) return null;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.team')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>
            {team.isOwner ? t('settings.teamOwnerDesc') : t('settings.teamMemberDesc', { name: team.owner.name })}
          </div>
        </div>
        {team.isOwner && (
          <button onClick={() => setInviteOpen((v) => !v)} style={outlineButton}>
            {inviteOpen ? t('common.cancel') : t('settings.inviteMember')}
          </button>
        )}
      </div>

      {inviteOpen && (
        <form onSubmit={invite} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.namePlaceholder')} style={{ flex: '1 1 140px', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={t('settings.emailPlaceholder')} style={{ flex: '1 1 160px', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={t('settings.tempPasswordPlaceholder')} style={{ flex: '1 1 160px', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }} />
          <button type="submit" disabled={inviting} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: inviting ? 0.6 : 1 }}>
            {inviting ? t('settings.inviting') : t('settings.invite')}
          </button>
          {error && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)', width: '100%' }}>{error}</div>}
        </form>
      )}

      {team.members.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noMembersYet')}</div>}
      {team.members.map((m) => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{m.name}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{m.email}</div>
          </div>
          {team.isOwner && (
            <span onClick={() => remove(m.id)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '2px 6px' }}>
              &times;
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function AdminCard({ theme, t, card, outlineButton }) {
  const confirm = useConfirm();
  const [codes, setCodes] = useState(null);
  const [users, setUsers] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [busyUserId, setBusyUserId] = useState(null);
  const [templateAccessUser, setTemplateAccessUser] = useState(null);

  const load = () => {
    api.listInviteCodes().then((r) => setCodes(r.codes));
    api.listAdminUsers().then((r) => setUsers(r.users));
  };

  useEffect(() => {
    load();
  }, []);

  const generateCode = async () => {
    setGenerating(true);
    try {
      await api.createInviteCode();
      const { codes: fresh } = await api.listInviteCodes();
      setCodes(fresh);
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = async (c) => {
    try {
      await navigator.clipboard.writeText(c.code);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId((v) => (v === c.id ? null : v)), 1500);
    } catch {
      /* clipboard unavailable — user can still select and copy the text manually */
    }
  };

  const revokeCode = async (c) => {
    const ok = await confirm({ message: t('settings.confirmRevokeCode', { code: c.code }) });
    if (!ok) return;
    await api.revokeInviteCode(c.id);
    const { codes: fresh } = await api.listInviteCodes();
    setCodes(fresh);
  };

  const toggleSuspend = async (u) => {
    setBusyUserId(u.id);
    try {
      await api.updateAdminUser(u.id, { status: u.status === 'suspended' ? 'active' : 'suspended' });
      const { users: fresh } = await api.listAdminUsers();
      setUsers(fresh);
    } finally {
      setBusyUserId(null);
    }
  };

  const toggleRole = async (u) => {
    setBusyUserId(u.id);
    try {
      await api.updateAdminUser(u.id, { role: u.role === 'admin' ? 'member' : 'admin' });
      const { users: fresh } = await api.listAdminUsers();
      setUsers(fresh);
    } finally {
      setBusyUserId(null);
    }
  };

  const deleteAccount = async (u) => {
    const ok = await confirm({ message: t('settings.confirmDeleteAccount', { name: u.name }), tone: 'danger', confirmLabel: t('common.delete') });
    if (!ok) return;
    setBusyUserId(u.id);
    try {
      await api.deleteAdminUser(u.id);
      const { users: fresh } = await api.listAdminUsers();
      setUsers(fresh);
    } finally {
      setBusyUserId(null);
    }
  };

  if (!codes || !users) return null;

  const activeCodes = codes.filter((c) => !c.usedAt && !c.revokedAt);
  const suspendedCount = users.filter((u) => u.status === 'suspended').length;
  const gold = 'oklch(0.78 0.14 85)';
  const goldButton = { ...outlineButton, border: `1px solid ${gold}`, color: gold, fontWeight: 700 };

  return (
    <>
    <div
      style={{
        ...card,
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid oklch(0.78 0.14 85 / 0.4)`,
        background: theme.dark
          ? `linear-gradient(160deg, oklch(0.78 0.14 85 / 0.1), ${theme.cardBg} 40%)`
          : `linear-gradient(160deg, oklch(0.78 0.14 85 / 0.14), ${theme.cardBg} 40%)`,
        boxShadow: `0 0 0 1px oklch(0.78 0.14 85 / 0.06), 0 12px 32px oklch(0.78 0.14 85 / 0.08)`,
      }}
    >
      <div style={{ position: 'absolute', top: -60, right: -60, width: 180, height: 180, borderRadius: '50%', background: 'oklch(0.78 0.14 85 / 0.12)', pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
        <div
          style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'oklch(0.78 0.14 85 / 0.18)', border: `1px solid oklch(0.78 0.14 85 / 0.4)`,
          }}
        >
          <Icon name="shield" size={20} color={gold} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            {t('settings.admin')}
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: gold, background: 'oklch(0.78 0.14 85 / 0.15)', border: `1px solid oklch(0.78 0.14 85 / 0.35)`, borderRadius: 5, padding: '2px 7px' }}>
              {t('settings.adminBadge')}
            </span>
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.adminDesc')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: 'center', background: theme.subtleBg, borderRadius: 9, padding: '6px 12px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: gold }}>{activeCodes.length}</div>
            <div style={{ fontSize: 9.5, color: theme.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>{t('settings.statPendingCodes')}</div>
          </div>
          <div style={{ textAlign: 'center', background: theme.subtleBg, borderRadius: 9, padding: '6px 12px' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{users.length}</div>
            <div style={{ fontSize: 9.5, color: theme.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>{t('settings.statAccounts')}</div>
          </div>
          {suspendedCount > 0 && (
            <div style={{ textAlign: 'center', background: 'oklch(0.6 0.16 50 / 0.15)', borderRadius: 9, padding: '6px 12px' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'oklch(0.6 0.16 50)' }}>{suspendedCount}</div>
              <div style={{ fontSize: 9.5, color: 'oklch(0.6 0.16 50)', fontWeight: 700, textTransform: 'uppercase' }}>{t('settings.statPaused')}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={13} color={theme.textMuted} /> {t('settings.inviteCodes')}
          </div>
          <button onClick={generateCode} disabled={generating} style={{ ...goldButton, opacity: generating ? 0.6 : 1 }}>
            {generating ? t('settings.generating') : t('settings.generateCode')}
          </button>
        </div>
        {codes.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noCodesYet')}</div>}
        {codes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {codes.map((c) => {
              const status = c.usedAt ? 'used' : c.revokedAt ? 'revoked' : 'pending';
              const statusLabel = { pending: t('settings.codePending'), used: t('settings.codeUsed', { name: c.usedBy?.name || '' }), revoked: t('settings.codeRevoked') }[status];
              const statusColor = { pending: theme.accentText, used: theme.textMuted, revoked: 'oklch(0.55 0.18 25)' }[status];
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: theme.subtleBg }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, letterSpacing: '0.03em' }}>{c.code}</span>
                  {status === 'pending' && (
                    <span onClick={() => copyCode(c)} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: theme.accentText }}>
                      {copiedId === c.id ? t('settings.copied') : t('common.copy')}
                    </span>
                  )}
                  <span style={{ flex: 1, fontSize: 11.5, color: statusColor, fontWeight: 600, textAlign: 'right' }}>{statusLabel}</span>
                  {status === 'pending' && (
                    <span onClick={() => revokeCode(c)} title={t('settings.revokeCode')} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '0 2px' }}>
                      &times;
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {activeCodes.length > 0 && (
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 6 }}>{t('settings.codesHint')}</div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="users" size={13} color={theme.textMuted} /> {t('settings.manageAccounts')}
        </div>
        {users.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noAccountsYet')}</div>}
        {users.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {users.map((u) => {
              const busy = busyUserId === u.id;
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, background: theme.subtleBg, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {u.name}
                      {u.status === 'suspended' && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'oklch(0.6 0.16 50)', background: 'oklch(0.6 0.16 50 / 0.15)', padding: '1px 6px', borderRadius: 5 }}>
                          {t('settings.statusSuspended')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: theme.textMuted }}>{u.email}</div>
                  </div>
                  <button
                    onClick={() => toggleRole(u)}
                    disabled={busy}
                    style={{ ...outlineButton, padding: '5px 10px', fontSize: 11.5, opacity: busy ? 0.5 : 1 }}
                  >
                    {u.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleMember')}
                  </button>
                  <button
                    onClick={() => toggleSuspend(u)}
                    disabled={busy}
                    style={{ ...outlineButton, padding: '5px 10px', fontSize: 11.5, opacity: busy ? 0.5 : 1 }}
                  >
                    {u.status === 'suspended' ? t('settings.reactivate') : t('settings.pause')}
                  </button>
                  <button
                    onClick={() => setTemplateAccessUser(u)}
                    disabled={busy}
                    style={{ ...outlineButton, padding: '5px 10px', fontSize: 11.5, opacity: busy ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <Icon name="doc" size={12} /> {t('settings.manageDocTemplates')}
                  </button>
                  <span
                    onClick={() => (busy ? null : deleteAccount(u))}
                    title={t('common.delete')}
                    style={{ cursor: busy ? 'default' : 'pointer', color: 'oklch(0.55 0.18 25)', fontSize: 16, padding: '0 4px', opacity: busy ? 0.5 : 1 }}
                  >
                    &times;
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    {templateAccessUser && (
      <TemplateAccessModal theme={theme} t={t} user={templateAccessUser} onClose={() => setTemplateAccessUser(null)} />
    )}
    </>
  );
}

function TemplateAccessModal({ theme, t, user, onClose }) {
  const [templates, setTemplates] = useState(null);
  const [allowed, setAllowed] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getDocTemplateAccess(user.id).then((r) => {
      setTemplates(r.templates);
      setAllowed(new Set(r.templates.filter((tpl) => tpl.allowed).map((tpl) => tpl.id)));
    });
  }, [user.id]);

  const toggle = (id) => {
    setAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.setDocTemplateAccess(user.id, [...allowed]);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.cardBg, borderRadius: 14, padding: 22, width: 420, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 14, border: `1px solid ${theme.border}` }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{t('settings.manageDocTemplates')}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted }}>{user.name}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flex: 1, minHeight: 40 }}>
          {templates == null && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('common.loading')}</div>}
          {templates?.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noDocTemplatesYet')}</div>}
          {templates?.map((tpl) => (
            <label key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: theme.subtleBg, cursor: 'pointer' }}>
              <input type="checkbox" checked={allowed.has(tpl.id)} onChange={() => toggle(tpl.id)} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{tpl.name}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: theme.textPrimary }}>
            {t('common.cancel')}
          </button>
          <button onClick={save} disabled={saving || templates == null} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateManagementCard({ theme, t, card }) {
  const [templates, setTemplates] = useState(null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [editTemplateName, setEditTemplateName] = useState('');

  useEffect(() => {
    api.listDocTemplatesAdmin().then((r) => setTemplates(r.templates));
  }, []);

  const startEditTemplate = (tpl) => {
    setEditingTemplateId(tpl.id);
    setEditTemplateName(tpl.name);
  };

  const commitTemplateRename = async () => {
    const id = editingTemplateId;
    setEditingTemplateId(null);
    if (!id || !editTemplateName.trim()) return;
    const { template } = await api.updateDocTemplate(id, { name: editTemplateName.trim() });
    setTemplates((prev) => prev.map((tpl) => (tpl.id === id ? template : tpl)));
  };

  if (!templates) return null;

  return (
    <div style={card}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.templateManagement')}</div>
        <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.templateManagementDesc')}</div>
      </div>
      {templates.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noDocTemplatesYet')}</div>}
      {templates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {templates.map((tpl) => (
            <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, background: theme.subtleBg }}>
              {editingTemplateId === tpl.id ? (
                <input
                  value={editTemplateName}
                  onChange={(e) => setEditTemplateName(e.target.value)}
                  onBlur={commitTemplateRename}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  autoFocus
                  style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, border: `1px solid ${theme.accent}`, borderRadius: 6, padding: '3px 7px', background: theme.cardBg, color: theme.textPrimary, outline: 'none' }}
                />
              ) : (
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.name}</span>
              )}
              <span onClick={() => startEditTemplate(tpl)} title={t('common.edit')} style={{ display: 'flex', opacity: 0.6, cursor: 'pointer', flexShrink: 0 }}>
                <Icon name="edit" size={13} color={theme.textMuted} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AUDIT_ACTION_HUES = { create: 145, update: 230, delete: 25, login: 145, login_failed: 25, register: 280 };

function AuditActionBadge({ action, theme }) {
  const hue = AUDIT_ACTION_HUES[action] ?? 280;
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap', background: `oklch(0.90 0.10 ${hue})`, color: `oklch(0.35 0.15 ${hue})` }}>
      {action}
    </span>
  );
}

// Super-admin-only global activity trail — deliberately not shown to plain
// admins, unlike the rest of this settings group.
function AuditLogCard({ theme, t, card }) {
  const confirm = useConfirm();
  const [entries, setEntries] = useState(null);
  const [entityTypes, setEntityTypes] = useState([]);
  const [entityType, setEntityType] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [purgeDays, setPurgeDays] = useState(90);
  const [purging, setPurging] = useState(false);

  const load = (params, append) => {
    api.listAuditLog(params).then((r) => {
      setEntries((prev) => (append ? [...(prev || []), ...r.entries] : r.entries));
      setEntityTypes(r.entityTypes);
      setNextCursor(r.nextCursor);
    });
  };

  useEffect(() => {
    load(entityType ? { entityType } : undefined, false);
  }, [entityType]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const r = await api.listAuditLog({ ...(entityType ? { entityType } : {}), cursor: nextCursor });
      setEntries((prev) => [...(prev || []), ...r.entries]);
      setNextCursor(r.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const purge = async () => {
    const days = Number(purgeDays);
    if (!Number.isFinite(days) || days < 0) return;
    const ok = await confirm({ message: t('settings.auditLogPurgeConfirm', { days }), confirmLabel: t('settings.auditLogPurge') });
    if (!ok) return;
    setPurging(true);
    try {
      await api.purgeAuditLog(days);
      load(entityType ? { entityType } : undefined, false);
    } finally {
      setPurging(false);
    }
  };

  if (!entries) return null;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.auditLog')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.auditLogDesc')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            style={{
              border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 9px', fontSize: 12, background: theme.subtleBg,
              color: theme.textPrimary, outline: 'none', colorScheme: theme.dark ? 'dark' : 'light',
            }}
          >
            <option value="" style={{ color: '#1a1a1a', background: '#fff' }}>{t('settings.auditLogAllTypes')}</option>
            {entityTypes.map((e) => <option key={e} value={e} style={{ color: '#1a1a1a', background: '#fff' }}>{e}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: theme.textMuted }}>{t('settings.auditLogPurgeOlderThan')}</span>
            <input
              type="number"
              min={0}
              value={purgeDays}
              onChange={(e) => setPurgeDays(e.target.value)}
              style={{ width: 56, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 7px', fontSize: 12, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            />
            <span style={{ fontSize: 11.5, color: theme.textMuted }}>{t('settings.auditLogPurgeDays')}</span>
          </div>
          <button
            onClick={purge}
            disabled={purging}
            style={{ background: 'transparent', border: `1px solid oklch(0.55 0.18 25)`, color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: purging ? 0.6 : 1 }}
          >
            {purging ? t('common.saving') : t('settings.auditLogPurge')}
          </button>
        </div>
      </div>

      {entries.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.auditLogEmpty')}</div>}

      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflowY: 'auto' }}>
          {entries.map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: theme.subtleBg, fontSize: 12 }}>
              <AuditActionBadge action={e.action} theme={theme} />
              <span style={{ fontWeight: 700, flexShrink: 0 }}>{e.entityType}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.textMuted }}>
                {e.actorEmail || t('settings.auditLogUnknownActor')}{e.summary ? ` — ${e.summary}` : ''}
              </span>
              <span style={{ flexShrink: 0, color: theme.textMuted, fontSize: 10.5 }}>{new Date(e.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {nextCursor && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          style={{ alignSelf: 'center', background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: loadingMore ? 0.6 : 1 }}
        >
          {t('settings.auditLogLoadMore')}
        </button>
      )}
    </div>
  );
}

function formatMb(mb) {
  if (mb == null) return null;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

function UsageBar({ theme, label, usedMb, totalMb, usedPct, raw }) {
  const known = usedPct != null;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: theme.textMuted }}>
          {known ? `${formatMb(usedMb)} / ${formatMb(totalMb)} (${usedPct}%)` : raw ? `${raw.value} ${raw.unit || ''}` : '—'}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 5, background: theme.subtleBg, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%', borderRadius: 5, transition: 'width 0.3s',
            width: known ? `${Math.max(2, usedPct)}%` : '0%',
            background: known && usedPct > 85 ? 'oklch(0.6 0.18 30)' : theme.accent,
          }}
        />
      </div>
    </div>
  );
}

function VpsCard({ theme, t, card, user, refreshMe }) {
  const confirm = useConfirm();
  const connected = !!user?.hostingerConnected;
  const [tokenInput, setTokenInput] = useState('');
  const [tokenReveal, setTokenReveal] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const loadStatus = async () => {
    setLoadingStatus(true);
    setStatusError(false);
    try {
      const data = await api.getVpsStatus();
      setStatus(data);
    } catch {
      setStatusError(true);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (connected) loadStatus();
  }, [connected]);

  const connect = async () => {
    if (!tokenInput.trim()) return;
    setConnecting(true);
    setError('');
    try {
      await api.setHostingerToken(tokenInput.trim());
      setTokenInput('');
      await refreshMe();
    } catch (err) {
      setError(err.message || t('settings.vpsLoadError'));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({ message: t('settings.vpsDisconnectConfirm') });
    if (!ok) return;
    await api.clearHostingerToken();
    setStatus(null);
    await refreshMe();
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.vps')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.vpsDesc')}</div>
        </div>
        {connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'oklch(0.55 0.15 145)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.55 0.15 145)' }} />
            {t('settings.vpsConnected')}
          </div>
        )}
      </div>

      {!connected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ position: 'relative', display: 'flex' }}>
            <input
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && connect()}
              type={tokenReveal ? 'text' : 'password'}
              placeholder={t('settings.vpsTokenPlaceholder')}
              style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 90px 9px 11px', fontSize: 12.5, fontFamily: 'var(--font-mono)', background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            />
            <span onClick={() => setTokenReveal((v) => !v)} style={{ position: 'absolute', right: 74, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.5, display: 'flex' }}>
              <Icon name={tokenReveal ? 'eyeOff' : 'eye'} size={15} />
            </span>
            <button
              onClick={connect}
              disabled={connecting || !tokenInput.trim()}
              style={{ position: 'absolute', right: 4, top: 4, bottom: 4, background: theme.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '0 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', opacity: connecting || !tokenInput.trim() ? 0.6 : 1 }}
            >
              {connecting ? t('settings.vpsConnecting') : t('settings.vpsConnect')}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: theme.textMuted }}>{t('settings.vpsTokenHint')}</div>
          {error && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)' }}>{error}</div>}
        </div>
      )}

      {connected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loadingStatus && !status && <div style={{ fontSize: 13, color: theme.textMuted }}>{t('common.loading')}</div>}
          {statusError && <div style={{ fontSize: 12.5, color: 'oklch(0.55 0.18 25)' }}>{t('settings.vpsLoadError')}</div>}

          {status && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {status.hostname && (
                  <div style={{ background: theme.subtleBg, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600 }}>
                    {status.hostname}
                  </div>
                )}
                {status.plan && (
                  <div style={{ background: theme.subtleBg, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600 }}>
                    {status.plan}
                  </div>
                )}
                {status.state && (
                  <div style={{ background: theme.accentSoftBg, color: theme.accentText, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>
                    {status.state}
                  </div>
                )}
              </div>

              <UsageBar theme={theme} label={t('settings.vpsDisk')} usedMb={status.disk.usedMb} totalMb={status.disk.totalMb} usedPct={status.disk.usedPct} raw={status.disk.raw} />
              <UsageBar theme={theme} label={t('settings.vpsMemory')} usedMb={status.memory.usedMb} totalMb={status.memory.totalMb} usedPct={status.memory.usedPct} raw={status.memory.raw} />

              <div style={{ display: 'flex', gap: 20, fontSize: 12.5, color: theme.textMuted, flexWrap: 'wrap' }}>
                {status.cpu?.cores != null && <span>{t('settings.vpsCpuCores')}: {status.cpu.cores}</span>}
                {status.uptime && <span>{t('settings.vpsUptime')}: {Math.floor(status.uptime.value / 86400)}d</span>}
              </div>

              {status.metricsError && (
                <div style={{ fontSize: 11.5, color: 'oklch(0.6 0.15 40)', background: theme.subtleBg, borderRadius: 8, padding: '8px 10px' }}>
                  {t('settings.vpsMetricsError', { status: status.metricsError.status ?? '?' })}: {status.metricsError.body}
                </div>
              )}
              {status.metricsEmpty && (
                <div style={{ fontSize: 11.5, color: theme.textMuted }}>{t('settings.vpsNoData')}</div>
              )}
              {status.metricsRaw && (
                <textarea
                  readOnly
                  value={status.metricsRaw}
                  onClick={(e) => e.target.select()}
                  style={{ width: '100%', boxSizing: 'border-box', height: 90, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 10.5, background: theme.subtleBg, color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8 }}
                />
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={loadStatus} disabled={loadingStatus} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              {t('settings.vpsRefresh')}
            </button>
            <button onClick={disconnect} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              {t('settings.vpsDisconnect')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function detectedProviderLabel(agent) {
  if (agent.provider === 'anthropic') return 'Anthropic';
  const host = (() => {
    try {
      return agent.baseUrl ? new URL(agent.baseUrl).hostname : '';
    } catch {
      return '';
    }
  })();
  if (host.includes('groq.com')) return 'Groq';
  if (host.includes('openrouter.ai')) return 'OpenRouter';
  if (host.includes('perplexity.ai')) return 'Perplexity';
  return 'OpenAI';
}

function AgentRow({ agent, theme, t }) {
  const { updateAgent, deleteAgent } = useAgents();
  const confirm = useConfirm();
  const [tokenInput, setTokenInput] = useState('');
  const [tokenReveal, setTokenReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const saveToken = async () => {
    if (!tokenInput.trim()) return;
    await updateAgent(agent.id, { token: tokenInput.trim() });
    setTokenInput('');
    setTestResult(null);
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await api.testAgent(agent.id);
      setTestResult({ ok: true, message: t('settings.connected') });
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          value={agent.name}
          onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
          placeholder={t('settings.agentNamePlaceholder')}
          style={{ flex: 1, border: 'none', borderBottom: '1px solid transparent', padding: '2px 0', fontSize: 14.5, fontWeight: 700, background: 'transparent', color: theme.textPrimary, outline: 'none' }}
        />
        <span
          onClick={async () => {
            const ok = await confirm({ message: t('common.confirmDeleteAgentMessage') });
            if (ok) deleteAgent(agent.id);
          }}
          style={{ cursor: 'pointer', opacity: 0.45, fontSize: 16, padding: '2px 6px', flexShrink: 0 }}
        >
          &times;
        </span>
      </div>

      {agent.hasToken && (
        <div style={{ fontSize: 11.5, color: theme.textMuted }}>
          {t('settings.detectedProvider', { provider: detectedProviderLabel(agent) })}
        </div>
      )}

      <div style={{ position: 'relative', display: 'flex' }}>
        <input
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          type={tokenReveal ? 'text' : 'password'}
          placeholder={agent.hasToken ? t('settings.tokenSavedPlaceholder') : t('settings.tokenPlaceholder')}
          style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 90px 9px 11px', fontSize: 12.5, fontFamily: 'var(--font-mono)', background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
        />
        <span onClick={() => setTokenReveal((v) => !v)} style={{ position: 'absolute', right: 60, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.5, display: 'flex' }}>
          <Icon name={tokenReveal ? 'eyeOff' : 'eye'} size={15} />
        </span>
        <button onClick={saveToken} style={{ position: 'absolute', right: 4, top: 4, bottom: 4, background: theme.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '0 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {t('common.save')}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', paddingTop: 2, borderTop: `1px solid ${theme.border}` }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: theme.textMuted, cursor: 'pointer', paddingTop: 10 }}>
          <div
            onClick={() => updateAgent(agent.id, { active: !agent.active })}
            style={{ width: 34, height: 20, borderRadius: 10, background: agent.active ? theme.accent : theme.subtleBg, position: 'relative', transition: 'background 0.15s' }}
          >
            <div style={{ position: 'absolute', top: 2, left: agent.active ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
          </div>
          {t('settings.active')}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10 }}>
          {testResult && (
            <div style={{ fontSize: 12, fontWeight: 600, color: testResult.ok ? 'oklch(0.55 0.15 145)' : 'oklch(0.55 0.18 25)' }}>
              {testResult.message}
            </div>
          )}
          <button onClick={runTest} disabled={testing || !agent.hasToken} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: agent.hasToken ? 'pointer' : 'default', opacity: agent.hasToken ? 1 : 0.5 }}>
            {testing ? t('settings.testing') : t('settings.test')}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabBar({ theme, tabs, active, onChange, isMobile }) {
  return (
    <div
      style={{
        display: 'flex', gap: isMobile ? 18 : 28, borderBottom: `1px solid ${theme.border}`,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <div
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              padding: '11px 2px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              color: isActive ? theme.textPrimary : theme.textMuted,
              borderBottom: `2px solid ${isActive ? theme.accent : 'transparent'}`,
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {tab.label}
          </div>
        );
      })}
    </div>
  );
}

const AUTO_LOCK_OPTIONS = [30, 60, 120, 300, 600];

export default function Settings() {
  const { theme, mode, accentHue, fontFamily, fontScale, radiusStyle, density, setMode, setAccentHue, setFontFamily, setFontScale, setRadiusStyle, setDensity } = useTheme();
  const { user, updateUserSettings, refreshMe } = useAuth();
  const { agents, createAgent } = useAgents();
  const { t, lang, setLanguage } = useLanguage();
  const isMobile = useIsMobile();
  const fileInputRef = useRef(null);
  const faviconInputRef = useRef(null);
  const [newAgentOpen, setNewAgentOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentToken, setNewAgentToken] = useState('');
  const [sidebarSettingsOpen, setSidebarSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('appearance');

  const openNewAgent = () => {
    setNewAgentName('');
    setNewAgentToken('');
    setNewAgentOpen(true);
  };

  const submitNewAgent = async () => {
    if (!newAgentName.trim() || !newAgentToken.trim()) return;
    await createAgent({ name: newAgentName.trim(), token: newAgentToken.trim() });
    setNewAgentOpen(false);
  };

  const onLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { settings } = await api.uploadLogo(file);
    updateUserSettings(settings);
  };

  const onResetLogo = async () => {
    const { settings } = await api.resetLogo();
    updateUserSettings(settings);
  };

  const onFaviconUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { settings } = await api.uploadFavicon(file);
    updateUserSettings(settings);
  };

  const onResetFavicon = async () => {
    const { settings } = await api.resetFavicon();
    updateUserSettings(settings);
  };

  const onAutoLockChange = async (seconds) => {
    const { settings } = await api.updateSettings({ vaultAutoLockSeconds: seconds });
    updateUserSettings(settings);
  };

  const onTrashRetentionChange = async (days) => {
    const { settings } = await api.updateSettings({ trashRetentionDays: days });
    updateUserSettings(settings);
  };

  const card = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 };
  const nestedCard = { background: theme.subtleBg, border: 'none', borderRadius: 11, padding: 18, display: 'flex', flexDirection: 'column', gap: 18 };
  const outlineButton = { background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuperAdmin = user?.role === 'super_admin';

  const TABS = [
    { id: 'appearance', label: t('settings.groupAppearance') },
    { id: 'account', label: t('settings.groupAccount') },
    { id: 'integrations', label: t('settings.groupIntegrations') },
    { id: 'team', label: isAdmin ? t('settings.groupTeamAdmin') : t('settings.groupTeam') },
  ];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', width: '100%', padding: isMobile ? 14 : 28, display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 20 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{t('settings.title')}</div>

      <TabBar theme={theme} tabs={TABS} active={activeTab} onChange={setActiveTab} isMobile={isMobile} />

      {activeTab === 'appearance' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={nestedCard}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.appearance')}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.theme')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.themeDesc')}</div>
          </div>
          <div style={{ display: 'flex', background: theme.subtleBg, borderRadius: 9, padding: 3, gap: 3 }}>
            {['dark', 'light'].map((m) => (
              <div
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                  background: mode === m ? theme.cardBg : 'transparent', color: mode === m ? theme.textPrimary : theme.textMuted,
                }}
              >
                {t(`settings.${m}`)}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.accentColor')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.accentColorDesc')}</div>
          </div>
          <ColorWheel hue={theme.hue} onChange={setAccentHue} title={t('settings.colorWheelHint')} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.font')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.fontDesc')}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FONT_OPTIONS.map((f) => {
              const active = (fontFamily || 'inter') === f.id;
              return (
                <div
                  key={f.id}
                  onClick={() => setFontFamily(f.id)}
                  style={{
                    padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                    background: active ? theme.accentSoftBg : theme.subtleBg,
                    color: active ? theme.accentText : theme.textMuted,
                    fontFamily: f.display,
                  }}
                >
                  {t(`settings.font${f.id.charAt(0).toUpperCase()}${f.id.slice(1)}`)}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.fontScale')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.fontScaleDesc')}</div>
          </div>
          <div style={{ display: 'flex', background: theme.subtleBg, borderRadius: 9, padding: 3, gap: 3 }}>
            {['small', 'medium', 'large'].map((s) => (
              <div
                key={s}
                onClick={() => setFontScale(s)}
                style={{
                  padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  background: (fontScale || 'medium') === s ? theme.cardBg : 'transparent', color: (fontScale || 'medium') === s ? theme.textPrimary : theme.textMuted,
                }}
              >
                {t(`settings.fontScale${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.radiusStyle')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.radiusStyleDesc')}</div>
          </div>
          <div style={{ display: 'flex', background: theme.subtleBg, borderRadius: 9, padding: 3, gap: 3 }}>
            {['sharp', 'default', 'round'].map((s) => (
              <div
                key={s}
                onClick={() => setRadiusStyle(s)}
                style={{
                  padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  background: (radiusStyle || 'default') === s ? theme.cardBg : 'transparent', color: (radiusStyle || 'default') === s ? theme.textPrimary : theme.textMuted,
                }}
              >
                {t(`settings.radiusStyle${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.density')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.densityDesc')}</div>
          </div>
          <div style={{ display: 'flex', background: theme.subtleBg, borderRadius: 9, padding: 3, gap: 3 }}>
            {['comfortable', 'compact'].map((s) => (
              <div
                key={s}
                onClick={() => setDensity(s)}
                style={{
                  padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  background: (density || 'comfortable') === s ? theme.cardBg : 'transparent', color: (density || 'comfortable') === s ? theme.textPrimary : theme.textMuted,
                }}
              >
                {t(`settings.density${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.language')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.languageDesc')}</div>
          </div>
          <div style={{ display: 'flex', background: theme.subtleBg, borderRadius: 9, padding: 3, gap: 3 }}>
            {['pt', 'en'].map((l) => (
              <div
                key={l}
                onClick={() => setLanguage(l)}
                style={{
                  padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  background: lang === l ? theme.cardBg : 'transparent', color: lang === l ? theme.textPrimary : theme.textMuted,
                }}
              >
                {l.toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={nestedCard}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.appLogo')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 220, height: 76, borderRadius: 10, flexShrink: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', border: `1px solid ${theme.border}`, padding: '10px 12px' }}>
            <img
              src={user?.settings?.logoUrl || logoDefault}
              alt="Logo"
              style={{
                height: '100%', width: '100%', display: 'block',
                objectFit: user?.settings?.logoUrl ? 'cover' : 'contain',
                objectPosition: user?.settings?.logoUrl ? 'center' : 'left center',
              }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.appLogoDesc')}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ ...outlineButton, alignSelf: 'flex-start' }}>
                {t('settings.uploadLogo')}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={onLogoUpload} style={{ display: 'none' }} />
              </label>
              <button onClick={onResetLogo} style={{ ...outlineButton, alignSelf: 'flex-start' }}>
                {t('settings.resetLogo')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={nestedCard}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.favicon')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
            <img src={user?.settings?.faviconUrl || '/icon.png'} alt="Favicon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.faviconDesc')}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ ...outlineButton, alignSelf: 'flex-start' }}>
                {t('settings.uploadFavicon')}
                <input ref={faviconInputRef} type="file" accept="image/*" onChange={onFaviconUpload} style={{ display: 'none' }} />
              </label>
              <button onClick={onResetFavicon} style={{ ...outlineButton, alignSelf: 'flex-start' }}>
                {t('settings.resetFavicon')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        onClick={() => setSidebarSettingsOpen(true)}
        style={{ ...nestedCard, flexDirection: 'row', alignItems: 'center', gap: 14, cursor: 'pointer' }}
      >
        <div style={{ width: 38, height: 38, borderRadius: 10, background: theme.cardBg, border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="sidebar" size={17} color={theme.textPrimary} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{t('sidebarSettings.sectionTitle')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('sidebarSettings.sectionSubtitle')}</div>
        </div>
        <Icon name="external" size={15} color={theme.textMuted} />
      </div>
      </div>
      )}

      {activeTab === 'account' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={nestedCard}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.vault')}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.autoLock')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.autoLockDesc')}</div>
          </div>
          <select
            value={user?.settings?.vaultAutoLockSeconds ?? 60}
            onChange={(e) => onAutoLockChange(Number(e.target.value))}
            style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontWeight: 600, background: theme.subtleBg, color: theme.textPrimary }}
          >
            {AUTO_LOCK_OPTIONS.map((s) => (
              <option key={s} value={s} style={{ color: '#1a1a1a', background: '#fff' }}>
                {s < 60 ? t('settings.seconds', { n: s }) : t(s === 60 ? 'settings.minute' : 'settings.minutes', { n: s / 60 })}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={nestedCard}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.trash')}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.trashRetention')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.trashRetentionDesc')}</div>
          </div>
          <select
            value={user?.settings?.trashRetentionDays ?? 30}
            onChange={(e) => onTrashRetentionChange(Number(e.target.value))}
            style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontWeight: 600, background: theme.subtleBg, color: theme.textPrimary }}
          >
            <option value={7} style={{ color: '#1a1a1a', background: '#fff' }}>{t('settings.trashRetentionDays', { n: 7 })}</option>
            <option value={30} style={{ color: '#1a1a1a', background: '#fff' }}>{t('settings.trashRetentionDays', { n: 30 })}</option>
            <option value={90} style={{ color: '#1a1a1a', background: '#fff' }}>{t('settings.trashRetentionDays', { n: 90 })}</option>
            <option value={0} style={{ color: '#1a1a1a', background: '#fff' }}>{t('settings.trashRetentionNever')}</option>
          </select>
        </div>
      </div>
      </div>
      )}

      {activeTab === 'integrations' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <VpsCard theme={theme} t={t} card={nestedCard} user={user} refreshMe={refreshMe} />

      <div style={nestedCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.aiAgents')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.aiAgentsDesc')}</div>
          </div>
          <button
            onClick={openNewAgent}
            style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {t('settings.addAgent')}
          </button>
        </div>
        {agents.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noAgentsYet')}</div>}
        {agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} theme={theme} t={t} />
        ))}
      </div>
      </div>
      )}

      {activeTab === 'team' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <TeamCard theme={theme} t={t} card={nestedCard} outlineButton={outlineButton} />

      {isAdmin && (
        <>
          <AdminCard theme={theme} t={t} card={nestedCard} outlineButton={outlineButton} />
          <TemplateManagementCard theme={theme} t={t} card={nestedCard} />
        </>
      )}
      {isSuperAdmin && <AuditLogCard theme={theme} t={t} card={nestedCard} />}
      </div>
      )}

      {sidebarSettingsOpen && (
        <SidebarSettingsModal theme={theme} t={t} lang={lang} onClose={() => setSidebarSettingsOpen(false)} />
      )}

      {newAgentOpen && (
        <div
          onMouseDown={backdropClose(() => setNewAgentOpen(false))}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 400, maxWidth: '100%', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
              borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t('settings.newAgentModalTitle')}</div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                {t('settings.agentNameLabel')}
              </div>
              <input
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitNewAgent()}
                placeholder={t('settings.agentNamePlaceholder')}
                autoFocus
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                {t('settings.tokenLabel')}
              </div>
              <input
                value={newAgentToken}
                onChange={(e) => setNewAgentToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitNewAgent()}
                type="password"
                placeholder={t('settings.tokenPlaceholder')}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13.5, fontFamily: 'var(--font-mono)', background: theme.subtleBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setNewAgentOpen(false)}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitNewAgent}
                disabled={!newAgentName.trim() || !newAgentToken.trim()}
                style={{
                  flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', opacity: newAgentName.trim() && newAgentToken.trim() ? 1 : 0.5,
                }}
              >
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
