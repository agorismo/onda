// Self-contained AudioWorklet source, used both live and in OfflineAudioContext.
function ondaProcessors(){
 const gainAt=d=>Math.pow(10,d/20)
 const factor=ms=>1-Math.exp(-1/(Math.max(.00005,ms/1000)*sampleRate))
 class ShapeProcessor extends AudioWorkletProcessor{
  constructor(options){
   super()
   this.kind=options.processorOptions.kind
   this.p=options.processorOptions.params
   this.env=0;this.gain=1;this.hold=0;this.open=false;this.lp=[]
   this.samples=Math.max(4,Math.round(sampleRate*.004));this.ring=[];this.index=0
   // Running maximum for lookahead window. Circular deque, amortized O(1).
   this.counter=0;this.front=0;this.back=0;this.queue=new Float32Array(this.samples+2);this.times=new Float64Array(this.samples+2)
  }
  process(inputs,outputs){
   const a=inputs[0],b=outputs[0],p=this.p
   if(!b.length)return true
   const n=b[0].length,R=this.kind
   const att=factor(p.atk??1),rel=factor(p.rel??65)
   const threshold=gainAt(p.th??-34),floor=gainAt(p.floor??-50),ceiling=gainAt(p.ceiling??-1)
   const maxRed=gainAt(-(p.range??9)),drive=gainAt(p.drive??0)
   const lpa=1-Math.exp(-Math.PI*2*Math.min(p.freq??6000,sampleRate*.45)/sampleRate)
   const hold=Math.round((p.hold??50)*sampleRate/1000)
   for(let c=0;c<b.length;c++){if(this.lp[c]===undefined)this.lp[c]=0;if(!this.ring[c]&&R==='limit')this.ring[c]=new Float32Array(this.samples)}
   const hi=new Float32Array(b.length),raw=new Float32Array(b.length)
   for(let i=0;i<n;i++){
    let peak=0
    for(let c=0;c<b.length;c++){
     const x=a[c]?.[i]??a[0]?.[i]??0;raw[c]=x
     if(R==='deesser'){this.lp[c]+=(x-this.lp[c])*lpa;hi[c]=x-this.lp[c];peak=Math.max(peak,Math.abs(hi[c]))}
     else peak=Math.max(peak,Math.abs(x)*(R==='limit'?drive:1))
    }
    if(R==='gate'){
     this.env+=(peak-this.env)*(peak>this.env?att:rel)
     if(this.env>=threshold){this.open=true;this.hold=hold}
     else if(this.hold>0)this.hold--
     else if(this.env<threshold*.78)this.open=false
     const target=this.open?1:floor
     this.gain+=(target-this.gain)*(target>this.gain?att:rel)
     for(let c=0;c<b.length;c++)b[c][i]=raw[c]*this.gain
    }else if(R==='deesser'){
     this.env+=(peak-this.env)*(peak>this.env?factor(.8):rel)
     const target=this.env>threshold?Math.max(maxRed,Math.pow(threshold/this.env,1-1/p.ratio)):1
     this.gain+=(target-this.gain)*(target<this.gain?factor(.45):rel)
     for(let c=0;c<b.length;c++)b[c][i]=this.lp[c]+hi[c]*this.gain
    }else{
     const q=this.queue,ts=this.times,len=q.length,k=this.counter++
     while(this.front!==this.back&&ts[this.front]<k-this.samples)this.front=(this.front+1)%len
     while(this.front!==this.back&&q[(this.back+len-1)%len]<=peak)this.back=(this.back+len-1)%len
     q[this.back]=peak;ts[this.back]=k;this.back=(this.back+1)%len
     const target=Math.min(1,ceiling/Math.max(q[this.front],1e-8))
     if(target<this.gain)this.gain=target
     else this.gain+=(target-this.gain)*rel
     for(let c=0;c<b.length;c++){
      const x=this.ring[c][this.index];this.ring[c][this.index]=raw[c]*drive;b[c][i]=x*this.gain
     }
     this.index=(this.index+1)%this.samples
    }
   }
   return true
  }
 }
 class PcmCapture extends AudioWorkletProcessor{
  constructor(options){
   super()
   const o=options.processorOptions||{}
   this.from=o.startFrame??0;this.to=o.endFrame??Infinity;this.n=o.channels===2?2:1
   this.buffer=Array.from({length:this.n},()=>new Float32Array(4096));this.at=0;this.blockStart=0;this.done=false;this.first=null;this.last=null
   this.port.onmessage=e=>{if(e.data?.cmd==='stop'){this.to=Math.min(this.to,e.data.endFrame??currentFrame);if(currentFrame>=this.to)this.finish()}}
  }
  flush(){
   if(!this.at)return
   const data=this.buffer.map(b=>b.slice(0,this.at))
   this.port.postMessage({type:'pcm',start:this.blockStart,data},data.map(x=>x.buffer))
   this.at=0
  }
  finish(){if(this.done)return;this.done=true;this.flush();this.port.postMessage({type:'done',first:this.first,last:this.last,rate:sampleRate})}
  process(inputs,outputs){
   if(this.done)return false
   const n=outputs[0][0].length,a=inputs[0]
   const from=Math.max(0,this.from-currentFrame),to=Math.min(n,this.to-currentFrame)
   for(let i=from;i<to;i++){
    if(this.first===null)this.first=currentFrame+i
    if(this.at===0)this.blockStart=currentFrame+i
    for(let c=0;c<this.n;c++)this.buffer[c][this.at]=a[c]?.[i]??a[0]?.[i]??0
    this.at++;this.last=currentFrame+i+1
    if(this.at===this.buffer[0].length)this.flush()
   }
   if(currentFrame+n>=this.to)this.finish()
   return !this.done
  }
 }
 class PitchAssist extends AudioWorkletProcessor {
  constructor(options){
   super()
   this.p=options.processorOptions.params
   this.dec=Math.max(1,Math.round(sampleRate/7800));this.dr=sampleRate/this.dec
   this.y=new Float32Array(512);this.yi=0;this.have=0;this.ds=0;this.sum=0
   this.period=512;this.since=0
   this.rings=[new Float32Array(8192),new Float32Array(8192)];this.w=0;this.phase=.25
   this.win=Math.round(sampleRate*.039);this.ratio=1;this.target=1
   this.lags=new Float32Array(164)
  }
  closest(m){
   const p=this.p
   if(p.scale===0)return Math.round(m)
   const steps=p.scale===1?[0,2,4,5,7,9,11]:[0,2,3,5,7,8,10]
   let best=m,dist=4
   for(let n=Math.floor(m)-3;n<=Math.ceil(m)+3;n++){
    if(steps.includes(((n-p.root)%12+12)%12)&&Math.abs(n-m)<dist){best=n;dist=Math.abs(n-m)}
   }
   return best
  }
  estimate(){
   if(this.have<320)return
   const y=this.y,k=this.yi,min=Math.max(4,Math.floor(this.dr/700)),max=Math.min(160,Math.ceil(this.dr/68)),N=173
   let energy=0
   for(let j=0;j<N;j++)energy+=y[(k-j-1)&511]**2
   if(energy/N<.000017){this.target=1;return}
   let cumulative=0,best=-1,bestValue=1e6
   this.lags[0]=1
   for(let l=1;l<=max;l++){
    let error=0
    for(let j=0;j<N;j++){const q=(k-j-1)&511;const x=y[q]-y[(q-l)&511];error+=x*x}
    cumulative+=error
    const v=cumulative>1e-9?error*l/cumulative:1
    this.lags[l]=v
    if(l>=min&&v<bestValue){best=l;bestValue=v}
    if(l>min&&this.lags[l-1]<.15&&v>this.lags[l-1]){best=l-1;bestValue=this.lags[l-1];break}
   }
   if(best<min||bestValue>.20){this.target=1;return}
   let period=best
   if(best<max){
    const c=this.lags[best],l=this.lags[best-1],r=this.lags[best+1],d=l+r-2*c
    if(d>1e-7)period+=Math.max(-.5,Math.min(.5,.5*(l-r)/d))
   }
   const freq=this.dr/period,m=69+12*Math.log2(freq/440),target=this.closest(m)
   this.target=2**(Math.min(2.5,Math.max(-2.5,target-m))*this.p.str/1200)
  }
  read(buf,at){
   const lo=Math.floor(at),f=at-lo
   return buf[lo&8191]*(1-f)+buf[(lo+1)&8191]*f
  }
  process(inputs,outputs){
   const a=inputs[0],b=outputs[0]
   if(!b.length)return true
   const speed=factor(this.p.speed),m=this.p.mix/100,n=b[0].length,W=this.win
   for(let i=0;i<n;i++){
    const x=a[0]?.[i]??0,y=a[1]?.[i]??x
    this.sum+=(x+y)*.5
    if(++this.ds>=this.dec){
     this.y[this.yi]=this.sum/this.dec;this.yi=(this.yi+1)&511;this.have=Math.min(512,this.have+1);this.ds=0;this.sum=0
    }
    if(++this.since>=this.period){this.since=0;this.estimate()}
    this.ratio+=(this.target-this.ratio)*speed
    // Shared grain phase for both channels. Changes crossfade around a common clock.
    this.phase=(this.phase+(1-this.ratio)/W+1)%1
    const q=this.phase,p=(q+.5)%1,w=.5-.5*Math.cos(2*Math.PI*q),pos=this.w
    for(let c=0;c<b.length;c++){
     const buf=this.rings[c];buf[pos]=c===0?x:y
     const delayed=this.read(buf,pos-W*.5)
     const wet=w*this.read(buf,pos-q*W-2)+(1-w)*this.read(buf,pos-p*W-2)
     const correction=Math.min(1,Math.abs(this.ratio-1)*130)
     b[c][i]=delayed+(wet-delayed)*m*correction
    }
    this.w=(pos+1)&8191
   }
   return true
  }
 }
 registerProcessor('onda-pitch',PitchAssist)
 registerProcessor('onda-shape',ShapeProcessor)
 registerProcessor('onda-pcm',PcmCapture)
}
const fxModules=new WeakMap()
export function initWorklets(ctx){
 if(!ctx.audioWorklet)return Promise.reject(Error('AudioWorklet indisponível. Abra o Onda por HTTPS ou localhost.'))
 if(!fxModules.has(ctx)){
  const url=URL.createObjectURL(new Blob(['('+ondaProcessors.toString()+')();'],{type:'text/javascript'}))
  const p=ctx.audioWorklet.addModule(url).finally(()=>URL.revokeObjectURL(url)).catch(e=>{fxModules.delete(ctx);throw Error('Não consegui carregar os efeitos em tempo real. Abra o Onda por HTTPS ou localhost.')})
  fxModules.set(ctx,p)
 }
 return fxModules.get(ctx)
}
