import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'};
export async function serveFrontend(request,response,url,root=resolve('dist')) {
  if(!['GET','HEAD'].includes(request.method)||url.pathname.startsWith('/api/'))return false;
  let path;
  try {path=resolve(root,`.${decodeURIComponent(url.pathname)}`);}catch{return false;}
  if(path!==root&&!path.startsWith(root+sep))return false;
  if(url.pathname==='/')path=resolve(root,'index.html');
  try {
    const contents=await readFile(path);
    response.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':extname(path)==='.html'?'no-cache':'public, max-age=3600'});
    response.end(request.method==='HEAD'?undefined:contents);return true;
  }catch{return false;}
}
