import {PPQ,BAR,PRESETS,contents,blank,track,pat,clip,note,clamp,MAX_TRACKS,MAX_BARS} from './project.mjs'
const drumPitch={kick:36,snare:38,hat:42,clap:39,perc:45},program={sub:38,bass:39,keys:4,lead:81,pad:89,pluck:11,sample:0}
const bytes=s=>Array.from(s,c=>c.charCodeAt(0))
const be=(x,n)=>Array.from({length:n},(_,i)=>(x>>>(8*(n-i-1)))&255)
const vl=x=>{let b=[x&127];while((x>>>=7))b.unshift((x&127)|128);return b}
export function midi(d,mode='song',p=''){
 const {events}=contents(d,mode,p)
 const tempo=Math.round(60000000/d.bpm)
 const stream=[[0,[255,81,3,...be(tempo,3)]]]
 const chs=new Map
 for(const t of d.tracks){
  if(PRESETS[t.preset][1]==='drum'){chs.set(t.id,9);continue}
  let ch=chs.size%15;if(ch>=9)ch++
  chs.set(t.id,ch);stream.push([0,[192|ch,program[t.preset]||0]])
 }
 for(const {t,at,len,m,v} of events){
  if(t.mute||(d.tracks.some(t=>t.solo)&&!t.solo))continue
  const ch=chs.get(t.id),pitch=drumPitch[t.preset]??m
  stream.push([Math.round(at),[144|ch,pitch,Math.round(clamp(v,.05,1)*127)]],[Math.max(Math.round(at)+1,Math.round(at+len)),[128|ch,pitch,0]])
 }
 stream.sort((a,b)=>a[0]-b[0]||(a[1][0]&240)-(b[1][0]&240))
 let pos=0;const out=[]
 for(const [at,b] of stream){out.push(...vl(at-pos),...b);pos=at}
 out.push(0,255,47,0)
 return new Blob([new Uint8Array([...bytes('MThd'),0,0,0,6,0,0,0,1,...be(PPQ,2),...bytes('MTrk'),...be(out.length,4)]),new Uint8Array(out)],{type:'audio/midi'})
}
export function importMidi(buffer,name){
 const a=new DataView(buffer), length=a.byteLength
 if(length<22||a.getUint32(0)!==0x4d546864)throw Error('Arquivo MIDI inválido.')
 const head=a.getUint32(4),fmt=a.getUint16(8),count=a.getUint16(10),div=a.getUint16(12)
 if(head<6||head>length-8||fmt>1||!div||div&0x8000||count>64)throw Error('MIDI aceito: SMF tipo 0 ou 1 com divisão PPQ.')
 let pos=8+head,bpm=110,firstTempo=Infinity,last=0
 const groups=new Map
 for(let ti=0;ti<count&&pos+8<=length;ti++){
  if(a.getUint32(pos)!==0x4d54726b)throw Error('Faixa MIDI inválida.')
  const trkEnd=pos+8+a.getUint32(pos+4);pos+=8
  if(trkEnd>length)throw Error('MIDI truncado.')
  let time=0,run=0
  const read=()=>{if(pos>=trkEnd)throw Error('MIDI truncado.');return a.getUint8(pos++)}
  const variable=()=>{let b=0;for(let i=0;i<4;i++){const x=read();b=b*128+(x&127);if(!(x&128))return b}throw Error('Valor MIDI inválido.')}
  const pending=new Map
  while(pos<trkEnd){
   time+=variable()
   let e=read()
   if(e<128){if(!run)throw Error('Evento MIDI inválido.');pos--;e=run}
   else if(e<240)run=e
   if(e===255){
    const type=read(),sz=variable(); if(pos+sz>trkEnd)throw Error('MIDI truncado.')
    if(type===81&&sz===3&&time<firstTempo){const us=a.getUint8(pos)*65536+a.getUint8(pos+1)*256+a.getUint8(pos+2);if(us)bpm=clamp(Math.round(60000000/us),40,250);firstTempo=time}
    pos+=sz;continue
   }
   if(e===240||e===247){const len=variable();if(pos+len>trkEnd)throw Error('MIDI truncado.');pos+=len;continue}
   if(e>=240)throw Error('Evento MIDI não suportado.')
   const k=e&240,ch=e&15,m=read()
   if(k===192||k===208)continue
   const v=read()
   if(m>=128||v>=128)throw Error('Evento MIDI inválido.')
   if(k!==144&&k!==128)continue
   const key=ch+':'+m
   if(k===144&&v>0){pending.set(key,[time,v]);continue}
   if(!pending.has(key))continue
   const [start,vel]=pending.get(key);pending.delete(key)
   const preset=ch===9?(m<38?'kick':m===38||m===40?'snare':m===39?'clap':m>=42&&m<=46?'hat':'perc'):'keys'
   const gkey=ti+':'+ch+':'+preset
   if(!groups.has(gkey)&&groups.size<MAX_TRACKS)groups.set(gkey,{ch,preset,ns:[]})
   if(!groups.has(gkey))continue
   const at=Math.round(start*PPQ/div),dur=Math.max(1,Math.round((time-start)*PPQ/div))
   if(at>=MAX_BARS*BAR)continue
   last=Math.max(last,at+dur)
   const g=groups.get(gkey)
   if(g.ns.length<4096)g.ns.push(note(at,m,dur,vel/127))
  }
  pos=trkEnd
 }
 if(!groups.size)throw Error('Não encontrei notas MIDI.')
 const d=blank(name||'Importação MIDI')
 d.bpm=bpm;d.bars=clamp(Math.max(4,Math.ceil(last/BAR)),4,MAX_BARS);d.loopEnd=d.bars
 d.tracks=[];d.patterns=[];d.clips=[]
 for(const {ch,preset,ns} of groups.values()){
  const t=track(preset,d.tracks.length,ch===9?undefined:'Canal MIDI '+(ch+1))
  d.tracks.push(t)
  for(let bar=0;bar<d.bars&&d.patterns.length<100;bar+=16){
   const block=ns.filter(n=>Math.floor(n.at/BAR)>=bar&&Math.floor(n.at/BAR)<bar+16)
   if(!block.length)continue
   const p=pat(t.id,d.patterns.length+1,Math.min(16,d.bars-bar))
   p.notes=block.map(n=>({...n,at:n.at-bar*BAR}));d.patterns.push(p);d.clips.push(clip(p.id,bar))
  }
 }
 return d
}
