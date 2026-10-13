export async function respondWithApi(handler,request) {
  const url=new URL(request.url);
  const headers=new Headers();
  let status=200, body;
  const incoming={method:request.method,url:url.pathname+url.search,headers:Object.fromEntries(request.headers),
    async *[Symbol.asyncIterator]() {if(request.body)yield await request.text();}};
  const outgoing={
    setHeader(name,value){headers.set(name,value);},
    writeHead(code,values={}){status=code;for(const [name,value] of Object.entries(values))headers.set(name,value);},
    end(value){body=value;}
  };
  await handler(incoming,outgoing);
  return new Response(body,{status,headers});
}
