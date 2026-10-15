const SESSION_KEY = 'wolly-up-session';
export function getSavedSession() {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}
let sessionToken=getSavedSession();
export function setApiSession(token) {
  sessionToken=token || null;
  try {
    if (sessionToken) localStorage.setItem(SESSION_KEY, sessionToken);
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* Keep sign-in usable when browser storage is unavailable. */ }
}

export function apiUrl(path, origin=import.meta.env?.VITE_API_URL || '') {
  return typeof path==='string' && path.startsWith('/api/') && origin ? `${origin.replace(/\/$/,'')}${path}` : path;
}

export function apiFetch(path,options) {
  if(sessionToken && typeof path==='string' && path.startsWith('/api/')) {
    const headers=new Headers(options?.headers);
    if(!headers.has('Authorization'))headers.set('Authorization',`Bearer ${sessionToken}`);
    options={...options,headers};
  }
  return fetch(apiUrl(path),options);
}
