import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

const WEEKDAY_KEYS = ['calendar.mon', 'calendar.tue', 'calendar.wed', 'calendar.thu', 'calendar.fri', 'calendar.sat', 'calendar.sun'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfCalendarGrid(year, month) {
  const first = new Date(year, month, 1);
  const weekday = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month, 1 - weekday);
  return start;
}

export default function Calendar() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    Promise.all([api.listTasks(), api.listIssues()])
      .then(([{ tasks }, { issues }]) => {
        setTasks(tasks);
        setIssues(issues);
      })
      .finally(() => setLoading(false));
  }, []);

  const itemsByDay = useMemo(() => {
    const map = {};
    for (const task of tasks) {
      if (!task.due) continue;
      (map[task.due] ||= []).push({ kind: 'task', id: task.id, title: task.title, done: task.done });
    }
    for (const issue of issues) {
      if (!issue.due) continue;
      (map[issue.due] ||= []).push({ kind: 'issue', id: issue.id, title: issue.title, done: issue.status === 'Done' });
    }
    return map;
  }, [tasks, issues]);

  const todayKey = toKey(new Date());
  const gridStart = startOfCalendarGrid(cursor.year, cursor.month);
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(t('calendar.locale'), { month: 'long', year: 'numeric' });

  const goMonth = (delta) => {
    setSelectedDay(null);
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const goToday = () => {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDay(todayKey);
  };

  const goToItem = (item) => {
    if (item.kind === 'task') navigate('/tasks', { state: { taskId: item.id } });
    else navigate('/issues', { state: { issueId: item.id } });
  };

  const selectedItems = selectedDay ? itemsByDay[selectedDay] || [] : [];

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 22, fontWeight: 800, textTransform: 'capitalize' }}>{monthLabel}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => goMonth(-1)} style={{ background: theme.subtleBg, border: 'none', color: theme.textPrimary, borderRadius: 9, width: 34, height: 34, cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
            &#8249;
          </button>
          <button onClick={goToday} style={{ background: theme.subtleBg, border: 'none', color: theme.textPrimary, borderRadius: 9, padding: '9px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 12.5 }}>
            {t('calendar.today')}
          </button>
          <button onClick={() => goMonth(1)} style={{ background: theme.subtleBg, border: 'none', color: theme.textPrimary, borderRadius: 9, width: 34, height: 34, cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
            &#8250;
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 20 }}>
        <div style={{ flex: '1 1 640px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {WEEKDAY_KEYS.map((k) => (
              <div key={k} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 0' }}>
                {t(k)}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '1fr', gap: 6, overflow: 'auto' }}>
            {days.map((d) => {
              const key = toKey(d);
              const inMonth = d.getMonth() === cursor.month;
              const isToday = key === todayKey;
              const isSelected = key === selectedDay;
              const dayItems = itemsByDay[key] || [];
              return (
                <div
                  key={key}
                  onClick={() => setSelectedDay(key)}
                  style={{
                    borderRadius: 10, padding: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 78,
                    background: isSelected ? theme.accentSoftBg : 'transparent',
                    border: isToday ? `1.5px solid ${theme.accent}` : `1px solid ${theme.border}`,
                    opacity: inMonth ? 1 : 0.4,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? theme.accentText : theme.textPrimary }}>{d.getDate()}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {dayItems.slice(0, 3).map((item) => (
                      <div
                        key={`${item.kind}-${item.id}`}
                        onClick={(e) => { e.stopPropagation(); goToItem(item); }}
                        title={item.title}
                        style={{
                          fontSize: 10.5, fontWeight: 600, padding: '2px 5px', borderRadius: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.55 : 1,
                          background: item.kind === 'task' ? 'oklch(0.9 0.07 250)' : 'oklch(0.9 0.07 20)',
                          color: item.kind === 'task' ? 'oklch(0.4 0.13 250)' : 'oklch(0.4 0.13 20)',
                        }}
                      >
                        {item.title}
                      </div>
                    ))}
                    {dayItems.length > 3 && (
                      <div style={{ fontSize: 10, color: theme.textMuted, fontWeight: 700, padding: '0 5px' }}>
                        +{dayItems.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: '0 0 300px', width: 300, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {selectedDay ? new Date(selectedDay).toLocaleDateString(t('calendar.locale'), { weekday: 'long', day: 'numeric', month: 'long' }) : t('calendar.selectDay')}
          </div>
          {selectedDay && selectedItems.length === 0 && (
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('calendar.nothingDue')}</div>
          )}
          {selectedItems.map((item) => (
            <div
              key={`${item.kind}-${item.id}`}
              onClick={() => goToItem(item)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: theme.subtleBg, cursor: 'pointer' }}
            >
              <span
                style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6, flexShrink: 0,
                  background: item.kind === 'task' ? 'oklch(0.9 0.07 250)' : 'oklch(0.9 0.07 20)',
                  color: item.kind === 'task' ? 'oklch(0.4 0.13 250)' : 'oklch(0.4 0.13 20)',
                }}
              >
                {item.kind === 'task' ? t('calendar.task') : t('calendar.issue')}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.6 : 1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
