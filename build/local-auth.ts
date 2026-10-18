import type {Plugin} from 'vite';
import type {IncomingMessage} from 'node:http';
function clearHeader(req:IncomingMessage,name:string){delete req.headers[name];for(let i=req.rawHeaders.length-2;i>=0;i-=2)if(req.rawHeaders[i]?.toLowerCase()===name)req.rawHeaders.splice(i,2)}
function setHeader(req:IncomingMessage,name:string,value:string){clearHeader(req,name);req.headers[name]=value;req.rawHeaders.push(name,value)}
export function localAuth():Plugin{
  return {name:'orbit-local-auth',configureServer(server){
    server.middlewares.use((req,res,next)=>{
      for(const name of Object.keys(req.headers))if(name.startsWith('x-orbit-user-')||name.startsWith('oai-authenticated-user-'))clearHeader(req,name);
      const hostname=(req.headers.host??'').split(':')[0];
      const local=['localhost','127.0.0.1'].includes(hostname)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'');
      if(!local){next();return}
      const url=new URL(req.url??'/','http://'+req.headers.host);
      if(url.pathname==='/auth/sign-in'||url.pathname==='/auth/logout'){
        if(req.method!=='GET'){res.statusCode=405;res.end();return}
        const signIn=url.pathname==='/auth/sign-in';
        res.setHeader('Set-Cookie',`__orbit_local_auth=${signIn?'1':''}; Path=/; HttpOnly; SameSite=Lax${signIn?'':'; Max-Age=0'}`);
        res.statusCode=302;res.setHeader('Location','/');res.end();return;
      }
      const cookies=(req.headers.cookie??'').split(';').map(v=>v.trim());
      const identities:Record<string,[string,string,string]>={
        '1':['local_owner','owner@orbit.local','Local owner'],
        'teammate':['local_teammate','teammate@orbit.local','Local teammate'],
        'outsider':['local_outsider','outsider@orbit.local','Local outsider'],
      };
      const selected=cookies.filter(v=>v.startsWith('__orbit_local_auth='));
      const identity=selected.length===1?identities[selected[0].split('=')[1]]:undefined;
      if(identity){
        setHeader(req,'x-orbit-user-id',identity[0]);setHeader(req,'x-orbit-user-email',identity[1]);setHeader(req,'x-orbit-user-name',encodeURIComponent(identity[2]));
      }
      next();
    });
  }};
}
