import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { useIsMobile } from '../lib/useIsMobile.js';

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function recipientList(recipients) {
  if (!Array.isArray(recipients) || recipients.length === 0) return '—';
  return recipients.map((r) => r.name || r.email || '?').join(', ');
}

export default function Emails() {
  const { theme } = useTheme();
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const { refresh: refreshCounts } = useCounts();
  const isMobile = useIsMobile();
  const [emails, setEmails] = useState([]);
  const [detail, setDetail] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const fileInputRef = useRef(null);

  const load = async () => {
    const { emails } = await api.listEmails();
    setEmails(emails);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    api.getEmail(selectedId).then(({ email }) => setDetail(email));
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter((e) =>
      e.subject.toLowerCase().includes(q) || (e.fromName || '').toLowerCase().includes(q) || (e.fromAddress || '').toLowerCase().includes(q)
    );
  }, [emails, search]);

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const { email } = await api.uploadEmail(file);
      setEmails((prev) => [email, ...prev]);
      setSelectedId(email.id);
      setMobileShowDetail(true);
      refreshCounts();
    } catch (err) {
      setUploadError(err.message || t('emails.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const selectEmail = (id) => {
    setSelectedId(id);
    setMobileShowDetail(true);
  };

  const toggleFavorite = async () => {
    if (!detail) return;
    const { email } = await api.updateEmail(detail.id, { favorite: !detail.favorite });
    setDetail(email);
    setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, favorite: email.favorite } : e)));
  };

  const removeEmail = async () => {
    if (!detail) return;
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    await api.deleteEmail(detail.id);
    setEmails((prev) => prev.filter((e) => e.id !== detail.id));
    setSelectedId(null);
    setMobileShowDetail(false);
    refreshCounts();
  };

  const dateStr = (d) => (d ? new Date(d).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  return (
    <div style={{ padding: isMobile ? 14 : '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{t('emails.title')}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>{t('emails.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input ref={fileInputRef} type="file" accept=".msg" onChange={handleFileChange} style={{ display: 'none' }} />
          <button
            onClick={openFilePicker}
            disabled={uploading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}
          >
            <Icon name="mail" size={14} color="#fff" /> {uploading ? t('emails.importing') : t('emails.importMsg')}
          </button>
        </div>
      </div>

      {uploadError && (
        <div style={{ background: 'oklch(0.95 0.05 25)', color: 'oklch(0.4 0.18 25)', border: '1px solid oklch(0.8 0.12 25)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5 }}>
          {uploadError}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', gap: isMobile ? 0 : 16, minHeight: 0 }}>
        {(!isMobile || !mobileShowDetail) && (
          <div style={{ flex: isMobile ? '1 1 auto' : '1 1 320px', minWidth: isMobile ? 0 : 280, maxWidth: isMobile ? 'none' : 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px' }}>
              <Icon name="search" size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('emails.searchPlaceholder')}
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: theme.textPrimary, width: '100%' }}
              />
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 20, fontSize: 12.5, color: theme.textMuted, textAlign: 'center' }}>{t('emails.empty')}</div>
              )}
              {filtered.map((e) => {
                const isActive = e.id === selectedId;
                return (
                  <div
                    key={e.id}
                    onClick={() => selectEmail(e.id)}
                    style={{
                      padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                      background: isActive ? theme.accentSoftBg : 'transparent',
                      border: `1px solid ${isActive ? theme.accent : 'transparent'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: theme.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.subject}
                      </div>
                      {e.favorite && <Icon name="pin" size={12} color={theme.accentText} />}
                    </div>
                    <div style={{ fontSize: 11.5, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.fromName || e.fromAddress || '—'}
                    </div>
                    <div style={{ fontSize: 10.5, color: theme.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{dateStr(e.sentAt || e.createdAt)}</span>
                      {Array.isArray(e.attachments) && e.attachments.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Icon name="download" size={10} /> {e.attachments.length}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(!isMobile || mobileShowDetail) && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!detail ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted, fontSize: 13 }}>
                {t('emails.selectPrompt')}
              </div>
            ) : (
              <>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    {isMobile && (
                      <span onClick={() => setMobileShowDetail(false)} style={{ display: 'flex', cursor: 'pointer', color: theme.textMuted, transform: 'rotate(180deg)', flexShrink: 0, marginTop: 2 }}>
                        <Icon name="chevron" size={18} />
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800 }}>{detail.subject}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span onClick={toggleFavorite} title={t('emails.favorite')} style={{ cursor: 'pointer', display: 'flex' }}>
                        <Icon name="pin" size={16} color={detail.favorite ? theme.accentText : theme.textMuted} />
                      </span>
                      <a href={detail.fileUrl} download={detail.fileName} title={t('emails.downloadOriginal')} style={{ cursor: 'pointer', display: 'flex', color: theme.textMuted }}>
                        <Icon name="download" size={16} />
                      </a>
                      <span onClick={removeEmail} title={t('common.delete')} style={{ cursor: 'pointer', display: 'flex', color: theme.textMuted }}>
                        <Icon name="trash" size={16} />
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div><strong style={{ color: theme.textPrimary }}>{t('emails.from')}:</strong> {detail.fromName || detail.fromAddress || '—'}{detail.fromAddress && detail.fromName ? ` <${detail.fromAddress}>` : ''}</div>
                    <div><strong style={{ color: theme.textPrimary }}>{t('emails.to')}:</strong> {recipientList(detail.toRecipients)}</div>
                    {Array.isArray(detail.ccRecipients) && detail.ccRecipients.length > 0 && (
                      <div><strong style={{ color: theme.textPrimary }}>{t('emails.cc')}:</strong> {recipientList(detail.ccRecipients)}</div>
                    )}
                    <div><strong style={{ color: theme.textPrimary }}>{t('emails.date')}:</strong> {dateStr(detail.sentAt)}</div>
                  </div>
                  {Array.isArray(detail.attachments) && detail.attachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {detail.attachments.map((att, i) => (
                        <a
                          key={i}
                          href={att.url}
                          download={att.name}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 20,
                            background: theme.subtleBg, color: theme.textPrimary, border: `1px solid ${theme.border}`, textDecoration: 'none',
                          }}
                        >
                          <Icon name="download" size={11} /> {att.name} <span style={{ opacity: 0.6 }}>({formatBytes(att.size)})</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {detail.bodyHtml ? (
                    // Rendered untrusted external HTML in a fully sandboxed iframe
                    // (no allow-scripts / allow-same-origin) so it can never run
                    // script or reach the app's origin — same-origin-safe preview.
                    <iframe
                      title="email-body"
                      sandbox=""
                      srcDoc={detail.bodyHtml}
                      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                    />
                  ) : (
                    <pre style={{ margin: 0, padding: 20, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: 13, color: theme.textPrimary, height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
                      {detail.bodyText || t('emails.noBody')}
                    </pre>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
