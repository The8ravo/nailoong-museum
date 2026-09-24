import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const prefix=(process.env.BASE_PATH||'').replace(/^\/+|\/+$/g,'');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.xml':'application/xml','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(prefix){if(pathname===`/${prefix}`){res.writeHead(301,{Location:`/${prefix}/`});res.end();return;}if(!pathname.startsWith(`/${prefix}/`))throw new Error('not-found');pathname=pathname.slice(prefix.length+1);}
  let file=path.resolve(root,'.'+pathname);
  if(file!==root&&!file.startsWith(root+path.sep))throw new Error('not-found');
  const info=await stat(file);
  if(info.isDirectory()){
   if(!pathname.endsWith('/')){res.writeHead(301,{Location:new URL(req.url,'http://localhost').pathname+'/'});res.end();return;}
   file=path.join(file,'index.html');
  }
  const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(path.join(root,'404.html')).catch(()=>Buffer.from('Not found')));}
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Museum preview: http://127.0.0.1:${server.address().port}/${prefix?prefix+'/':''}`));
