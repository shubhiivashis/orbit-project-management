import handler from 'vinext/server/fetch-handler';
import { accessSettings,identityRequest,verifyAccessIdentity } from '../lib/access-auth';

function message(request:Request,status:number,title:string,detail:string){
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(new URL(request.url).pathname.startsWith('/api/'))return Response.json({error:detail},{status,headers});
  return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbit — ${title}</title><style>body{font:16px system-ui;background:#f5f8f1;color:#284d3b;max-width:600px;margin:15vh auto;padding:25px;line-height:1.7}h1{font-size:30px}a{color:#346b4e}</style><h1>${title}</h1><p>${detail}</p><a href="/">Try again</a></html>`,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
export default {
  async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
    if(import.meta.env.DEV)return handler.fetch(request,env,ctx);
    try{accessSettings(env)}catch{
      return message(request,503,'Orbit setup is in progress','The owner needs to finish configuring email sign-in for this website.');
    }
    let identity;
    try{identity=await verifyAccessIdentity(request.headers.get('cf-access-jwt-assertion'),env)}catch{
      return message(request,401,'Please sign in','Open this website through its Cloudflare Access sign-in page using an approved email address.');
    }
    const url=new URL(request.url);
    if(url.pathname==='/auth/logout')return Response.redirect(new URL('/cdn-cgi/access/logout',url).href,302);
    if(url.pathname==='/auth/sign-in')return Response.redirect(new URL('/',url).href,302);
    const response=await handler.fetch(identityRequest(request,identity),env,ctx);
    const result=new Response(response.body,response);
    result.headers.set('Cache-Control','private, no-store');
    result.headers.set('X-Content-Type-Options','nosniff');
    return result;
  },
};
