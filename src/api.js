let sessionToken=null;
export function setApiSession(token) {sessionToken=token || null;}

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
