import {test} from 'node:test';
import assert from 'node:assert/strict';
import {respondWithApi} from './function-adapter.js';

test('serverless adapter preserves API route, query, authorization and JSON body',async()=>{
  const response=await respondWithApi(async(req,res)=>{
    assert.equal(req.url,'/api/auth/login?test=1');
    assert.equal(req.headers.authorization,'Bearer example');
    let body='';for await(const chunk of req)body+=chunk;
    assert.equal(JSON.parse(body).email,'test@example.com');
    res.setHeader('Vary','Origin');res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));
  },new Request('https://example.netlify.app/api/auth/login?test=1',{method:'POST',headers:{Authorization:'Bearer example'},body:JSON.stringify({email:'test@example.com'})}));
  assert.equal(response.status,200);assert.equal(response.headers.get('Vary'),'Origin');assert.deepEqual(await response.json(),{ok:true});
});
