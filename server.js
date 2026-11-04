const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { execFile } = require('node:child_process');
const qr = require('./qr');
let port = Number(process.env.PONTE_PORT || 8765);
const token = randomBytes(12).toString('base64url');
const folder = path.join(os.homedir(), 'Ponte - Recebidos');
const files = [];
const outgoing = [];
const session = '/s/' + token;
const publicFile = ({id,name,size}) => ({id,name,size});
const limit = 2 * 1024 ** 3;
const ui = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const assets = new Map([
  ['/app.js', { body: fs.readFileSync(path.join(__dirname, 'app.js')), type: 'text/javascript; charset=utf-8' }],
  ['/app.css', { body: fs.readFileSync(path.join(__dirname, 'app.css')), type: 'text/css; charset=utf-8' }],
]);
const getAddresses = () => Object.entries(os.networkInterfaces()).flatMap(([name,items]) =>
  items.filter(i=>i.family==='IPv4'&&!i.internal&&!i.address.startsWith('169.254.')).map(i=>({name,url:'http://'+i.address+':'+port+'/s/'+token})))
  .sort((a,b)=>Number(/wi.?fi|wireless|wlan/i.test(b.name))-Number(/wi.?fi|wireless|wlan/i.test(a.name)));

function send(res,status,body,type='text/plain; charset=utf-8') {
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(body);
}
const server=http.createServer(async (req,res)=>{
  const local=['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && req.headers.host==='127.0.0.1:'+port;
  const url=req.url;
  const asset = req.method === 'GET' && assets.get(url);
  if (asset) return send(res, 200, asset.body, asset.type);
  try {
    if(req.method==='GET' && ((local&&url==='/') || url==='/s/'+token)) {
      return send(res,200,ui.replace('__MODE__',local&&url==='/'?'pc':'phone'),'text/html; charset=utf-8');
    }
    if(local&&req.method==='GET') {
      if(url==='/state') return send(res,200,JSON.stringify({addresses:getAddresses(),files:files.map(publicFile)}),'application/json');
      const addresses=getAddresses();
      const qrMatch=/^\/qr\/(\d+)$/.exec(url);
      if(qrMatch && addresses[qrMatch[1]]) return send(res,200,qr(addresses[qrMatch[1]].url),'image/svg+xml');
    }
    if(req.method==='GET') {
      if(url===session+'/state') return send(res,200,JSON.stringify(outgoing.map(publicFile)),'application/json');
      const item=local && url.startsWith('/file/')
        ? files.find(f=>url==='/file/'+f.id)
        : outgoing.find(f=>url===session+'/file/'+f.id);
      if(item) {
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(item.name).replace(/'/g,'%27'),'Content-Length':item.size,'X-Content-Type-Options':'nosniff'});
        await pipeline(fs.createReadStream(item.path),res);
        return;
      }
    }
    const sharing = local && url==='/share';
    if(req.method==='POST' && (sharing || url===session)) {
      const size=Number(req.headers['content-length']);
      if(!Number.isSafeInteger(size)||size<0||size>limit) return send(res,413,'Limite de 2 GB por arquivo.');
      const name=decodeURIComponent(req.headers['x-file-name']||'arquivo').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim().replace(/[. ]+$/,'').slice(0,120)||'arquivo';
      const destination = sharing ? path.join(folder, 'Compartilhados') : folder;
      await fs.promises.mkdir(destination,{recursive:true});
      const id=randomBytes(8).toString('hex');
      const temp=path.join(destination,id+'.parte');
      const dest=path.join(destination,id.slice(0,8)+' - '+name);
      try {
        await pipeline(req,fs.createWriteStream(temp,{flags:'wx'}));
        await fs.promises.rename(temp,dest);
      } catch(error) {
        await fs.promises.unlink(temp).catch(()=>{});
        throw error;
      }
      (sharing ? outgoing : files).unshift({id,name,size,path:dest});
      return send(res,201,'Recebido');
    }
    send(res,404,'Endereço inválido ou sessão encerrada.');
  } catch {
    if(!res.headersSent&&!res.destroyed) send(res,500,'Não foi possível concluir a operação.');
    else res.destroy();
  }
});
let retries = 0;
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && retries < 20 && port < 65535) {
    retries++;
    port++;
    server.listen(port, '0.0.0.0');
    return;
  }
  console.error('Não foi possível iniciar o Ponte:', error.message);
  process.exitCode = 1;
});
server.once('listening', () => {
  port = server.address().port;
  const pc = 'http://127.0.0.1:' + port;
  console.log('Ponte aberto em ' + pc + '\nArquivos salvos em ' + folder + '\nMantenha esta janela aberta durante o envio.');
  if (process.platform === 'win32' && !process.env.PONTE_NO_OPEN) {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', pc]);
  }
});
server.listen(port, '0.0.0.0');


