import {FX_TYPES,fxSlot,fxPreset} from '../fx-catalog.mjs'
import {connectEffects,fxPrime} from '../fx-engine.mjs'
import {initWorklets} from '../processor.mjs'
import {Capture} from '../recorder.mjs'
import {render,wav} from '../audio.mjs'
import {demo} from '../project.mjs'
const out=document.querySelector('#result')
function say(s){out.textContent+=s+'\n'}
function check(condition,label){if(!condition)throw Error(label);say('PASSOU · '+label)}
function stats(data,start=0,end=data.length){
 let high=0,r=0
 for(let i=start;i<end;i++){high=Math.max(high,Math.abs(data[i]));r+=data[i]**2}
 return {peak:high,rms:Math.sqrt(r/Math.max(1,end-start))}
}
async function runChain(slots,{freq=280,amp=.6,period=.86}={}){
 const rate=24000,ctx=new OfflineAudioContext(2,rate*2,rate)
 await fxPrime(ctx,{tracks:[],masterFx:slots})
 const src=ctx.createOscillator(),g=ctx.createGain();g.gain.value=amp
 src.frequency.value=freq;src.connect(g)
 const p=connectEffects(ctx,g,slots,110);p.output.connect(ctx.destination)
 src.start(0);src.stop(period)
 return (await ctx.startRendering()).getChannelData(0)
}
const different=(a,b)=>{let x=0;for(let i=0;i<a.length;i++)x+=(a[i]-b[i])**2;return Math.sqrt(x/a.length)}
function dominant(a,from=11000,to=20000){
 let best=-1,power=0
 for(let f=213;f<=234;f+=.1){
  let x=0,y=0,w=2*Math.PI*f/24000
  for(let i=from;i<to;i+=2){const a0=a[i]*(.5-.5*Math.cos(2*Math.PI*(i-from)/(to-from)));x+=a0*Math.cos(w*i);y+=a0*Math.sin(w*i)}
  const v=x*x+y*y;if(v>power){power=v;best=f}
 }
 return best
}
async function verify(){
 out.textContent=''
 const clock=new AudioContext()
 await clock.resume()
 try{
  await initWorklets(clock)
  const raw=await runChain([])
  for(const [key,info] of Object.entries(FX_TYPES)){
   const params={eq:{hp:490},gate:{th:-5,floor:-55},deesser:{freq:2500,th:-55,range:12},limit:{ceiling:-7,drive:8},pitch:{str:100,speed:30},width:{out:-2},delay:{division:4,fb:48,mix:48}}[key]||{}
   const freq=key==='deesser'?7500:key==='pitch'?226.2:280
   const reference=freq===280?raw:await runChain([],{freq})
   const result=await runChain([fxSlot(key,params)],{freq})
   const energy=stats(result),delta=different(result,reference)
   check(Number.isFinite(energy.rms)&&energy.peak>.001&&delta>.001,info.name+' processou o sinal ('+delta.toFixed(3)+')')
   if(key==='limit')check(energy.peak<.454,'limiter respeitou teto digital de -7 dBFS')
   if(key==='pitch'){const f=dominant(result);check(Math.abs(f-220)<Math.abs(226.2-220),'afinação aproximou o tom de Lá: '+f.toFixed(1)+' Hz')}
  }
  const bypass=await runChain([fxSlot('eq',{hp:490},true)])
  check(different(raw,bypass)<1e-6,'bypass preservou o áudio')
  const d=demo();d.masterFx=fxPreset('master');d.tracks[4].fx=fxPreset('voice')
  const buf=await render(d)
  const header=new DataView(await wav(buf).arrayBuffer())
  check(header.getUint32(24,true)===44100&&header.getUint16(22,true)===2&&stats(buf.getChannelData(0)).rms>.001,'WAV estéreo real com plugins da faixa e do master')
  const src=clock.createOscillator();src.frequency.value=440
  const rec=new Capture(clock,src,{channels:1,inputGain:-12})
  const at=clock.currentTime+.15
  const got=rec.arm(at,.48)
  src.start(at);src.stop(at+.53)
  const item=await got,r=await clock.decodeAudioData(await item.blob.arrayBuffer())
  check(r.numberOfChannels===1&&Math.abs(r.duration-.48)<.002&&stats(r.getChannelData(0)).rms>.05,'captura PCM mono delimitada no relógio de áudio (sinal sintético)')
  check(r.getChannelData(0).every(Number.isFinite),'captura PCM finita')
  say('RESULTADO: OK')
 }catch(e){say('FALHOU: '+e.message);console.error(e)}
 finally{await clock.close()}
}
document.querySelector('#run').onclick=verify
