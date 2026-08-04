import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { backdropClose } from '../lib/backdropClose.js';

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function preset(kind) {
  const today = new Date();
  if (kind === 'today') return { from: toDateStr(today), to: toDateStr(today) };
  if (kind === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { from: toDateStr(y), to: toDateStr(y) };
  }
  if (kind === 'week') {
    const start = new Date(today);
    const day = (start.getDay() + 6) % 7; // Monday-start week
    start.setDate(start.getDate() - day);
    return { from: toDateStr(start), to: toDateStr(today) };
  }
  if (kind === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toDateStr(start), to: toDateStr(today) };
  }
  return { from: toDateStr(today), to: toDateStr(today) };
}

export default function ActivityModal({ onClose }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [range, setRange] = useState(() => preset('today'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getActivity(range.from, range.to).then((r) => setData(r)).finally(() => setLoading(false));
  }, [range.from, range.to]);

  const openTask = (id) => {
    onClose();
    navigate('/tasks', { state: { taskId: id } });
  };
  const openIssue = (id) => {
    onClose();
    navigate('/issues', { state: { issueId: id } });
  };

  const tasks = data?.tasks || [];
  const issues = data?.issues || [];
  const total = tasks.length + issues.length;

  return (
    <div onMouseDown={backdropClose(onClose)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520, maxWidth: '100%', maxHeight: '82vh', display: 'flex', flexDirection: 'column', gap: 16,
          background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
          borderRadius: 16, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: theme.textPrimary }}>{t('activity.title')}</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 20, lineHeight: 1, padding: '0 4px' }}>
            &times;
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', colorScheme: theme.dark ? 'dark' : 'light' }}
          />
          <span style={{ fontSize: 12, color: theme.textMuted }}>{t('activity.to')}</span>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', colorScheme: theme.dark ? 'dark' : 'light' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['today', 'yesterday', 'week', 'month'].map((k) => (
            <span
              key={k}
              onClick={() => setRange(preset(k))}
              style={{
                fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                background: theme.subtleBg, color: theme.textMuted,
              }}
            >
              {t(`activity.preset${k[0].toUpperCase()}${k.slice(1)}`)}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1, minHeight: 100 }}>
          {loading && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('common.loading')}</div>}

          {!loading && total === 0 && (
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('activity.empty')}</div>
          )}

          {!loading && tasks.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                {t('activity.tasksDone', { count: tasks.length })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => openTask(task.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: theme.subtleBg, cursor: 'pointer', fontSize: 12.5 }}
                  >
                    <Icon name="check" size={14} color={theme.accentText} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.textPrimary, fontWeight: 600 }}>{task.title}</span>
                    {task.project && <span style={{ flexShrink: 0, fontSize: 10.5, color: theme.textMuted }}>{task.project}</span>}
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: theme.textMuted }}>{new Date(task.doneAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && issues.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                {t('activity.issuesDone', { count: issues.length })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {issues.map((issue) => (
                  <div
                    key={issue.id}
                    onClick={() => openIssue(issue.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: theme.subtleBg, cursor: 'pointer', fontSize: 12.5 }}
                  >
                    <Icon name="archive" size={14} color={theme.accentText} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.textPrimary, fontWeight: 600 }}>{issue.title}</span>
                    {issue.project && <span style={{ flexShrink: 0, fontSize: 10.5, color: theme.textMuted }}>{issue.project}</span>}
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: theme.textMuted }}>{new Date(issue.completedAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
