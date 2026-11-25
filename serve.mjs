import {createServer} from 'node:http'
import {createReadStream,statSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const root=fileURLToPath(new URL('.',import.meta.url)),args=process.argv.slice(2)
const read=(flag,fall)=>args.includes(flag)?args[args.indexOf(flag)+1]||fall:fall
const port=Number(read('--port',process.env.PORT||'8000')), host=read('--host',process.env.HOST||'127.0.0.1')
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.wav':'audio/wav'}
createServer((q,r)=>{
 let f
 try{
  const url=new URL(q.url,'http://localhost'),request=decodeURIComponent(url.pathname)
  if(request.split('/').some(x=>x.startsWith('.')))throw Error()
  f=path.resolve(root,'.'+(request.endsWith('/')?request+'index.html':request))
  if(!f.startsWith(root)||!statSync(f).isFile())throw Error()
 }catch{r.writeHead(404);r.end('Não encontrado.');return}
 if(!['GET','HEAD'].includes(q.method)){r.writeHead(405);r.end();return}
 r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'})
 if(q.method==='HEAD')r.end();else createReadStream(f).pipe(r)
}).listen(port,host,()=>console.log('Local: http://'+host+':'+port+'/'))
