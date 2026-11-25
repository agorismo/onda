import {FX_TYPES,DELAY_GRID,fxClamp} from './fx-catalog.mjs'
import {initWorklets} from './processor.mjs'
export const fxAmp=db=>10**(db/20)
const fxRooms=new WeakMap()
function fxRoom(ctx,time){
 if(!fxRooms.has(ctx))fxRooms.set(ctx,new Map())
 const map=fxRooms.get(ctx),key=Math.round(time*10)
 if(map.has(key))return map.get(key)
 if(map.size>13)map.delete(map.keys().next().value)
 const rate=ctx.sampleRate,b=ctx.createBuffer(2,Math.ceil(time*rate),rate)
 for(let c=0;c<2;c++){
  let seed=c?54831:17217,prev=0
  const a=b.getChannelData(c)
  for(let i=0;i<a.length;i++){
   seed=(Math.imul(seed,1664525)+1013904223)|0
   prev=.20*prev+.8*seed/2147483648
   a[i]=prev*(1-i/a.length)**3*.51
  }
  for(const [ms,v] of [[14,.42],[22,.31],[36,.24],[47,.19],[73,.11]]){
   const i=Math.floor((ms+c*2)*rate/1000)
   if(i<a.length)a[i]+=v
  }
 }
 map.set(key,b);return b
}
export async function fxPrime(ctx,d){
 const slots=[...(d.masterFx||[]),...d.tracks.flatMap(t=>t.fx||[])]
 if(slots.some(s=>!s.bypass&&FX_TYPES[s.type]?.worklet))await initWorklets(ctx)
}
export function connectEffects(ctx,upstream,slots,bpm){
 let output=upstream
 const nodes=[],oscs=[]
 const own=node=>{nodes.push(node);return node}
 const g=x=>{const n=own(ctx.createGain());n.gain.value=x;return n}
 const filter=(type,f,v=0,q=.7)=>{
  const n=own(ctx.createBiquadFilter());n.type=type;n.frequency.value=Math.min(f,ctx.sampleRate*.48);n.gain.value=v;n.Q.value=q;return n
 }
 const blend=(input,wet,mix)=>{
  const o=g(1),a=g(Math.cos(mix/100*Math.PI/2)),b=g(Math.sin(mix/100*Math.PI/2))
  input.connect(a).connect(o);wet.connect(b).connect(o);return o
 }
 const lfo=(rate,depth,dests)=>{
  const o=own(ctx.createOscillator());o.frequency.value=rate
  for(const [d,v] of dests)o.connect(g(v*depth)).connect(d)
  oscs.push(o);o.start()
 }
 for(const s of slots||[]){
  if(!s||s.bypass||!Object.hasOwn(FX_TYPES,s.type))continue
  const p=s.params, before=output
  switch(s.type){
   case 'eq':{
    const path=[filter('highpass',p.hp),filter('lowshelf',125,p.lo),filter('peaking',p.lmHz,p.lm,p.lmQ),filter('peaking',p.hiHz,p.hi,p.hiQ),filter('highshelf',8500,p.air),g(fxAmp(p.out))]
    for(const n of path){output.connect(n);output=n}
    break
   }
   case 'comp':{
    const n=own(ctx.createDynamicsCompressor())
    n.threshold.value=p.th;n.ratio.value=p.ratio;n.attack.value=p.atk/1000;n.release.value=p.rel/1000;n.knee.value=p.knee
    const m=g(fxAmp(p.make));before.connect(n).connect(m);output=blend(before,m,p.mix);break
   }
   case 'pitch':case 'gate':case 'deesser':case 'limit':{
    const n=own(new AudioWorkletNode(ctx,s.type==='pitch'?'onda-pitch':'onda-shape',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{kind:s.type,params:p}}))
    before.connect(n);output=n;break
   }
   case 'sat':{
    const curve=new Float32Array(2049),drive=fxAmp(p.amount)
    for(let i=0;i<curve.length;i++)curve[i]=Math.tanh((i/(curve.length-1)*2-1)*drive)/Math.tanh(drive)
    const n=own(ctx.createWaveShaper());n.curve=curve;n.oversample='4x'
    const f=filter('lowpass',p.tone),vol=g(fxAmp(p.out));before.connect(n).connect(f)
    blend(before,f,p.mix).connect(vol);output=vol;break
   }
   case 'chorus':{
    const l=own(ctx.createDelay(.12)),r=own(ctx.createDelay(.12)),join=own(ctx.createChannelMerger(2)),sp=own(ctx.createChannelSplitter(2))
    // Normalize mono before splitting so it feeds both delayed sides.
    sp.channelInterpretation='discrete'
    const stereo=g(1);stereo.channelCount=2;stereo.channelCountMode='explicit'
    before.connect(stereo).connect(sp)
    l.delayTime.value=r.delayTime.value=p.delay/1000
    sp.connect(l,0).connect(join,0,0);sp.connect(r,1).connect(join,0,1)
    lfo(p.rate,p.depth/1000,[[l.delayTime,1],[r.delayTime,-1]])
    output=blend(before,join,p.mix);break
   }
   case 'delay':{
    const n=own(ctx.createDelay(4)),f=filter('lowpass',p.tone),fb=g(p.fb/100)
    n.delayTime.value=60/bpm*DELAY_GRID[p.division-1]
    before.connect(n).connect(f);f.connect(fb).connect(n);output=blend(before,f,p.mix);break
   }
   case 'verb':{
    const n=own(ctx.createDelay(.2)),v=own(ctx.createConvolver()),f=filter('lowpass',p.tone)
    n.delayTime.value=p.pre/1000;v.buffer=fxRoom(ctx,p.size)
    before.connect(n).connect(v).connect(f);output=blend(before,f,p.mix);break
   }
   case 'width':{
    const stereo=g(1);stereo.channelCount=2;stereo.channelCountMode='explicit'
    const sp=own(ctx.createChannelSplitter(2)),join=own(ctx.createChannelMerger(2))
    before.connect(stereo).connect(sp)
    const w=p.amt/100,a=(1+w)/2,b=(1-w)/2
    sp.connect(g(a),0).connect(join,0,0);sp.connect(g(b),1).connect(join,0,0)
    sp.connect(g(b),0).connect(join,0,1);sp.connect(g(a),1).connect(join,0,1)
    const vol=g(fxAmp(p.out));join.connect(vol);output=vol;break
   }
   case 'trem':{
    const n=g(1-p.depth/200);before.connect(n)
    lfo(p.rate,p.depth/200,[[n.gain,1]]);output=blend(before,n,p.mix);break
   }
  }
 }
 return {output,nodes,dispose(){
  for(const o of oscs)try{o.stop()}catch{}
  for(const n of nodes)try{n.disconnect();if(n.port)n.port.close()}catch{}
 }}
}
export function fxTail(d){
 let max=2.8
 for(const t of [...d.tracks,{fx:d.masterFx}]){
  let tail=0
  for(const s of t.fx||[]){
   if(s.bypass)continue
   if(s.type==='verb')tail+=s.params.size+s.params.pre/1000
   if(s.type==='delay')tail+=60/d.bpm*DELAY_GRID[s.params.division-1]*Math.max(1,Math.log(.01)/Math.log(Math.max(.01,s.params.fb/100)))
  }
  max=Math.max(max,tail+.45)
 }
 return fxClamp(max,2.8,12)
}
