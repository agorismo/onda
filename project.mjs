import {fxClean} from './fx-catalog.mjs'
export const PPQ=96, BAR=4*PPQ, STEP=24, MAX_BARS=128, MAX_TRACKS=24, MAX_PATTERNS=100
export const COLORS=['#f99d70','#7ae0cd','#a99afe','#f5d387','#81b6fe','#f38cb8','#bbe98b','#c3a2bc']
export const PRESETS={
 kick:['Bumbo','drum'],snare:['Caixa','drum'],hat:['Chimbal','drum'],clap:['Palmas','drum'],perc:['Percussão','drum'],
 sub:['Sub Grave','synth'],bass:['Baixo Analógico','synth'],keys:['Teclas de Vidro','synth'],lead:['Lead Prisma','synth'],pad:['Pad Horizonte','synth'],pluck:['Pluck Neon','synth'],sample:['Sample','audio']
}
export const clamp=(n,a,b)=>Math.min(b,Math.max(a,n))
export const num=(n,a,b,d)=>typeof n==='number'&&Number.isFinite(n)?clamp(n,a,b):d
export const id=()=>globalThis.crypto?.randomUUID?.()||'x'+Date.now().toString(36)+Math.random().toString(36).slice(2)
export const tidy=(s,d,max=64)=>typeof s==='string'&&s.trim()?s.trim().slice(0,max):d
export const track=(preset,i=0,n)=>({id:id(),name:n||PRESETS[preset][0],preset,color:i%COLORS.length,vol:preset==='kick'?.78:.62,pan:0,mute:false,solo:false,low:20000,res:.4,delay:0,verb:0,drive:0,sample:null,sampleIn:0,sampleOut:1,fadeIn:.005,fadeOut:.012,auto:[],fx:[]})
export const note=(at=0,m=60,len=STEP,v=.8)=>({id:id(),at,m,len,v})
export const pat=(t,i=1,bars=1)=>({id:id(),track:t,name:'Padrão '+String(i).padStart(2,'0'),bars,notes:[]})
export const clip=(p,bar)=>({id:id(),pattern:p,bar})
export function blank(name='Projeto sem título'){
 const t=track('keys')
 const p=pat(t.id)
 return {version:1,name,bpm:110,bars:8,swing:0,master:.82,masterFx:[],loop:true,loopStart:0,loopEnd:4,tracks:[t],patterns:[p],clips:[clip(p.id,0)]}
}
export function demo(){
 const d=blank('Depois da Meia-Noite')
 Object.assign(d,{bpm:108,bars:12,swing:.15,loopEnd:8})
 d.tracks=[track('kick',0),track('snare',1),track('hat',2),track('bass',3),track('keys',4),track('pad',5)]
 d.tracks[2].vol=.38;d.tracks[2].pan=.18;d.tracks[3].vol=.49;d.tracks[4].vol=.48;d.tracks[4].delay=.17;d.tracks[4].verb=.24;d.tracks[5].vol=.25;d.tracks[5].verb=.21
 d.patterns=d.tracks.map((t,i)=>pat(t.id,i+1,i>=3?2:1))
 const [k,s,h,b,e,a]=d.patterns
 ;[0,6,8,14].forEach((v,i)=>k.notes.push(note(v*STEP,36,STEP,i%2?.83:1)))
 ;[4,12].forEach(v=>s.notes.push(note(v*STEP,38,STEP,.87)))
 ;[0,2,4,6,8,10,12,14,15].forEach((v,i)=>h.notes.push(note(v*STEP,42,STEP,i%2?.43:.75)))
 ;[[0,36,3],[5,36,2],[8,39,4],[14,36,2],[16,32,6],[23,32,2],[26,34,4],[30,31,2]].forEach(([at,m,l])=>b.notes.push(note(at*STEP,m,l*STEP,.83)))
 ;[[0,72],[3,75],[6,79],[10,70],[13,72],[16,68],[19,72],[23,75],[26,74],[29,67]].forEach(([at,m],i)=>e.notes.push(note(at*STEP,m,(i%3+1)*STEP,.65+i%3*.07)))
 ;[[0,[48,51,55,58]],[16,[44,48,51,55]]].forEach(([at,ms])=>ms.forEach(m=>a.notes.push(note(at*STEP,m,STEP*15,.49))))
 d.clips=[]
 for(let i=0;i<8;i++){
  if(i!==3)d.clips.push(clip(k.id,i)); if(i!==0)d.clips.push(clip(s.id,i))
  if(i>=1)d.clips.push(clip(h.id,i))
  if(i%2===0){if(i>=2)d.clips.push(clip(b.id,i));d.clips.push(clip(e.id,i));if(i!==2)d.clips.push(clip(a.id,i))}
 }
 return d
}
export function sanitize(p){
 if(!p||p.version!==1||!Array.isArray(p.tracks)||!Array.isArray(p.patterns)||!Array.isArray(p.clips))throw new Error('Arquivo .onda inválido ou incompatível.')
 const out=blank(tidy(p.name,'Projeto sem título'))
 out.bpm=Math.round(num(p.bpm,40,250,110));out.bars=Math.round(num(p.bars,1,MAX_BARS,8));out.swing=num(p.swing,0,.65,0);out.master=num(p.master,0,1.5,.82);out.masterFx=fxClean(p.masterFx);out.loop=p.loop!==false
 out.loopStart=Math.round(num(p.loopStart,0,out.bars-1,0));out.loopEnd=Math.round(num(p.loopEnd,out.loopStart+1,out.bars,Math.min(out.bars,4)))
 const tids=new Map,pids=new Map
 out.tracks=p.tracks.slice(0,MAX_TRACKS).filter(v=>v&&Object.hasOwn(PRESETS,v.preset)).map((v,i)=>{
  const t=track(v.preset,i,tidy(v.name,PRESETS[v.preset][0])); if(typeof v.id==='string'&&!tids.has(v.id))tids.set(v.id,t.id)
  t.color=Math.round(num(v.color,0,COLORS.length-1,i%COLORS.length));t.vol=num(v.vol,0,1.5,t.vol);t.pan=num(v.pan,-1,1,0);t.mute=v.mute===true;t.solo=v.solo===true;t.low=num(v.low,140,20000,20000);t.res=num(v.res,0,12,.4);t.delay=num(v.delay,0,.55,0);t.verb=num(v.verb,0,.55,0);t.drive=num(v.drive,0,1,0)
  t.fx=fxClean(v.fx)
  t.sample=typeof v.sample==='string'&&v.sample.length<34*1024*1024&&/^data:audio\/[\w.+-]{1,64};base64,[A-Za-z0-9+/=]+$/.test(v.sample)?v.sample:null
  t.sampleIn=num(v.sampleIn,0,.99,0);t.sampleOut=num(v.sampleOut,t.sampleIn+.005,1,1);t.fadeIn=num(v.fadeIn,0,10,.005);t.fadeOut=num(v.fadeOut,0,10,.012)
  t.auto=Array.isArray(v.auto)?v.auto.slice(0,128).filter(a=>a&&typeof a.bar==='number').map(a=>({bar:Math.round(num(a.bar,0,out.bars-1,0)),v:num(a.v,0,1,1)})).sort((a,b)=>a.bar-b.bar):[]
  return t
 })
 if(!out.tracks.length)return blank(out.name)
 out.patterns=p.patterns.slice(0,MAX_PATTERNS).filter(q=>q&&tids.has(q.track)).map((q,i)=>{
  let a=pat(tids.get(q.track),i+1,Math.round(num(q.bars,1,out.tracks.find(t=>t.id===tids.get(q.track))?.preset==='sample'?MAX_BARS:16,1))); if(typeof q.id==='string'&&!pids.has(q.id))pids.set(q.id,a)
  a.name=tidy(q.name,a.name);a.notes=Array.isArray(q.notes)?q.notes.slice(0,4096).filter(n=>n&&typeof n==='object').map(n=>note(Math.round(num(n.at,0,a.bars*BAR-1,0)),Math.round(num(n.m,0,127,60)),Math.round(num(n.len,1,a.bars*BAR,STEP)),num(n.v,.05,1,.8))):[]
  return a
 })
 out.clips=p.clips.slice(0,MAX_BARS*MAX_TRACKS).filter(c=>c&&pids.has(c.pattern)).map(c=>clip(pids.get(c.pattern).id,Math.round(num(c.bar,0,out.bars-1,0))))
 return out
}
export function contents(d,mode='song',patternId=''){
 const pats=new Map(d.patterns.map(p=>[p.id,p])), tracks=new Map(d.tracks.map(t=>[t.id,t]))
 const p=pats.get(patternId)
 const bars=mode==='pattern'?(p?.bars||1):Math.max(1,...d.clips.map(c=>Math.min(d.bars,c.bar+(pats.get(c.pattern)?.bars||0))))
 const clips=mode==='pattern'?(p?[{pattern:p.id,bar:0}]:[]):d.clips
 const out=[]
 for(const c of clips){
  const a=pats.get(c.pattern),t=tracks.get(a?.track)
  if(!a||!t)continue
  for(const n of a.notes){
   const at=c.bar*BAR+n.at+(Math.floor(n.at/STEP)%2?d.swing*STEP*.5:0)
   if(at>=bars*BAR||n.at>=a.bars*BAR)continue
   out.push({t,at,m:n.m,len:Math.min(n.len,(c.bar+a.bars)*BAR-at),v:n.v})
  }
 }
 return {bars,events:out.sort((x,y)=>x.at-y.at)}
}
export const noteName=m=>['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][m%12]+(Math.floor(m/12)-1)
export function arrange(d,p,bar){
 if(!p||bar<0||bar+p.bars>d.bars)return false
 const map=new Map(d.patterns.map(x=>[x.id,x]))
 if(d.clips.some(c=>map.get(c.pattern)?.track===p.track&&c.bar<bar+p.bars&&bar<c.bar+map.get(c.pattern).bars))return false
 d.clips.push(clip(p.id,bar))
 return true
}
