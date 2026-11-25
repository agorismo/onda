import {initWorklets} from './processor.mjs'
import {wav} from './audio.mjs'
export function pcmWav(chunks,frames,rate,channels,depth=24){
 const out=Array.from({length:channels},()=>new Float32Array(frames))
 for(const {data,offset} of chunks){
  for(let c=0;c<channels;c++){
   const b=data[c]||data[0]
   if(offset<frames&&offset>=0)out[c].set(b.subarray(0,frames-offset),offset)
  }
 }
 return wav({length:frames,numberOfChannels:channels,sampleRate:rate,getChannelData:i=>out[i]},depth)
}
export class Capture{
 static async request(ctx,opts){
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Microfone requer HTTPS ou localhost.')
  await initWorklets(ctx)
  const audio={echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:opts.channels,latency:{ideal:0}}
  if(opts.device)audio.deviceId={exact:opts.device}
  const stream=await navigator.mediaDevices.getUserMedia({audio})
  const from=ctx.createMediaStreamSource(stream)
  const rec=new Capture(ctx,from,opts)
  rec.stream=stream
  for(const t of stream.getAudioTracks())t.addEventListener('ended',()=>rec.stop(),{once:true})
  return rec
 }
 constructor(ctx,from,opts={}){
  this.ctx=ctx;this.from=from;this.channels=opts.channels===2?2:1;this.dead=false;this.stopSent=false;this.depth=opts.depth===16?16:24
  this.gain=ctx.createGain();this.gain.gain.value=10**((opts.inputGain||0)/20)
  this.meter=ctx.createAnalyser();this.meter.fftSize=512;this.meterData=new Float32Array(512)
  this.output=ctx.createGain();this.output.gain.value=opts.monitor?.22:0
  this.silence=ctx.createGain();this.silence.gain.value=0
  this.from.connect(this.gain).connect(this.meter).connect(this.output).connect(ctx.destination)
  this.silence.connect(ctx.destination)
 }
 arm(startTime,seconds){
  if(this.dead||this.node)throw Error('Tomada já armada.')
  const ctx=this.ctx,rate=ctx.sampleRate
  this.startFrame=Math.round(startTime*rate);this.endFrame=this.startFrame+Math.round(seconds*rate);this.startTime=startTime
  const node=new AudioWorkletNode(ctx,'onda-pcm',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:this.channels,channelCountMode:'explicit',processorOptions:{startFrame:this.startFrame,endFrame:this.endFrame,channels:this.channels}})
  this.node=node;this.chunks=[]
  this.delay=setTimeout(()=>{if(!this.dead){this.error?.(Error('O motor de gravação não respondeu.'));this.finish()}},seconds*1000+15000)
  const result=new Promise((resolve,reject)=>{
   this.error=reject
   node.port.onmessage=e=>{
    const m=e.data
    if(m.type==='pcm')this.chunks.push({data:m.data,offset:m.start-this.startFrame})
    if(m.type==='done'){
     const frames=m.last===null?0:Math.max(0,m.last-this.startFrame)
     const chunks=this.chunks;this.chunks=[]
     this.finish()
     if(frames<64){reject(Error('Nenhum trecho gravado.'));return}
     resolve({blob:pcmWav(chunks,frames,m.rate,this.channels,this.depth),seconds:frames/m.rate})
    }
   }
   node.onprocessorerror=()=>{this.finish();reject(Error('Erro no motor de gravação.'))}
  })
  this.gain.connect(node).connect(this.silence)
  return result
 }
 stop(){
  if(!this.node||this.dead||this.stopSent)return
  this.stopSent=true
  this.node.port.postMessage({cmd:'stop',endFrame:Math.round(this.ctx.currentTime*this.ctx.sampleRate)})
 }
 level(){
  this.meter.getFloatTimeDomainData(this.meterData)
  let max=0;for(const x of this.meterData)max=Math.max(max,Math.abs(x))
  return max
 }
 finish(){
  if(this.dead)return
  this.dead=true;clearTimeout(this.delay)
  if(this.node){this.node.port.close();this.node.disconnect()}
  for(const n of [this.from,this.gain,this.meter,this.output,this.silence])try{n.disconnect()}catch{}
  this.stream?.getTracks().forEach(t=>t.stop())
 }
}
export function clickIn(ctx,begin,bpm,beats){
 const sec=60/bpm
 const live=[]
 for(let i=0;i<beats;i++){
  const time=begin-(beats-i)*sec
  if(time<ctx.currentTime+.005)continue
  const o=ctx.createOscillator(),g=ctx.createGain()
  o.frequency.value=i%4===0?1250:820;o.type='sine';g.gain.setValueAtTime(.001,time);g.gain.linearRampToValueAtTime(.17,time+.002);g.gain.exponentialRampToValueAtTime(.001,time+.065)
  o.connect(g).connect(ctx.destination);o.start(time);o.stop(time+.067)
  o.onended=()=>{o.disconnect();g.disconnect()}
  live.push(o)
 }
 return ()=>{for(const o of live)try{o.stop()}catch{}}
}
