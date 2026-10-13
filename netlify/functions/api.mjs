import {respondWithApi} from '../../server/function-adapter.js';

let initialization;
export default async function(request) {
  if(!process.env.DATABASE_URL)return Response.json({error:'The hosted database has not been connected yet.'},{status:503});
  try {
    const {handleRequest,prepareDatabase}=await import('../../server/index.js');
    if(!initialization)initialization=prepareDatabase().catch(error=>{initialization=null;throw error;});
    await initialization;
    return await respondWithApi(handleRequest,request);
  }catch(error){console.error('API initialization failed:',error.message);return Response.json({error:'The server is temporarily unavailable. Please try again shortly.'},{status:503});}
}
