const STORAGE_KEY = 'kh-pre-auth-lang';

function detectDeviceLanguage() {
  const nav = (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || 'en';
  return nav.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export function getPreAuthLanguage() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored === 'pt' || stored === 'en') return stored;
  return detectDeviceLanguage();
}

export function setPreAuthLanguage(lang) {
  localStorage.setItem(STORAGE_KEY, lang);
}
