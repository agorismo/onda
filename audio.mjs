import {connectEffects,fxPrime,fxTail} from './fx-engine.mjs'
import {BAR,PPQ,PRESETS,contents,clamp} from './project.mjs'
const mix=(a,b,t)=>a+(b-a)*t
const cache=new WeakMap()
const mk=(ctx,key,fn)=>{
 if(!cache.has(ctx))cache.set(ctx,new Map)
 const m=cache.get(ctx)
 if(!m.has(key))m.set(key,fn())
 return m.get(key)
}
function noise(ctx,size,fade=0){
 return mk(ctx,'noise'+size+':'+fade,()=>{
  const b=ctx.createBuffer(1,Math.ceil(size*ctx.sampleRate),ctx.sampleRate),ar=b.getChannelData(0)
  let seed=126751
  for(let i=0;i<ar.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;ar[i]=(seed/2147483648)*(fade?Math.pow(1-i/ar.length,fade):1)}
  return b
 })
}
function impulse(ctx){
 return mk(ctx,'ir',()=>{
  const b=ctx.createBuffer(2,Math.ceil(1.8*ctx.sampleRate),ctx.sampleRate)
  for(let j=0;j<2;j++){
   let seed=8493+j*437
   const arr=b.getChannelData(j)
   for(let i=0;i<arr.length;i++){seed=(Math.imul(seed,1103515245)+12345)|0;arr[i]=(seed/2147483648)*Math.pow(1-i/arr.length,3)*.44}
  }
  return b
 })
}
export function autoGain(t,bar){
 if(!t.auto?.length)return 1
 let from={bar:0,v:1}
 for(const a of t.auto){
  if(a.bar<=bar)from=a
  else return mix(from.v,a.v,(bar-from.bar)/Math.max(1,a.bar-from.bar))
 }
 return from.v
}
export async function availableSamples(ctx,tracks,onError){
 const found=new Map()
 await Promise.all(tracks.filter(t=>t.sample).map(async t=>{
  try{
   const b=await mk(ctx,'sample:'+t.id+t.sample,()=>fetch(t.sample).then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b)))
   found.set(t.id,b)
  }catch(e){onError?.(t)}
 }))
 return found
}
export function graph(ctx,d,to=ctx.destination){
 const input=ctx.createGain(),main=ctx.createGain(),lim=ctx.createDynamicsCompressor(),amp=ctx.createAnalyser()
 input.connect(lim).connect(main);main.gain.value=d.master
 const master=connectEffects(ctx,main,d.masterFx,d.bpm)
 master.output.connect(amp).connect(to)
 const fxChains=[master]
 amp.fftSize=512; amp.smoothingTimeConstant=.76
 lim.threshold.value=-4;lim.knee.value=7;lim.ratio.value=14;lim.attack.value=.003;lim.release.value=.07
 const channels=new Map
 const any=d.tracks.some(t=>t.solo)
 for(const t of d.tracks){
  const entry=ctx.createGain(),tone=ctx.createBiquadFilter(),gain=ctx.createGain(),movement=ctx.createGain(),pan=ctx.createStereoPanner(),meter=ctx.createAnalyser()
  tone.type='lowpass';tone.frequency.value=t.low;tone.Q.value=t.res
  entry.connect(tone)
  let path=tone
  if(t.drive>.005){
   const sh=ctx.createWaveShaper(),d=1+t.drive*11,a=new Float32Array(1024)
   for(let i=0;i<a.length;i++)a[i]=Math.tanh((i/(a.length-1)*2-1)*d)/Math.tanh(d)
   sh.curve=a;sh.oversample='2x';tone.connect(sh);path=sh
  }
  const chain=connectEffects(ctx,path,t.fx,d.bpm)
  chain.output.connect(gain);fxChains.push(chain)
  gain.gain.value=t.mute||(any&&!t.solo)?0:t.vol
  pan.pan.value=t.pan;gain.connect(movement).connect(pan).connect(meter).connect(input);meter.fftSize=128
  if(t.delay>.005){
   const del=ctx.createDelay(2),fb=ctx.createGain(),wet=ctx.createGain()
   del.delayTime.value=60/d.bpm*.75;fb.gain.value=.33;wet.gain.value=t.delay
   pan.connect(del).connect(wet).connect(input);del.connect(fb).connect(del)
  }
  if(t.verb>.005){
   const rev=ctx.createConvolver(),wet=ctx.createGain()
   rev.buffer=impulse(ctx);wet.gain.value=t.verb
   pan.connect(rev).connect(wet).connect(input)
  }
  channels.set(t.id,{entry,tone,gain,movement,pan,meter,t,audible:!t.mute&&(!any||t.solo)})
 }
 return {input,main,amp,channels,dispose:()=>{amp.disconnect();input.disconnect();for(const chain of fxChains)chain.dispose()}}
}
function ramps(g,from,to,zero,sec){
 for(const ch of g.channels.values()){
  if(!ch.t.auto?.length)continue
  const a=ch.movement.gain
  const t=Math.max(0,zero+from*sec)
  a.setValueAtTime(autoGain(ch.t,from/BAR),t)
  for(const point of ch.t.auto){
   const x=point.bar*BAR
   if(x>from&&x<to)a.linearRampToValueAtTime(point.v,zero+x*sec)
  }
  a.linearRampToValueAtTime(autoGain(ch.t,to/BAR),Math.max(t+.0001,zero+to*sec-.0002))
 }
}
function env(ctx,out,at,length,vol,attack=.008,release=.08){
 const g=ctx.createGain(),stop=at+Math.max(attack+.005,length)+release
 g.connect(out);g.gain.setValueAtTime(.00001,at);g.gain.exponentialRampToValueAtTime(Math.max(.00002,vol),at+attack)
 g.gain.setTargetAtTime(.00001,stop-release,Math.max(.003,release*.23));g.gain.setValueAtTime(.00001,stop)
 return [g,stop]
}
function osc(ctx,out,at,stop,f,type,detune=0,end=null){
 const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(f,at);o.detune.value=detune
 if(end)o.frequency.exponentialRampToValueAtTime(end,Math.min(at+.14,stop-.001))
 o.connect(out);o.start(at);o.stop(stop);o.onended=()=>o.disconnect()
}
function drum(ctx,t,out,at,vel){
 if(t==='kick'){
  const [g,stop]=env(ctx,out,at,.045,vel*.93,.003,.26)
  osc(ctx,g,at,stop,143,'sine',0,45)
  return
 }
 const kind={snare:[.075,.07,.56,1250],hat:[.009,.04,.26,7300],clap:[.042,.10,.52,1200],perc:[.027,.054,.48,2510]}[t]
 const [len,rel,amp,f]=kind
 const [g,stop]=env(ctx,out,at,len,vel*amp,.0024,rel)
 const filt=ctx.createBiquadFilter();filt.type=t==='clap'?'bandpass':'highpass';filt.frequency.value=f;filt.Q.value=.7
 const source=ctx.createBufferSource();source.buffer=noise(ctx,.36,.9);source.connect(filt).connect(g);source.start(at);source.stop(stop);source.onended=()=>{source.disconnect();filt.disconnect();g.disconnect()}
 if(t==='snare'||t==='perc'){
  const [o,tail]=env(ctx,out,at,.016,vel*.29,.003,.09)
  osc(ctx,o,at,tail,t==='perc'?340:206,'triangle',0,t==='perc'?185:112)
 }
 if(t==='clap'){
  for(let j=1;j<=2;j++){
   const s=ctx.createBufferSource(),ev=env(ctx,out,at+j*.013,.008,vel*.17,.002,.045)
   s.buffer=noise(ctx,.13,2);s.connect(ev[0]);s.start(at+j*.013);s.stop(ev[1]);s.onended=()=>s.disconnect()
  }
 }
}
export function hit(ctx,out,t,m,at,len,v,sample,offset=0){
 if(t.preset==='sample'){
  if(!sample)return
  const s=ctx.createBufferSource(),g=ctx.createGain(),speed=2**((m-60)/12)
  s.buffer=sample;s.playbackRate.value=speed
  const start=(t.sampleIn??0)*sample.duration+offset*speed,end=(t.sampleOut??1)*sample.duration
  if(start>=end)return
  const stop=Math.max(.001,Math.min(Math.max(len,.001),(end-start)/speed))
  const up=clamp((t.fadeIn??.005)-offset,0,stop*.49),down=clamp(t.fadeOut??.012,0,stop*.49)
  g.gain.setValueAtTime(up>0?0:v*.89,at)
  if(up>0)g.gain.linearRampToValueAtTime(v*.89,at+up)
  if(down>0){g.gain.setValueAtTime(v*.89,at+stop-down);g.gain.linearRampToValueAtTime(0,at+stop)}
  s.connect(g).connect(out);s.start(at,start);s.stop(at+stop);s.onended=()=>{s.disconnect();g.disconnect()}
  return
 }
 if(PRESETS[t.preset]?.[1]==='drum')return drum(ctx,t.preset,out,at,v)
 const f=440*2**((m-69)/12),dd=t.preset
 const set={sub:['sine',null,.53,.012,.15,1300],bass:['sawtooth','triangle',.33,.008,.09,550],keys:['sine','triangle',.44,.010,.21,3800],lead:['sawtooth','square',.28,.015,.13,4800],pad:['triangle','sine',.24,.132,.44,2400],pluck:['triangle','sine',.48,.003,.17,6000]}[dd]||['triangle',null,.32,.01,.1,6000]
 const [wave,w2,gain,att,rel,cut]=set, fNode=ctx.createBiquadFilter()
 const [g,stop]=env(ctx,out,at,Math.max(.045,dd==='pluck'?Math.min(.11,len):len),v*gain,att,rel)
 fNode.type='lowpass';fNode.frequency.setValueAtTime(cut,at);if(dd==='bass'||dd==='pluck')fNode.frequency.exponentialRampToValueAtTime(cut*.38,at+.08)
 fNode.connect(g)
 if(dd==='keys'||dd==='pluck')g.gain.setTargetAtTime(v*gain*.36,at+att,.14)
 osc(ctx,fNode,at,stop,f,wave,0)
 if(w2){const x=ctx.createGain();x.gain.value=.41;x.connect(fNode);osc(ctx,x,at,stop,dd==='keys'?f*2:f,w2,dd==='pad'?9:dd==='lead'?-8:0)}
}
export async function render(d,{mode='song',pattern='',stems=null,sampleRate=44100,onStatus=()=>{}}={}){
 const {bars,events}=contents(d,mode,pattern),sec=60/(d.bpm*PPQ),end=bars*BAR*sec
 if(end>385)throw new Error('Exportação limitada a 6m25s por arquivo para preservar a memória do navegador.')
 const rate=sampleRate===48000?48000:44100
 const ctx=new OfflineAudioContext(2,Math.ceil((end+fxTail(d))*rate),rate)
 await fxPrime(ctx,d)
 const g=graph(ctx,d),pool=await availableSamples(ctx,d.tracks,t=>onStatus('Não consegui decodificar: '+t.name))
 if(mode==='song')ramps(g,0,bars*BAR,0,sec)
 for(const {t,at,len,v,m} of events){
  const ch=g.channels.get(t.id)
  if(!ch?.audible||(stems&&t.id!==stems))continue
  hit(ctx,ch.entry,t,m,at*sec,Math.min(len*sec,end-at*sec),v,pool.get(t.id))
 }
 return ctx.startRendering()
}
export function wav(buf,bitDepth=16){
 const depth=bitDepth===24?24:16,word=depth/8,samples=buf.length,n=buf.numberOfChannels,block=n*word
 const size=samples*block,out=new ArrayBuffer(44+size+(size%2)),v=new DataView(out)
 const str=(at,t)=>{for(let i=0;i<t.length;i++)v.setUint8(at+i,t.charCodeAt(i))}
 str(0,'RIFF');v.setUint32(4,out.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,n,true);v.setUint32(24,buf.sampleRate,true);v.setUint32(28,buf.sampleRate*block,true);v.setUint16(32,block,true);v.setUint16(34,depth,true);str(36,'data');v.setUint32(40,samples*block,true)
 const ch=Array.from({length:n},(_,i)=>buf.getChannelData(i))
 for(let i=0;i<samples;i++)for(let c=0;c<n;c++){
  const f=clamp(ch[c][i],-1,1),j=44+i*block+c*word
  if(depth===16)v.setInt16(j,Math.round(f*(f<0?32768:32767)),true)
  else{
   const x=Math.round(f*(f<0?8388608:8388607))
   v.setUint8(j,x&255);v.setUint8(j+1,(x>>8)&255);v.setUint8(j+2,(x>>16)&255)
  }
 }
 return new Blob([out],{type:'audio/wav'})
}
export class Player{
 constructor(onFrame,onEnd){this.onFrame=onFrame;this.onEnd=onEnd;this.playing=false;this.serial=0;this.ctx=null}
 async ensure(){
  if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Web Audio não disponível neste navegador.');this.ctx=new C({latencyHint:'interactive'})}
  await this.ctx.resume();return this.ctx
 }
 async start(d,mode,pattern,tick,options={}){
  this.stop()
  const serial=this.serial,ctx=await this.ensure()
  const [samples]=await Promise.all([availableSamples(ctx,d.tracks),fxPrime(ctx,d)])
  if(serial!==this.serial)return
  this.d=d;this.mode=mode;this.g=graph(ctx,d);this.samples=samples
  const {bars,events}=contents(d,mode,pattern);this.events=events
  this.sec=60/(d.bpm*PPQ)
  this.loop=d.loop
  this.ls=this.loop&&mode==='song'?d.loopStart*BAR:0
  this.le=this.loop&&mode==='song'?Math.min(d.loopEnd,d.bars)*BAR:bars*BAR
  if(options.backing&&!this.loop)this.le=Math.max(this.le,(d.bars+1)*BAR)
  if(this.le<=this.ls)this.le=bars*BAR
  const begin=clamp(tick,this.loop?this.ls:0,this.le-1)
  const startTime=Math.max(ctx.currentTime+(options.backing?.17:.055),options.startAt||0)
  this.zero=startTime-begin*this.sec;this.visualZero=this.zero;this.cycle=0;this.tail=fxTail(d)
  if(mode==='song')ramps(this.g,begin,this.le,this.zero,this.sec)
  this.pointer=this.locate(begin)
  for(let i=0;i<this.pointer;i++){
   const e=this.events[i],ch=this.g.channels.get(e.t.id),offset=begin-e.at
   if(!ch?.audible||offset<0||e.len<=offset||PRESETS[e.t.preset]?.[1]==='drum')continue
   const left=Math.min(e.len-offset,this.le-begin)
   hit(ctx,ch.entry,e.t,e.m,startTime,left*this.sec,e.v,this.samples.get(e.t.id),offset*this.sec)
  }
  this.playing=true
  this.schedule()
  this.job=setInterval(()=>this.schedule(),24)
  const draw=()=>{
   if(!this.playing)return
   const raw=(ctx.currentTime-this.visualZero)/this.sec
   const pos=this.loop&&raw>=this.le?this.ls+(raw-this.le)%(this.le-this.ls):raw
   this.onFrame(Math.max(0,pos),this.g)
   this.raf=requestAnimationFrame(draw)
  }
  draw()
  return {startTime,initialTick:begin}
 }
 locate(tick){const i=this.events.findIndex(e=>e.at>=tick-.01);return i<0?this.events.length:i}
 schedule(){
  if(!this.playing)return
  const now=this.ctx.currentTime,horizon=now+.13
  for(let safe=0;safe<8000;safe++){
   let e=this.events[this.pointer]
   if(!e||e.at>=this.le){
    if(!this.loop){
     if(now>this.zero+this.le*this.sec+this.tail){this.stop();this.onEnd()}
     break
    }
    if(this.zero+this.le*this.sec>horizon)break
    this.zero+=(this.le-this.ls)*this.sec
    if(this.mode==='song')ramps(this.g,this.ls,this.le,this.zero,this.sec)
    this.pointer=this.locate(this.ls);this.cycle++
    continue
   }
   const at=this.zero+e.at*this.sec
   if(at>horizon)break
   this.pointer++
   const ch=this.g.channels.get(e.t.id)
   if(!ch?.audible||at<now-.13)continue
   hit(this.ctx,ch.entry,e.t,e.m,Math.max(at,now+.002),Math.min(e.len,this.le-e.at)*this.sec,e.v,this.samples.get(e.t.id))
  }
 }
 stop(){this.serial++;this.playing=false;clearInterval(this.job);cancelAnimationFrame(this.raf);this.g?.dispose();this.g=null}
 async preview(t,m=60,dur=.22){
  const ctx=await this.ensure(),o=ctx.createGain(),pool=await availableSamples(ctx,[t])
  o.gain.value=Math.min(.6,t.vol);o.connect(ctx.destination)
  hit(ctx,o,t,m,ctx.currentTime+.012,dur,.7,pool.get(t.id))
  setTimeout(()=>o.disconnect(),Math.max(1100,(dur+1)*1000))
 }
}
