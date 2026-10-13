export function apiUrl(path, origin=import.meta.env?.VITE_API_URL || '') {
  return typeof path==='string' && path.startsWith('/api/') && origin ? `${origin.replace(/\/$/,'')}${path}` : path;
}

export function apiFetch(path,options) {
  return fetch(apiUrl(path),options);
}
