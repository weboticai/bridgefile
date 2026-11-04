import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';

const pc = document.body.dataset.mode === 'pc';
const session = location.pathname;
const endpoint = pc ? '/state' : session + '/state';
const maxSize = 2 * 1024 ** 3;
const paths = {
  bridge:'M3 17h18M5 17V9m14 8V9M5 10c4 5 10 5 14 0M8 13v4m8-4v4',
  wifi:'M3 9a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 3a5 5 0 0 1 6 0m-3 4h.01',
  upload:'M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4',
  download:'M12 4v12m-5-5 5 5 5-5M4 17v3h16v-3',
  file:'M6 3h8l4 4v14H6zM14 3v5h4M9 13h6m-6 4h6',
  phone:'M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 14h2',
  check:'m5 12 4 4L19 6',
};
function Icon({name, size=22}){
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>;
}
function sizeText(size){
  const units=['B','KB','MB','GB'];
  const index=size?Math.min(3,Math.floor(Math.log(size)/Math.log(1024))):0;
  return (size/1024**index).toLocaleString('pt-BR',{maximumFractionDigits:1})+' '+units[index];
}
function useSession(){
  const [data,setData]=useState({addresses:[],files:[]});
  const [status,setStatus]=useState('loading');
  useEffect(()=>{
    let timer;
    const controller=new AbortController();
    async function refresh(){
      try{
        const response=await fetch(endpoint,{signal:controller.signal});
        if(!response.ok) throw Error();
        const result=await response.json();
        setData(pc?result:{addresses:[],files:result});
        setStatus('ready');
      }catch{if(!controller.signal.aborted) setStatus('offline');}
      if(!controller.signal.aborted) timer=setTimeout(refresh,1500);
    }
    refresh();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[]);
  return {...data,status};
}
function Connection({addresses,status}){
  const [index,setIndex]=useState(0);
  const selected=addresses[index]?index:0;
  const address=addresses[selected];
  return <section className="card connection">
    <span className="section-tag"><Icon name="phone" size={17}/> PAREAMENTO</span>
    <h2>Conecte o celular</h2>
    <p>Aponte a câmera para o QR Code.</p>
    {address?<><div className="qr-frame"><img src={'/qr/'+selected} alt="QR Code de conexão com o celular"/></div>
      {addresses.length>1&&<label className="adapter">Rede do PC<select value={selected} onChange={e=>setIndex(Number(e.target.value))}>{addresses.map((item,i)=><option key={item.url} value={i}>{item.name}</option>)}</select></label>}
      <details><summary>Usar o endereço manualmente</summary><code>{address.url}</code></details></>:
      <div className="empty">{status==='loading'?'Buscando a rede local…':'Conecte o computador à rede para gerar o QR Code.'}</div>}
  </section>;
}
function SendFiles({online}){
  const input=useRef(null);
  const nextId=useRef(0);
  const active=useRef(false);
  const [busy,setBusy]=useState(false);
  const [queue,setQueue]=useState([]);
  const [dragging,setDragging]=useState(false);
  function upload(file,onProgress){
    return new Promise(resolve=>{
      const request=new XMLHttpRequest();
      request.open('POST',pc?'/share':session);
      request.setRequestHeader('X-File-Name',encodeURIComponent(file.name));
      request.upload.onprogress=e=>{if(e.lengthComputable&&e.total) onProgress(Math.round(e.loaded/e.total*100));};
      request.onload=()=>resolve(request.status===201);
      request.onerror=request.onabort=()=>resolve(false);
      request.send(file);
    });
  }
  async function send(files){
    if(!files.length||active.current||!online) return;
    active.current=true;
    setBusy(true);
    const batch=files.map(file=>({file,id:++nextId.current,progress:0,status:'waiting'}));
    const update=(id,changes)=>setQueue(items=>items.map(item=>item.id===id?{...item,...changes}:item));
    setQueue(items=>[...batch,...items]);
    try{
      for(const {file,id} of batch){
        if(file.size>maxSize){update(id,{status:'limit'});continue;}
        update(id,{status:'sending'});
        const ok=await upload(file,progress=>update(id,{progress})).catch(()=>false);
        update(id,ok?{status:'done',progress:100}:{status:'error'});
      }
    }finally{active.current=false;setBusy(false);}
  }
  const labels={waiting:'Na fila',sending:'Enviando',done:pc?'Disponível no celular':'Recebido no PC',limit:'Arquivo acima do limite de 2 GB',error:'Falha no envio. Selecione o arquivo para tentar novamente.'};
  return <section className="card">
    <span className="section-tag"><Icon name="upload" size={17}/> ENVIAR</span>
    <h2>{pc?'Enviar para o celular':'Enviar para o PC'}</h2>
    <div className={'drop'+(dragging?' dragging':'')} onDragOver={e=>{e.preventDefault();if(online&&!busy)setDragging(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);send(Array.from(e.dataTransfer.files));}}>
      <div className="round"><Icon name="upload" size={25}/></div>
      <strong>{pc?'Arraste os arquivos até aqui':'Fotos, vídeos e documentos'}</strong>
      <small>Até 2 GB por arquivo</small>
      <input hidden ref={input} type="file" multiple onChange={e=>{const files=Array.from(e.target.files);e.target.value='';send(files);}}/>
      <button disabled={!online||busy} onClick={()=>input.current.click()}>{busy?'Enviando…':'Escolher arquivos'}</button>
    </div>
    <div aria-live="polite">{queue.map(({file,id,status,progress})=><div className="file" key={id}>
      <span className="file-icon"><Icon name={status==='done'?'check':'file'} size={19}/></span>
      <div className="file-info"><strong>{file.name}</strong><small>{labels[status]}{status==='sending'?' · '+progress+'%':''}</small>
      {status==='sending'&&<progress max="100" value={progress} aria-label={'Envio de '+file.name}/>}</div>
    </div>)}</div>
  </section>;
}
function Received({files}){
  const prefix=pc?'/file/':session+'/file/';
  return <section className="card">
    <span className="section-tag"><Icon name="download" size={17}/> RECEBER</span>
    <div className="heading"><h2>{pc?'Arquivos recebidos':'Enviados pelo PC'}</h2><span className="count">{files.length}</span></div>
    {files.length?<div>{files.map(file=><div className="file" key={file.id}>
      <span className="file-icon"><Icon name="file" size={19}/></span>
      <div className="file-info"><strong>{file.name}</strong><small>{sizeText(file.size)}</small></div>
      <a className="download" href={prefix+file.id} aria-label={'Baixar '+file.name}><Icon name="download" size={17}/> Baixar</a>
    </div>)}</div>:<div className="empty"><Icon name="file" size={27}/><strong>Nenhum arquivo por aqui</strong><small>Os arquivos aparecem assim que forem enviados.</small></div>}
    {pc&&<p className="hint">Salvos no Windows em <strong>Ponte - Recebidos</strong>.</p>}
  </section>;
}
function App(){
  const {addresses,files,status}=useSession();
  return <main className={pc?'desktop':'mobile'}>
    <header><span className="brand"><span className="logo"><Icon name="bridge" size={25}/></span>Ponte</span>
      <span className={'badge '+status}><Icon name="wifi" size={17}/>{status==='ready'?'Rede local':status==='offline'?'Sem conexão':'Conectando'}</span>
    </header>
    <div className="intro"><span className="kicker">TRANSFERÊNCIA POR WI-FI</span><h1>Seus arquivos,<br/><em>logo ali.</em></h1>
      <p>{pc?'Envie e receba arquivos entre o Windows e o celular.':'Envie para o computador ou baixe o que ele compartilhou.'}</p>
    </div>
    {status==='offline'&&<p role="status" className="notice">Conexão perdida. Confira se o Ponte está aberto no PC.</p>}
    <div className="layout">
      {pc&&<Connection addresses={addresses} status={status}/>}
      <div className="workspace"><SendFiles online={status==='ready'}/><Received files={files}/></div>
    </div>
    <footer><Icon name="wifi" size={16}/> Mantenha os dois aparelhos na mesma rede.</footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
