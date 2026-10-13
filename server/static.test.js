import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {serveFrontend} from './static.js';
import {apiUrl} from '../src/api.js';

test('production serves the built homepage and never handles API requests as HTML',async()=>{
  const root=await mkdtemp(join(tmpdir(),'wolly-static-'));
  try {
    await writeFile(join(root,'index.html'),'<div id="root"></div>');
    let body,status;
    const response={writeHead(code){status=code;},end(value){body=value;}};
    assert.equal(await serveFrontend({method:'GET'},response,new URL('http://localhost/'),root),true);
    assert.equal(status,200);assert.match(body.toString(),/id="root"/);
    assert.equal(await serveFrontend({method:'GET'},response,new URL('http://localhost/api/auth/login'),root),false);
    assert.equal(await serveFrontend({method:'GET'},response,new URL('http://localhost/%2e%2e%2f.env'),root),false);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('API host routing preserves local development and external data requests',()=>{
  assert.equal(apiUrl('/api/auth/login','https://example.onrender.com/'),'https://example.onrender.com/api/auth/login');
  assert.equal(apiUrl('/api/auth/login',''),'/api/auth/login');
  assert.equal(apiUrl('https://example.com/data','https://example.onrender.com'),'https://example.com/data');
});
