import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

function timeAgo(dateStr, t) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('common.justNow');
  if (mins < 60) return t('common.minsAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('common.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  return t('common.daysAgo', { n: days });
}

export default function SapNews() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    Promise.all([api.getSapNews(), api.listSavedNews()])
      .then(([news, savedRes]) => {
        setItems(news.items);
        setSaved(savedRes.saved);
      })
      .finally(() => setLoading(false));
  }, []);

  const savedByNewsId = useMemo(() => Object.fromEntries(saved.map((s) => [s.newsId, s])), [saved]);
  const unreadCount = saved.filter((s) => !s.read).length;

  const toggleSave = async (item, e) => {
    e?.stopPropagation();
    const record = savedByNewsId[item.id];
    if (record) {
      await api.deleteSavedNews(record.id);
      setSaved((prev) => prev.filter((s) => s.id !== record.id));
    } else {
      const { saved: created } = await api.saveNews({
        newsId: item.id,
        title: item.title,
        source: item.source,
        image: item.image,
        summary: item.summary,
        content: item.content,
        link: item.link,
      });
      setSaved((prev) => [created, ...prev]);
    }
  };

  const toggleRead = async (record, e) => {
    e?.stopPropagation();
    const { saved: updated } = await api.updateSavedNews(record.id, { read: !record.read });
    setSaved((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const openPopup = async (item) => {
    setSelected(item);
    const record = savedByNewsId[item.id];
    if (record && !record.read) {
      const { saved: updated } = await api.updateSavedNews(record.id, { read: true });
      setSaved((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  };

  const savedCards = saved.map((s) => ({
    id: s.newsId, title: s.title, source: s.source, image: s.image, summary: s.summary, content: s.content, link: s.link,
    _savedRecord: s,
  }));
  const visibleItems = tab === 'saved' ? savedCards : items;

  useEffect(() => {
    if (loading || !location.state?.newsId) return;
    const found = items.find((i) => i.id === location.state.newsId) || savedCards.find((i) => i.id === location.state.newsId);
    if (found) openPopup(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, location.state]);

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

  const selectedRecord = selected ? savedByNewsId[selected.id] : null;

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{t('sapNews.title')}</div>
        <div style={{ display: 'flex', background: theme.subtleBg, borderRadius: 9, padding: 3, gap: 3 }}>
          <div
            onClick={() => setTab('all')}
            style={{
              padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              background: tab === 'all' ? theme.cardBg : 'transparent', color: tab === 'all' ? theme.textPrimary : theme.textMuted,
            }}
          >
            {t('sapNews.tabAll')}
          </div>
          <div
            onClick={() => setTab('saved')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              background: tab === 'saved' ? theme.cardBg : 'transparent', color: tab === 'saved' ? theme.textPrimary : theme.textMuted,
            }}
          >
            <Icon name="bookmark" size={13} />
            {t('sapNews.tabSaved')}
            {unreadCount > 0 && (
              <span
                style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                  background: theme.accentSoftBg, color: theme.accentText,
                }}
              >
                {unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {visibleItems.length === 0 && (
        <div style={{ fontSize: 13, color: theme.textMuted }}>{tab === 'saved' ? t('sapNews.noSaved') : t('sapNews.empty')}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {visibleItems.map((item) => {
          const record = item._savedRecord || savedByNewsId[item.id];
          const isSaved = !!record;
          return (
            <div
              key={item.id}
              onClick={() => openPopup(item)}
              style={{
                background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'hidden',
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ position: 'relative', width: '100%', height: 150, background: theme.subtleBg, flexShrink: 0 }}>
                {item.image ? (
                  <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="news" size={28} color={theme.textMuted} />
                  </div>
                )}
                <span
                  onClick={(e) => toggleSave(item, e)}
                  title={isSaved ? t('sapNews.unsave') : t('sapNews.saveLater')}
                  style={{
                    position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.55)', cursor: 'pointer',
                  }}
                >
                  <Icon name={isSaved ? 'bookmarkFilled' : 'bookmark'} size={15} color="#fff" />
                </span>
                {tab === 'saved' && record && !record.read && (
                  <span
                    style={{
                      position: 'absolute', top: 8, left: 8, width: 9, height: 9, borderRadius: '50%',
                      background: theme.accent, boxShadow: '0 0 0 2px rgba(0,0,0,0.4)',
                    }}
                  />
                )}
              </div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.accentText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {item.source}
                  </div>
                  {tab === 'saved' && record && (
                    <span
                      onClick={(e) => toggleRead(record, e)}
                      title={record.read ? t('sapNews.markUnread') : t('sapNews.markRead')}
                      style={{ display: 'flex', cursor: 'pointer', opacity: record.read ? 0.5 : 1 }}
                    >
                      <Icon name="check" size={13} color={record.read ? theme.textMuted : theme.accentText} />
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{item.title}</div>
                <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {item.summary}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 640, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
              border: `1px solid ${theme.border}`, borderRadius: 16, display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div
              style={{
                position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <span
                style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flexShrink: 0, textTransform: 'uppercase',
                  background: theme.accentSoftBg, color: theme.accentText,
                }}
              >
                {selected.source}
              </span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.title}
              </div>
              <a
                href={selected.link}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: theme.subtleBg, color: theme.textPrimary, border: 'none',
                  borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', flexShrink: 0,
                }}
              >
                <Icon name="external" size={12} /> {t('sapNews.open')}
              </a>
              <span onClick={() => setSelected(null)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 20, padding: '0 2px', flexShrink: 0 }}>
                &times;
              </span>
            </div>

            {selected.image && (
              <img src={selected.image} alt="" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }} />
            )}

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{selected.title}</div>
              <div style={{ fontSize: 12.5, color: theme.textMuted, fontWeight: 600 }}>
                {selected.source}
                {selected.publishedAt ? ` · ${timeAgo(selected.publishedAt, t)}` : ''}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: theme.textPrimary, whiteSpace: 'pre-wrap' }}>
                {selected.content || selected.summary}
              </div>
              <div style={{ fontSize: 12.5, color: theme.textMuted, fontStyle: 'italic' }}>{t('sapNews.previewCaveat')}</div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <a
                  href={selected.link}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: theme.accent, color: '#fff',
                    border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'none',
                  }}
                >
                  <Icon name="external" size={14} color="#fff" /> {t('sapNews.readFull')}
                </a>
                <button
                  onClick={(e) => toggleSave(selected, e)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'transparent',
                    border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  <Icon name={selectedRecord ? 'bookmarkFilled' : 'bookmark'} size={14} color={theme.textPrimary} />
                  {selectedRecord ? t('sapNews.unsave') : t('sapNews.saveLater')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
