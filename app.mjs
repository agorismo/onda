import {FX_TYPES,FX_LIMIT,FXS_PRESETS,DELAY_LABELS,FX_CHOICES,fxSlot,fxPreset} from './fx-catalog.mjs'
import {Capture,clickIn} from './recorder.mjs'
import {BAR,PPQ,STEP,COLORS,PRESETS,MAX_BARS,MAX_TRACKS,MAX_PATTERNS,clamp,track,note,pat,clip,blank,demo,sanitize,arrange,contents,noteName} from './project.mjs'
import {Player,render,wav,autoGain} from './audio.mjs'
import {read,write} from './storage.mjs'
import {midi,importMidi} from './midi.mjs'
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)]
const ic=s=>'<svg aria-hidden="true"><use href="#i-'+s+'"/></svg>'
const escaped=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const pad=(n,l=2)=>String(n).padStart(l,'0')
const tone=t=>COLORS[t?.color??0]
const viewNames={arrange:'Arranjo',piano:'Piano roll',mix:'Mixer',plugins:'Plugins',auto:'Automação'}
const guides={arrange:'Clique no grid para inserir um padrão. Arraste o clipe para mover.',piano:'Clique para desenhar. Arraste as bordas para alterar a duração.',mix:'Volume, panorama e efeitos por faixa.',plugins:'Da voz ao master: coloque os efeitos na ordem em que o som deve passar.',auto:'Crie pontos de volume e curvas entre os compassos.'}
const dlog=$('#dialog'),editor=$('#editor')
let d=demo(), view='arrange', mode='song',tick=0, trackId='', patternId='', selectedClip='', selectedNote='', stepBar=0, octave=4, snap=STEP
let fxTarget='master',fxSelected='',fxType='eq',recWait=false,recPrefs={bars:0,count:1,latency:0,channels:1,depth:24,monitor:false,inputGain:0,backing:true},captureNumber=1,exportRate=48000,exportDepth=24
let clockHeard=0, pending=false, history=[],future=[],saveTimer=0,restart=0, toastTimer=0, noAuto=false, mic=null, sampleTarget='', altScroll=null, waveform=new Map, busy=false
const patterns=new Map()
const selected=()=>d.tracks.find(t=>t.id===trackId)||d.tracks[0]
const chosen=()=>d.patterns.find(p=>p.id===patternId&&p.track===selected().id)
const nm=p=>p?.name||'Sem padrão'
function current(t){
 const remembered=patterns.get(t.id)
 return d.patterns.find(p=>p.id===remembered&&p.track===t.id)||d.patterns.find(p=>p.track===t.id)
}
function sync(){
 if(!d.tracks.some(t=>t.id===trackId))trackId=d.tracks[0].id
 if(!chosen())patternId=current(selected())?.id||''
 stepBar=clamp(stepBar,0,Math.max(0,(chosen()?.bars||1)-1))
}
function select(t,p){
 if(t)trackId=t.id||t
 const real=selected()
 const a=p||current(real)
 if(view==='piano'&&a?.notes.length){const center=a.notes.map(x=>x.m).sort((a,b)=>a-b)[Math.floor(a.notes.length/2)];octave=clamp(Math.floor((center+8)/12)-1,0,8)}
 patternId=a?.id||''
 if(a)patterns.set(real.id,a.id)
 stepBar=0;selectedNote=''
 if(mode==='pattern')replay()
 draw()
}
function noteWill(p,n){
 if(!p)return
 const old=selected().preset, previewTrack=selected()
 const dur=PRESETS[old][1]==='audio'?Math.min(1.5,n.len*60/(PPQ*d.bpm)):.20
 player.preview(previewTrack,n.m,dur).catch(e=>toast(e.message))
}
function queueSave(){
 clearTimeout(saveTimer)
 $('#save-status').textContent=' • alterado'
 saveTimer=setTimeout(()=>saveNow(false),430)
}
async function saveNow(notify){
 try{
  await write(d)
  $('#save-status').textContent=' • salvo'
  if(notify)toast('Projeto salvo neste navegador.')
 }catch(e){
  noAuto=true;$('#save-status').textContent=' • não salvo'
  if(notify)toast('Sem espaço ou acesso no navegador. Baixe o projeto em Projeto → Backup .onda.')
 }
}
function change(f,{refresh=true,restartAudio=true}={}){
 history.push(structuredClone(d));if(history.length>40)history.shift()
 future=[]
 f()
 sync();queueSave()
 if(restartAudio)replay()
 if(refresh)draw()
}
function restore(type){
 if(mic||recWait){toast('Pare a tomada antes de desfazer ou refazer.');return}
 const from=type==='undo'?history:future,to=type==='undo'?future:history
 if(!from.length)return
 to.push(structuredClone(d));d=from.pop()
 sync();draw();queueSave();replay()
}
function load(p){
 if(mic||recWait){toast('Pare a tomada antes de trocar de projeto.');return}
 halt(true)
 change(()=>{d=p; patterns.clear();trackId='';patternId='';selectedClip='';selectedNote='';mode='song';view='arrange';stepBar=0})
}
function toast(t){
 const el=$('#toast');el.textContent=t;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2900)
}
function dialog(title,body){
 $('#dialog-content').innerHTML='<div class="d-head"><h2>'+title+'</h2><button data-cmd="close" class="ico" title="Fechar" aria-label="Fechar">'+ic('close')+'</button></div>'+body
 if(!dlog.open)dlog.showModal()
}
const button=(cmd,name,ico='',main=false)=>'<button class="btn '+(main?'primary':'subtle')+'" data-cmd="'+cmd+'">'+(ico?ic(ico):'')+name+'</button>'
const getColor=t=>'style="--tone:'+tone(t)+'"'
function renderTransport(){
 if(document.activeElement!==$('#title'))$('#title').value=d.name
 if(document.activeElement!==$('#bpm'))$('#bpm').value=d.bpm
 if(document.activeElement!==$('#sw'))$('#sw').value=Math.round(d.swing*100)
 $$('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode))})
 $$('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false')})
 const l=$('[data-cmd="loop"]');l.classList.toggle('active',d.loop);l.setAttribute('aria-pressed',String(d.loop))
 $('[data-cmd="undo"]').disabled=!history.length
 $('[data-cmd="redo"]').disabled=!future.length
 $('#play').innerHTML=ic(player.playing||pending?'pause':'play')
 $('#play').setAttribute('aria-label',player.playing||pending?'Pausar':'Reproduzir')
 $('[data-cmd="record"]').classList.toggle('active',!!mic)
 $('#page-heading').innerHTML=viewNames[view]+'<span>.</span>'
 $('#guide').innerHTML='<p>'+guides[view]+'</p>'
}
function library(){
 $('#sound-list').innerHTML=['drum','synth'].map((type,i)=>'<div class="group-title">'+['PERCUSSÃO','INSTRUMENTOS'][i]+'</div>'+Object.entries(PRESETS).filter(([_,v])=>v[1]===type).map(([k,[n]])=>'<div class="preset '+type+'"><button class="listen" data-preview="'+k+'" aria-label="Pré-ouvir '+n+'">'+ic(type)+escaped(n)+'</button><button class="ico" data-add="'+k+'" title="Adicionar '+n+'" aria-label="Adicionar '+n+'">'+ic('plus')+'</button></div>').join('')).join('')
}
function header(section,title,tools){return '<div class="panel-top"><div><span class="eyebrow">'+section+'</span><h2>'+escaped(title)+'</h2></div><div class="panel-tools">'+tools+'</div></div>'}
function menuPatterns(t){
 return '<select data-field="pat" aria-label="Selecionar padrão">'+d.patterns.filter(p=>p.track===t.id).map(p=>'<option value="'+p.id+'" '+(p.id===patternId?'selected':'')+'>'+escaped(p.name)+'</option>').join('')+'</select>'
}
function muteButton(t,k,label){
 const v=t[k];return '<button class="mini '+(k==='solo'?'s ':'')+(v?'active':'')+'" aria-pressed="'+v+'" data-toggle="'+k+'" data-id="'+t.id+'" aria-label="'+label+': '+escaped(t.name)+'" title="'+label+'">'+(k==='solo'?'S':'M')+'</button>'
}
function thumb(p,t){
 if(t.preset==='sample'&&waveform.has(t.id)){
  const whole=waveform.get(t.id),a=whole.slice(Math.floor(whole.length*(t.sampleIn||0)),Math.max(1,Math.ceil(whole.length*(t.sampleOut??1))));let path='M0 7'
  a.forEach((v,i)=>path+='L'+(i*100/a.length).toFixed(2)+' '+(7-v*6).toFixed(2));a.slice().reverse().forEach((v,j)=>path+='L'+((a.length-j)*100/a.length).toFixed(2)+' '+(7+v*6).toFixed(2))
  return '<svg viewBox="0 0 100 14" preserveAspectRatio="none"><path d="'+path+'Z"/></svg>'
 }
 const drum=PRESETS[t.preset][1]==='drum'
 return '<svg viewBox="0 0 100 14" preserveAspectRatio="none">'+p.notes.slice(0,150).map(n=>'<rect x="'+(n.at/(p.bars*BAR)*100).toFixed(2)+'" y="'+(drum?2:clamp(11-(n.m%24)/2,0,12))+'" width="'+(drum?2:Math.max(1,n.len/(p.bars*BAR)*100).toFixed(1))+'" height="'+(drum?10:2)+'" opacity="'+n.v+'"/>').join('')+'</svg>'
}
function arrangeView(){
 const t=selected(),p=chosen(), n=d.bars
 const cols='style="grid-template-columns:repeat('+n+',var(--barw))"'
 let html=header('PLAYLIST  /  '+pad(n)+' COMPASSOS','Linha do tempo','<label>Duração <input type="number" min="1" max="128" aria-label="Duração em compassos" data-field="bars" value="'+n+'"></label><label>Loop <input min="1" max="'+n+'" type="number" aria-label="Início do loop" data-field="loopStart" value="'+(d.loopStart+1)+'">–<input min="1" max="'+n+'" type="number" aria-label="Fim do loop" data-field="loopEnd" value="'+d.loopEnd+'"></label>'+button('pattern-new','Padrão','plus'))
 html+='<div class="scroll arrange"><div class="timeline"><div class="timeline-head">FAIXAS / '+pad(d.tracks.length)+'</div><div class="ruler" '+cols+'>'
 for(let b=0;b<n;b++)html+='<button data-seek="'+b+'" class="'+(d.loop&&b>=d.loopStart&&b<d.loopEnd?'looprange':'')+'" aria-label="Reproduzir a partir do compasso '+(b+1)+'">'+pad(b+1)+'</button>'
 html+='<div class="playhead" data-needle="arrange"></div></div>'
 const ps=new Map(d.patterns.map(p=>[p.id,p]))
 for(const [i,tr] of d.tracks.entries()){
  const patClips=d.clips.filter(c=>ps.get(c.pattern)?.track===tr.id)
  html+='<div class="track-label '+(tr.id===t.id?'selected':'')+'" '+getColor(tr)+'><button class="trackpick" data-track="'+tr.id+'" title="'+escaped(tr.name)+'"><span class="dot"></span><b>'+escaped(tr.name)+'</b></button>'+muteButton(tr,'mute','Silenciar')+muteButton(tr,'solo','Solo')+'</div><div class="lane '+(i%2?'alt':'')+'" data-lane="'+tr.id+'" '+cols+'>'
  for(let b=0;b<n;b++)html+='<button class="cell" style="grid-column:'+(b+1)+'" data-cell="'+b+'" data-id="'+tr.id+'" aria-label="Inserir '+escaped(tr.name)+' no compasso '+(b+1)+'"></button>'
  for(const c of patClips){
   const a=ps.get(c.pattern)
   html+='<button class="clip '+(selectedClip===c.id?'selected':'')+'" data-clip="'+c.id+'" title="'+escaped(a.name)+' · '+(c.bar+1)+'" style="--tone:'+tone(tr)+';grid-column:'+(c.bar+1)+' / span '+Math.min(a.bars,n-c.bar)+'"><span>'+escaped(a.name)+'</span>'+thumb(a,tr)+'</button>'
  }
  html+='<div class="playhead" data-needle="arrange"></div></div>'
 }
 html+='</div></div><div class="hints">Em edição: <strong>'+escaped(t.name)+'</strong> / '+escaped(nm(p))+' &nbsp; • &nbsp; Clique duplo no clipe abre o editor de notas. Del remove o clipe selecionado.</div>'
 return html
}
function pianoView(){
 const t=selected(),p=chosen(), top=Math.min(127,octave*12+24),bottom=Math.max(0,top-35)
 const active=p?.notes.find(n=>n.id===selectedNote), maxPattern=t.preset==='sample'?64:16
 let tools=menuPatterns(t)+(p?'<label>Compassos <input type="number" min="1" max="'+maxPattern+'" data-field="patsize" aria-label="Duração do padrão" value="'+p.bars+'"></label>':'')+button('pattern-new','Padrão','plus')
 tools+='<label>Grade <select data-field="snap" aria-label="Grade do piano"><option value="48" '+(snap===48?'selected':'')+'>1/8</option><option value="24" '+(snap===24?'selected':'')+'>1/16</option><option value="12" '+(snap===12?'selected':'')+'>1/32</option></select></label><label>Oitava <input type="number" min="0" max="8" aria-label="Oitava do piano" data-field="octave" value="'+octave+'"></label>'
 let html=header('EDITOR DE NOTAS  /  '+escaped(t.name),nm(p),tools)
 if(!p)return html+'<div class="empty">Crie um padrão para começar.</div>'
 const high=top, mapped=Array.from({length:top-bottom+1},(_,i)=>top-i)
 html+='<div class="scroll piano"><div class="piano-wrap"><div class="keycol">'+mapped.map(m=>'<button class="key '+(noteName(m).includes('#')?'sharp':'')+'" data-key="'+m+'" aria-label="Ouvir '+noteName(m)+'">'+noteName(m)+'</button>').join('')+'</div><div class="piano-grid" data-top="'+high+'" data-max="'+(p.bars*BAR)+'" style="width:calc('+p.bars*16+' * var(--tickw));--tone:'+tone(t)+'">'
 html+=mapped.map(m=>'<div class="pitch-line '+(noteName(m).includes('#')?'sharp':'')+'"></div>').join('')
 html+=p.notes.filter(n=>n.m>=bottom&&n.m<=top&&n.at<p.bars*BAR).map(n=>'<div class="pnote '+(active?.id===n.id?'selected':'')+'" data-note="'+n.id+'" role="button" tabindex="0" title="'+noteName(n.m)+' | Velocidade '+Math.round(n.v*100)+'%" style="left:calc('+n.at/STEP+' * var(--tickw));width:max(8px,calc('+Math.min(n.len,p.bars*BAR-n.at)/STEP+' * var(--tickw) - 2px));top:'+((top-n.m)*25+2)+'px;opacity:'+(.55+.45*n.v)+'">'+noteName(n.m)+'<span class="resize-note" aria-hidden="true"></span></div>').join('')
 html+='<div class="playhead" data-needle="piano"></div></div></div></div>'
 html+='<div class="hints">'+(active?'<label>Velocidade <input data-field="velocity" aria-label="Velocidade da nota" class="field" type="number" min="5" max="100" value="'+Math.round(active.v*100)+'"></label> &nbsp; ':'')+'Clique direito ou Del remove. Arraste a nota para mudar altura ou posição.</div>'
 return html
}
function mixView(){
 let h=header('ROTEAMENTO  /  SAÍDA ESTÉREO','Mixer',button('track-edit','Editar faixa','mix')+button('track-plugins','Cadeia '+(selected()?.name||''),'wave'))
 h+='<div class="scroll"><div class="mix-grid">'
 for(const t of [{...track('keys'),id:'master',name:'MASTER',vol:d.master,color:1},...d.tracks]){
  const m=t.id==='master'
  h+='<div class="strip '+(t.id===trackId?'sel':'')+'" '+getColor(t)+'><div class="strip-top"><span class="dot"></span><b>'+escaped(t.name)+'</b></div><div class="meterline"><i data-track-meter="'+t.id+'"></i></div>'
  function slider(k,n,min,max,val){
   const desc=k==='low'?val+' Hz':k==='pan'?Math.round(val*50):Math.round(val*100)+'%'
   return '<label>'+n+' <span class="mval">'+desc+'</span><input aria-label="'+n+': '+escaped(t.name)+'" data-mix="'+k+'" data-id="'+t.id+'" type="range" min="'+min+'" max="'+max+'" step="'+(k==='low'?50:'.01')+'" value="'+val+'"></label>'
  }
  h+=slider('vol','Volume',0,1.5,t.vol)
  if(!m)h+=slider('pan','Pan',-1,1,t.pan)+slider('low','Filtro',140,20000,t.low)+slider('delay','Delay',0,.55,t.delay)+slider('verb','Reverb',0,.55,t.verb)+slider('drive','Saturação',0,1,t.drive)+'<div>'+muteButton(t,'mute','Silenciar')+' '+muteButton(t,'solo','Solo')+'</div>'
  h+='</div>'
 }
 return h+'</div></div><div class="hints">Filtro passa-baixas por faixa. Delay sincronizado ao BPM. Compressor de proteção no master.</div>'
}
function autoView(){
 const t=selected()
 const pick='<select data-field="auto-track" aria-label="Faixa de automação">'+d.tracks.map(x=>'<option value="'+x.id+'" '+(x.id===t.id?'selected':'')+'>'+escaped(x.name)+'</option>').join('')+'</select>'
 let h=header('ENVELOPE  /  VOLUME',t.name,pick+button('auto-clear','Limpar pontos','trash'))+'<div class="scroll auto-pad"><div class="autogrid">'
 for(let b=0;b<d.bars;b++){
  const v=t.auto.find(a=>a.bar===b)
  h+='<div class="auto-col '+(v?'set':'')+'" '+getColor(t)+'><input type="range" data-auto="'+b+'" min="0" max="1" step=".02" aria-label="Volume no compasso '+(b+1)+'" value="'+(v?.v??autoGain(t,b))+'"><button data-autopoint="'+b+'" title="Adicionar ou remover ponto" aria-label="Ponto do compasso '+(b+1)+'">'+(v?'◆ ':'· ')+pad(b+1)+'</button></div>'
 }
 return h+'</div></div><div class="hints">Mova um controle ou clique no número para criar um ponto. Clique no número ativo para remover. A curva vale no modo Música.</div>'
}
function rack(){
 const max=Math.max(1,...d.tracks.map(t=>current(t)?.bars||1))
 stepBar=clamp(stepBar,0,max-1)
 $('#stepbar').textContent=pad(stepBar+1)+' / '+pad(max)
 $('#bar-down').disabled=stepBar<=0;$('#bar-up').disabled=stepBar>=max-1
 const whole=d.tracks.map(t=>{
  const cur=t.id===trackId?chosen():current(t)
  const pitch=PRESETS[t.preset][1]==='drum'?({kick:36,snare:38,hat:42,clap:39,perc:45}[t.preset]||60):60
  const notes=cur?.notes||[]
  return '<div class="rack-meta '+(t.id===trackId?'selected':'')+'" '+getColor(t)+'><button class="trackpick" data-track="'+t.id+'"><span class="dot"></span><b>'+escaped(t.name)+'</b></button><button class="mini" title="Piano roll" aria-label="Abrir piano roll de '+escaped(t.name)+'" data-open-roll="'+t.id+'">♪</button></div><div class="rack-steps" '+getColor(t)+'>'+Array.from({length:16},(_,j)=>{
   const at=BAR*stepBar+STEP*j,on=notes.some(n=>n.at===at&&(PRESETS[t.preset][1]==='drum'||n.m===pitch))
   return '<button class="step '+(Math.floor(j/4)%2?'group ':'')+(on?'on':'')+'" aria-pressed="'+on+'" aria-label="'+escaped(t.name)+' passo '+(j+1)+'" data-step="'+j+'" data-id="'+t.id+'" data-pitch="'+pitch+'" '+(stepBar>=(cur?.bars||1)?'disabled':'')+'>'+(j%4===0?pad(j+1):'')+'</button>'
  }).join('')+'</div>'
 }).join('')
 $('#steps').innerHTML='<div class="scroll"><div class="racklist">'+whole+'</div></div>'
}
function draw(){
 const el=editor.querySelector('.scroll')
 const before=el&&el.classList.contains(view)?[el.scrollLeft,el.scrollTop]:null
 const oldPiano=view==='piano'&&el?.classList.contains('piano')
 editor.innerHTML=({arrange:arrangeView,piano:pianoView,mix:mixView,plugins:pluginsView,auto:autoView}[view])()
 const after=editor.querySelector('.scroll')
 if(after&&before)[after.scrollLeft,after.scrollTop]=before
 if(after&&view==='piano'&&!oldPiano)after.scrollTop=125
 rack();renderTransport();frame(tick,player.g)
}
const meter=$('#meter'),mc=meter.getContext('2d')
const fft=new Uint8Array(256),scope=new Float32Array(512)
function frame(raw,g){
 tick=raw
 const i=Math.max(0,Math.floor(raw)), b=Math.floor(i/BAR)+1, beat=Math.floor(i%BAR/PPQ)+1
 $('#counter').textContent=pad(b)+':'+pad(beat)+':'+pad(i%PPQ)
 const span=(mode==='pattern'?chosen()?.bars||1:d.bars)*BAR
 for(const e of $$('[data-needle]')){
  const kind=e.dataset.needle
  e.hidden=(kind==='arrange'&&mode!=='song')||(kind==='piano'&&mode!=='pattern')
  if(!e.hidden)e.style.left=kind==='arrange'?'calc('+i/BAR+' * var(--barw))':'calc('+i/STEP+' * var(--tickw))'
 }
 const step=Math.floor(i/STEP)%16
 if(step!==clockHeard||!player.playing){
  clockHeard=step
  for(const e of $$('.step.now'))e.classList.remove('now')
  if(player.playing)for(const e of $$('.step[data-step="'+step+'"]'))e.classList.add('now')
 }
 if(mc){
  mc.clearRect(0,0,152,29)
  if(g){
   g.amp.getByteFrequencyData(fft)
   for(let k=0;k<27;k++){const p=Math.min(255,Math.floor(k**1.37*.82)),x=fft[p]/255;mc.fillStyle=k>20?'#df9f77':'#79c7ae';mc.fillRect(k*5.6+1,28-Math.max(1,x*28),3,Math.max(1,x*28))}
  }else{mc.fillStyle='#52675c';for(let k=0;k<27;k++)mc.fillRect(k*5.6+1,27,3,1)}
 }
 if(view==='mix')for(const e of $$('[data-track-meter]')){
  const a=e.dataset.trackMeter==='master'?g?.amp:g?.channels.get(e.dataset.trackMeter)?.meter
  let max=0
  if(a){const bin=scope.subarray(0,a.fftSize);a.getFloatTimeDomainData(bin);for(const z of bin)max=Math.max(max,Math.abs(z))}
  e.style.width=Math.min(100,max*138)+'%'
 }
}
const player=new Player(frame,()=>{tick=0;renderTransport();frame(0,null)})
async function play(){
 if(mic||recWait){toast('Pare a tomada para alterar o transporte.');return}
 if(player.playing||pending){halt(false);return}
 if(mode==='pattern'&&!chosen()){toast('Crie ou selecione um padrão.');return}
 pending=true;renderTransport()
 try{await player.start(structuredClone(d),mode,patternId,tick)}
 catch(e){toast(e.message);player.stop()}
 finally{pending=false;renderTransport()}
}
function halt(reset){clearTimeout(restart);pending=false;player.stop();if(reset)tick=mode==='song'&&d.loop?d.loopStart*BAR:0;renderTransport();frame(tick,null)}
function replay(explicit=null){
 if(mic||recWait||!player.playing)return
 clearTimeout(restart);restart=setTimeout(()=>{
  if(!player.playing)return
  const pos=explicit===null?tick:explicit
  player.start(structuredClone(d),mode,patternId,pos).then(renderTransport).catch(e=>{toast(e.message);halt(false)})
 },85)
}
function seek(bar){
 if(mic||recWait){toast('A posição é fixa enquanto grava.');return}
 if(mode!=='song'){mode='song';renderTransport()}
 if(d.loop&&(bar<d.loopStart||bar>=d.loopEnd))change(()=>d.loop=false,{restartAudio:false})
 tick=bar*BAR;if(player.playing)replay(tick);else frame(tick,null)
}
function addTrack(preset){
 if(d.tracks.length>=MAX_TRACKS||d.patterns.length>=MAX_PATTERNS)return toast('Limite de faixas ou padrões alcançado.')
 let t
 change(()=>{
  t=track(preset,d.tracks.length)
  const p=pat(t.id,d.patterns.length+1)
  d.tracks.push(t);d.patterns.push(p)
  trackId=t.id;patternId=p.id;patterns.set(t.id,p.id);stepBar=0
 })
 toast(t.name+' adicionado. Use o sequenciador ou o piano roll.')
}
function newPattern(copy=false){
 const t=selected(),old=chosen()
 if(d.patterns.length>=MAX_PATTERNS)return toast('Limite de padrões alcançado.')
 change(()=>{
  const p=pat(t.id,d.patterns.length+1,copy&&old?old.bars:1)
  if(copy&&old){p.name=(old.name+' cópia').slice(0,64);p.notes=old.notes.map(n=>note(n.at,n.m,n.len,n.v))}
  d.patterns.push(p); patternId=p.id;patterns.set(t.id,p.id);stepBar=0
 })
 toast('Padrão criado. No arranjo, clique em um compasso vazio pra usar.')
}
function editTrack(){
 const t=selected()
 const sample=t.preset==='sample'?'<label>Início do recorte (%)<input id="sample-in" type="number" min="0" max="99" value="'+Math.round((t.sampleIn??0)*100)+'"></label><label>Fim do recorte (%)<input id="sample-out" type="number" min="1" max="100" value="'+Math.round((t.sampleOut??1)*100)+'"></label><label>Fade de entrada (ms)<input id="sample-fadein" type="number" min="0" max="10000" value="'+Math.round((t.fadeIn??.005)*1000)+'"></label><label>Fade de saída (ms)<input id="sample-fadeout" type="number" min="0" max="10000" value="'+Math.round((t.fadeOut??.012)*1000)+'"></label>':''
 dialog('Editar faixa','<label>Nome da faixa<input id="track-name" maxlength="64" value="'+escaped(t.name)+'"></label><label>Cor <select id="track-color">'+COLORS.map((c,i)=>'<option value="'+i+'" '+(i===t.color?'selected':'')+'>Cor '+(i+1)+' / '+c+'</option>').join('')+'</select></label>'+sample+'<div class="d-actions">'+button('track-apply','Aplicar','save',true)+(sample?button('sample-replace','Trocar áudio','up'):'')+button('track-delete','Apagar faixa','trash')+'</div>')
}
function patternDialog(){
 const a=chosen()
 dialog('Padrões de '+escaped(selected().name),'<label>Padrão atual'+menuPatterns(selected())+'</label>'+(a?'<label>Nome<input id="pattern-name" value="'+escaped(a.name)+'" maxlength="64"></label>':'')+'<div class="d-actions">'+button('pat-create','Novo vazio','plus',true)+(a?button('pat-rename','Renomear','save')+button('pat-copy','Duplicar','copy')+button('pat-delete','Excluir','trash'):'')+'</div>')
}
function getUrl(blob,name){
 const url=URL.createObjectURL(blob),a=document.createElement('a')
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),12000)
}
const filename=()=>d.name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,54)||'Projeto Onda'
function backup(){
 getUrl(new Blob([JSON.stringify(d)],{type:'application/json'}),filename()+'.onda')
 toast('Backup editável gerado.')
}
async function bounce(kind){
 if(busy)return
 const id=patternId, t=selected()
 if(kind==='midi'){getUrl(midi(d,mode,id),filename()+'.mid');toast('MIDI exportado.');return}
 busy=true
 const copy=structuredClone(d)
 if(kind==='stem')for(const x of copy.tracks){x.solo=x.id===t.id;x.mute=false}
 try{
  toast('Renderizando WAV estéreo…')
  const m=kind==='pattern'?'pattern':'song',len=contents(copy,m,id).events.length
  if(!len)throw Error('Não há notas para exportar neste trecho.')
  const bytes=wav(await render(copy,{mode:m,pattern:id,stems:kind==='stem'?t.id:null,sampleRate:exportRate,onStatus:toast}),exportDepth)
  getUrl(bytes,filename()+(kind==='stem'?' - '+t.name.replace(/[<>:"/\\|?*]/g,'_'):kind==='pattern'?' - padrao':'')+'.wav')
  toast('WAV estéreo • '+(exportRate===48000?'48':'44,1')+' kHz • '+exportDepth+' bits.')
 }catch(e){toast(e.message||'Não foi possível exportar o áudio.')}
 finally{busy=false}
}
const fileData=(blob,mime)=>new Promise((resolve,reject)=>{
 const fr=new FileReader();fr.onerror=()=>reject(fr.error);fr.onload=()=>resolve(String(fr.result).replace(/^data:[^,]*,/, 'data:'+mime+';base64,'));fr.readAsDataURL(blob)
})
function waveFrom(buf){
 const mono=buf.getChannelData(0)
 return Array.from({length:105},(_,i)=>{
  const span=Math.floor(mono.length/105),start=i*span
  let max=0;for(let z=0;z<span;z+=Math.max(1,Math.floor(span/60)))max=Math.max(max,Math.abs(mono[start+z]))
  return max
 })
}
async function addAudio(blob,name,replaceId='',where=null){
 if(!blob||!blob.size)throw Error('Nenhum áudio recebido.')
 if(blob.size>24*1024*1024)throw Error('Cada áudio pode ter até 24 MB.')
 const total=d.tracks.reduce((n,t)=>n+(t.id!==replaceId?(t.sample?.length||0):0),0)
 if(total+blob.size*1.34>84*1024*1024)throw Error('O projeto chegou ao limite de aproximadamente 63 MB de áudio original.')
 const target=d.tracks.find(t=>t.id===replaceId&&t.preset==='sample')
 if(!target&&(d.tracks.length>=MAX_TRACKS||d.patterns.length>=MAX_PATTERNS))throw Error('Limite de faixas ou padrões alcançado.')
 const ctx=await player.ensure()
 const buf=await ctx.decodeAudioData(await blob.arrayBuffer()).catch(()=>{throw Error('Formato de áudio não decodificado neste navegador.')})
 const url=await fileData(blob,blob.type?.startsWith('audio/')?blob.type.split(';')[0]:'audio/wav')
 const len=Math.max(STEP,Math.ceil(buf.duration*d.bpm*PPQ/60))
 const t=target||track('sample',d.tracks.length,name.slice(0,54))
 const a=target?null:pat(t.id,d.patterns.length+1,clamp(Math.ceil(len/BAR),1,MAX_BARS))
 const at=clamp(where??Math.floor(tick/BAR),0,MAX_BARS-1)
 change(()=>{
  t.sample=url;t.sampleIn=0;t.sampleOut=1;waveform.set(t.id,waveFrom(buf))
  if(!target){
   t.vol=.68;a.notes=[note(0,60,Math.min(len,a.bars*BAR),.88)]
   d.tracks.push(t);d.patterns.push(a)
   if(a.bars+at>d.bars)d.bars=clamp(a.bars+at,1,MAX_BARS)
   if(at+a.bars>d.bars){a.bars=d.bars-at;a.notes[0].len=Math.min(a.notes[0].len,a.bars*BAR)}
   arrange(d,a,at)
   trackId=t.id;patternId=a.id;patterns.set(t.id,a.id)
  }
 })
 toast(buf.duration*d.bpm/240>MAX_BARS?'Áudio importado. O padrão usa os primeiros 128 compassos.':'Áudio importado: '+t.name)
}
function recordSetup(){
 if(recWait)return
 if(mic){mic.capture.stop();return}
 const p=recPrefs, now=Math.min(d.bars-1,Math.floor(tick/BAR))
 dialog('Gravar voz ou instrumento','<p>Gravação PCM, sem supressão de ruído por padrão. Com monitoração, use fones para evitar microfonia.</p><div class="rec-fields"><label>Compasso inicial<input id="rec-at" type="number" min="1" max="128" value="'+(now+1)+'"></label><label>Contagem<select id="rec-count"><option value="0">Sem contagem</option><option value="1" '+(p.count===1?'selected':'')+'>1 compasso</option><option value="2" '+(p.count===2?'selected':'')+'>2 compassos</option></select></label><label>Parar após (0 = manual)<input id="rec-bars" type="number" min="0" max="128" value="'+p.bars+'"></label><label>Compensar atraso (ms)<input id="rec-lat" type="number" min="-200" max="400" value="'+p.latency+'"></label><label>Canais<select id="rec-ch"><option value="1" '+(p.channels===1?'selected':'')+'>Mono / voz</option><option value="2" '+(p.channels===2?'selected':'')+'>Estéreo</option></select></label><label>Ganho de entrada (dB)<input id="rec-gain" type="number" min="-24" max="18" value="'+p.inputGain+'"></label><label>Resolução da tomada<select id="rec-depth"><option value="24" '+(p.depth===24?'selected':'')+'>24 bits PCM</option><option value="16" '+(p.depth===16?'selected':'')+'>16 bits PCM</option></select></label></div><label>Entrada<select id="rec-device"><option value="">Dispositivo padrão</option></select></label><div class="rec-check"><label><input id="rec-back" type="checkbox" '+(p.backing?'checked':'')+'> Tocar a base durante a gravação</label><label><input id="rec-mon" type="checkbox" '+(p.monitor?'checked':'')+'> Monitorar entrada (fones)</label></div><div class="d-actions">'+button('record-now','Armar gravação','mic',true)+'</div>')
 navigator.mediaDevices?.enumerateDevices().then(items=>{
  const picker=$('#rec-device')
  if(!picker)return
  for(const [i,dev] of items.filter(x=>x.kind==='audioinput'&&x.deviceId&&x.deviceId!=='default'&&x.deviceId!=='communications').entries()){
   const option=new Option(dev.label||'Entrada '+(i+1),dev.deviceId);picker.add(option)
  }
 }).catch(()=>{})
}
async function microphone(){
 if(recWait||mic)return
 if(d.tracks.length>=MAX_TRACKS||d.patterns.length>=MAX_PATTERNS){toast('Crie espaço para uma nova faixa de tomada.');return}
 const n=q=>Number($(q)?.value)||0
 const at=clamp(Math.round(n('#rec-at'))-1,0,MAX_BARS-1)
 const prefs={bars:clamp(Math.round(n('#rec-bars')),0,MAX_BARS),count:clamp(Math.round(n('#rec-count')),0,2),latency:clamp(n('#rec-lat'),-200,400),channels:n('#rec-ch')===2?2:1,depth:n('#rec-depth')===16?16:24,monitor:$('#rec-mon').checked,inputGain:clamp(n('#rec-gain'),-24,18),backing:$('#rec-back').checked}
 const device=$('#rec-device')?.value||''
 recPrefs=prefs
 dlog.close();halt(false);recWait=true
 let capture=null,drawRec=0,abortClicks=null
 try{
  const ctx=await player.ensure()
  capture=await Capture.request(ctx,{...prefs,device})
  const used=d.tracks.reduce((x,t)=>x+(t.sample?.length||0),0)
  const unit=60/d.bpm,room=Math.min(23.9*1024*1024,(84*1024*1024-used)/1.34)
  const max=Math.min(255,(room-128)/(ctx.sampleRate*prefs.channels*prefs.depth/8),(MAX_BARS-at)*4*unit)
  if(max<.2)throw Error('Sem espaço para gravar. Remova alguns samples ou comece num compasso anterior.')
  const span=prefs.bars?Math.min(max,prefs.bars*4*unit):max
  let start=ctx.currentTime+.35+prefs.count*4*unit
  if(prefs.backing){
   const back=structuredClone(d);back.loop=false;back.bars=Math.min(MAX_BARS,Math.max(d.bars,at+Math.ceil(span/(4*unit))))
   const got=await player.start(back,'song',patternId,at*BAR,{startAt:start,backing:true})
   start=got.startTime
   mode='song'
  }
  mic={capture,at,span}
  const abortStart=start+prefs.latency/1000
  const from=Math.max(ctx.currentTime+.04,abortStart)
  const takePromise=capture.arm(from,span)
  abortClicks=clickIn(ctx,start,d.bpm,prefs.count*4)
  renderTransport()
  const panel=$('#studio-rec');panel.hidden=false
  drawRec=setInterval(()=>{
   if(!mic)return
   const t=ctx.currentTime-start,level=capture.level(),seconds=Math.floor(Math.max(0,t)),left=Math.ceil(-t/unit)
   $('#rec-label').textContent=t<0?'Contagem · '+Math.max(1,left):'GRAVANDO · compasso '+(at+1+Math.floor(t/(4*unit)))
   $('#rec-meter').style.width=(Math.min(1,level)*100)+'%'
   $('#rec-meter').classList.toggle('peak',level>=.96)
   $('#rec-time').textContent=pad(Math.floor(seconds/60))+':'+pad(seconds%60)
  },30)
  const take=await takePromise
  $('#rec-label').textContent='Salvando tomada…'
  halt(false)
  await addAudio(take.blob,'Voz · Tomada '+pad(captureNumber++),'',at)
  view='arrange';draw()
  toast('Tomada no compasso '+(at+1)+' · '+take.seconds.toFixed(2)+' s em PCM '+prefs.depth+' bits.')
 }catch(e){
  halt(false)
  toast(e.name==='NotAllowedError'?'Permissão do microfone recusada.':e.message||'Não consegui gravar.')
 }finally{
  capture?.finish();abortClicks?.();clearInterval(drawRec);recWait=false;mic=null;$('#studio-rec').hidden=true;renderTransport()
 }
}
function removeSelected(){
 if(view==='piano'&&selectedNote&&chosen()){
  const p=chosen();change(()=>{p.notes=p.notes.filter(x=>x.id!==selectedNote);selectedNote=''})
 }else if(view==='arrange'&&selectedClip){
  change(()=>{d.clips=d.clips.filter(x=>x.id!==selectedClip);selectedClip=''})
 }
}
function updateWave(){
 if(!d.tracks.some(t=>t.sample&&!waveform.has(t.id)))return
 const C=window.AudioContext||window.webkitAudioContext
 if(!C)return
 for(const t of d.tracks.filter(t=>t.sample&&!waveform.has(t.id))){
  const ac=new OfflineAudioContext(1,512,22050)
  fetch(t.sample).then(r=>r.arrayBuffer()).then(a=>ac.decodeAudioData(a)).then(b=>{waveform.set(t.id,waveFrom(b));if(view==='arrange')draw()}).catch(()=>{})
 }
}
const cmds={
 play,stop:()=>mic?mic.capture.stop():halt(true),undo:()=>restore('undo'),redo:()=>restore('redo'),
 loop:()=>change(()=>d.loop=!d.loop),record:recordSetup,'rec-stop':()=>mic?.capture.stop(),'record-now':microphone,
 files:()=>dialog('Projeto','<p>O autosave é local a este navegador. Faça backup para trocar de dispositivo ou manter outra versão editável.</p><div class="d-actions stack">'+button('save','Salvar local','save')+button('backup','Backup .onda','down',true)+button('open','Abrir .onda ou MIDI','up')+button('new','Projeto vazio','plus')+button('demo','Carregar demonstração','wave')+'</div>'),
 'new':()=>{dlog.close();load(blank());toast('Projeto vazio criado. Ctrl+Z recupera a versão anterior nesta sessão.')},
 demo:()=>{dlog.close();load(demo());toast('Demonstração carregada.')},
 open:()=>$('#project-file').click(),backup,save:()=>saveNow(true),close:()=>dlog.close(),sounds:()=>$('#browser').classList.toggle('show'),
 sample:()=>{sampleTarget='';$('#audio-file').click()},
 'sample-replace':()=>{sampleTarget=selected().id;dlog.close();$('#audio-file').click()},
 export:()=>dialog('Exportar','<p>O WAV da música inclui os plugins e renderiza a playlist toda, sem o limite da região de loop.</p><div class="rec-fields"><label>Taxa de amostragem<select id="wav-rate" aria-label="Taxa de amostragem"><option value="48000" '+(exportRate===48000?'selected':'')+'>48 kHz</option><option value="44100" '+(exportRate===44100?'selected':'')+'>44,1 kHz</option></select></label><label>Resolução do WAV<select id="wav-depth" aria-label="Resolução do WAV"><option value="24" '+(exportDepth===24?'selected':'')+'>24 bits PCM</option><option value="16" '+(exportDepth===16?'selected':'')+'>16 bits PCM</option></select></label></div><div class="d-actions stack">'+button('wav-song','Música em WAV','down',true)+button('wav-pattern','Padrão em WAV','down')+button('wav-track','Faixa em WAV','down')+button('midi','MIDI','down')+button('backup','Projeto .onda','save')+'</div>'),
 'wav-song':()=>bounce('song'),'wav-pattern':()=>bounce('pattern'),'wav-track':()=>bounce('stem'),midi:()=>bounce('midi'),
 help:()=>dialog('Atalhos e ajuda','<ul><li><b>Espaço:</b> reproduzir / pausar. <b>Del:</b> apagar seleção.</li><li><b>Ctrl+S:</b> salvar localmente. <b>Ctrl+Z:</b> desfazer. <b>Ctrl+Shift+Z:</b> refazer.</li><li>Escolha ou crie um padrão em cada faixa. Clique em um compasso vazio pra inserir. Dê dois cliques no clipe pra editar.</li><li>O sequenciador é de 16 passos; o piano roll edita altura, duração e velocidade. Ajuste a oitava pra acessar mais notas.</li><li>No Mixer, mute e solo afetam reprodução e WAV. Em Automação, adicione pontos por compasso. O volume varia gradualmente entre os pontos.</li><li>O MIDI exporta notas, não timbres. O .onda contém os samples e fica editável.</li></ul>'),
 'track-edit':editTrack,'track-plugins':()=>{fxTarget=selected().id;fxSelected='';view='plugins';draw()},
 'track-apply':()=>{
  const t=selected(),name=$('#track-name').value.trim(),color=Number($('#track-color').value)
  const sample=t.preset==='sample', start=sample?clamp((+$('#sample-in').value||0)/100,0,.99):0, end=sample?clamp((+$('#sample-out').value||100)/100,0,1):1
  if(end<=start){toast('O fim do recorte precisa ficar depois do início.');return}
  change(()=>{if(name)t.name=name;t.color=color;if(sample){t.sampleIn=start;t.sampleOut=end;t.fadeIn=clamp(+$('#sample-fadein').value/1000||0,0,10);t.fadeOut=clamp(+$('#sample-fadeout').value/1000||0,0,10)}})
  dlog.close()
 },
 'track-delete':()=>{const t=selected();dialog('Apagar '+escaped(t.name)+'?','<p>Isso remove também os padrões e clipes da faixa. Dá para desfazer.</p><div class="d-actions">'+button('track-confirm','Apagar faixa','trash',true)+button('close','Cancelar')+'</div>')},
 'track-confirm':()=>{const t=selected();change(()=>{const p=new Set(d.patterns.filter(p=>p.track===t.id).map(p=>p.id));d.tracks=d.tracks.filter(x=>x.id!==t.id);d.patterns=d.patterns.filter(x=>!p.has(x.id));d.clips=d.clips.filter(x=>!p.has(x.pattern));if(!d.tracks.length){d.tracks.push(track('keys'));const a=pat(d.tracks[0].id);d.patterns.push(a)};selectedClip=''});dlog.close()},
 'pattern-new':patternDialog,
 'pat-create':()=>{newPattern();dlog.close()},'pat-copy':()=>{newPattern(true);dlog.close()},
 'pat-rename':()=>{const p=chosen(), n=$('#pattern-name')?.value.trim();if(p&&n)change(()=>p.name=n);dlog.close()},
 'pat-delete':()=>{const p=chosen();if(!p)return;dialog('Excluir padrão?','<p>O padrão e os clipes que apontam para ele serão removidos. Dá para desfazer.</p><div class="d-actions">'+button('pat-confirm','Excluir padrão','trash',true)+button('close','Cancelar')+'</div>')},
 'pat-confirm':()=>{const p=chosen();if(p)change(()=>{d.patterns=d.patterns.filter(x=>x!==p);d.clips=d.clips.filter(x=>x.pattern!==p.id);selectedClip=''});dlog.close()},
 'auto-clear':()=>change(()=>selected().auto=[])
}
function addAt(t,bar){
 let p=current(t)
 if(!p&&d.patterns.length>=MAX_PATTERNS)return toast('Limite de padrões alcançado.')
 if(p){
  const test={...d,clips:d.clips.slice()}
  if(!arrange(test,p,bar))return toast('O padrão não cabe nessa posição ou cruzaria outro clipe.')
 }
 change(()=>{
  if(!p){p=pat(t.id,d.patterns.length+1);d.patterns.push(p)}
  arrange(d,p,bar)
  trackId=t.id;patternId=p.id;patterns.set(t.id,p.id);selectedClip=d.clips.at(-1).id
 })
}
function toggleStep(b){
 const t=d.tracks.find(x=>x.id===b.dataset.id),at=Number(b.dataset.step)*STEP+stepBar*BAR,m=Number(b.dataset.pitch)
 if(!t)return
 let p=current(t)
 if(!p&&d.patterns.length>=MAX_PATTERNS)return toast('Limite de padrões alcançado.')
 const gone=p?.notes.find(n=>n.at===at&&(n.m===m||PRESETS[t.preset][1]==='drum'))
 if(p&&(!gone&&p.notes.length>=4096))return toast('Limite de notas no padrão.')
 const n=note(at,m,STEP,.86)
 change(()=>{
  if(!p){p=pat(t.id,d.patterns.length+1);d.patterns.push(p);patterns.set(t.id,p.id)}
  if(gone)p.notes=p.notes.filter(x=>x.id!==gone.id);else p.notes.push(n)
 })
 if(!gone)player.preview(t,m,.15).catch(e=>toast(e.message))
}
function chooseClip(c,redraw=true){
 const p=d.patterns.find(a=>a.id===c?.pattern)
 if(!p)return
 selectedClip=c.id
 if(redraw)select(p.track,p)
 else{
  trackId=p.track;patternId=p.id;patterns.set(p.track,p.id);stepBar=0;selectedNote=''
  $$('.clip').forEach(x=>x.classList.toggle('selected',x.dataset.clip===selectedClip))
  $$('.track-label').forEach(x=>x.classList.toggle('selected',x.querySelector('[data-track]')?.dataset.track===trackId))
  rack()
 }
}
let drag=null,skipClick=0
document.addEventListener('pointerdown',e=>{
 if(e.button!==0)return
 const c=e.target.closest('[data-clip]'),n=e.target.closest('[data-note]')
 if(c){
  const info=d.clips.find(x=>x.id===c.dataset.clip), lane=c.closest('.lane'),gridW=parseFloat(getComputedStyle(lane).gridTemplateColumns)
  drag={kind:'clip',node:c,item:info,x:e.clientX,y:e.clientY,w:gridW}
 }else if(n){
  const p=chosen(),info=p?.notes.find(x=>x.id===n.dataset.note)
  if(!info)return
  const grid=n.closest('.piano-grid'),w=grid.getBoundingClientRect().width/(p.bars*BAR)
  drag={kind:'note',node:n,item:info,x:e.clientX,y:e.clientY,w,p,resize:!!e.target.closest('.resize-note')}
 }
 if(drag){try{drag.node.setPointerCapture(e.pointerId)}catch{}}
})
document.addEventListener('pointermove',e=>{
 if(!drag)return
 const dx=e.clientX-drag.x,dy=e.clientY-drag.y
 if(Math.abs(dx)+Math.abs(dy)<4&&!drag.moved)return
 drag.moved=true
 if(drag.resize){drag.node.style.width=Math.max(8,drag.item.len*drag.w+dx-2)+'px'}
 else drag.node.style.transform='translate('+dx+'px,'+(drag.kind==='note'?dy:0)+'px)'
})
document.addEventListener('pointercancel',()=>{if(drag){drag=null;draw()}})
document.addEventListener('pointerup',e=>{
 if(!drag)return
 const b=drag;drag=null
 if(!b.moved)return
 skipClick=performance.now()+120
 const dx=e.clientX-b.x,dy=e.clientY-b.y
 if(b.kind==='clip'){
  const at=b.item.bar+Math.round(dx/b.w),p=d.patterns.find(x=>x.id===b.item.pattern)
  const check={...d,clips:d.clips.filter(x=>x.id!==b.item.id)}
  if(at===b.item.bar){draw();return}
  if(!arrange(check,p,at)){draw();toast('Não cabe nesta posição.');return}
  change(()=>{b.item.bar=at;selectedClip=b.item.id})
 }else{
  const n=b.item,p=b.p
  selectedNote=n.id
  if(b.resize){
   change(()=>n.len=clamp(n.len+Math.round(dx/(b.w*snap))*snap,Math.min(snap,p.bars*BAR-n.at),p.bars*BAR-n.at))
  }else{
   const prev=n.m
   change(()=>{n.at=clamp(n.at+Math.round(dx/(b.w*snap))*snap,0,p.bars*BAR-snap);n.m=clamp(n.m-Math.round(dy/25),0,127);n.len=Math.min(n.len,p.bars*BAR-n.at)})
   if(prev!==n.m)noteWill(p,n)
  }
 }
})
function act(e){
 const b=e.target.closest('button,[data-note]'), now=performance.now()
 if(b?.disabled)return
 if(b?.dataset.cmd){cmds[b.dataset.cmd]?.();return}
 if(b?.dataset.view){view=b.dataset.view;selectedNote='';draw();return}
 if(b?.dataset.mode){if(mic||recWait)return;if(mode!==b.dataset.mode){mode=b.dataset.mode;tick=0;replay(0);draw()}return}
 if(b?.dataset.preview){player.preview(track(b.dataset.preview),PRESETS[b.dataset.preview][1]==='drum'?38:60,.31).catch(e=>toast(e.message));return}
 if(b?.dataset.add){addTrack(b.dataset.add);return}
 if(b?.dataset.toggle){const t=d.tracks.find(x=>x.id===b.dataset.id);const k=b.dataset.toggle;if(t&&['mute','solo'].includes(k))change(()=>t[k]=!t[k]);return}
 if(b?.dataset.track){select(b.dataset.track);return}
 if(b?.dataset.openRoll){view='piano';select(b.dataset.openRoll);return}
 if(b?.dataset.step!==undefined){toggleStep(b);return}
 if(b?.dataset.seek!==undefined){seek(Number(b.dataset.seek));return}
 if(b?.dataset.cell!==undefined){addAt(d.tracks.find(t=>t.id===b.dataset.id),Number(b.dataset.cell));return}
 if(b?.dataset.clip){if(now>=skipClick)chooseClip(d.clips.find(c=>c.id===b.dataset.clip),false);return}
 if(b?.dataset.key!==undefined){player.preview(selected(),Number(b.dataset.key),.28).catch(e=>toast(e.message));return}
 if(b?.dataset.note){if(now>=skipClick){const p=chosen(),n=p?.notes.find(x=>x.id===b.dataset.note);if(n){selectedNote=n.id;noteWill(p,n);draw()}}return}
 if(b?.dataset.autopoint!==undefined){
  const t=selected(),bar=+b.dataset.autopoint,n=t.auto.find(p=>p.bar===bar),val=autoGain(t,bar)
  change(()=>t.auto=n?t.auto.filter(x=>x!==n):t.auto.concat({bar,v:val}).sort((x,y)=>x.bar-y.bar));return
 }
 if(b?.id==='bar-down'||b?.id==='bar-up'){stepBar+=b.id==='bar-down'?-1:1;rack();return}
 const grid=e.target.closest('.piano-grid'),p=chosen()
 if(grid&&p&&now>=skipClick){
  if(p.notes.length>=4096)return toast('Limite de notas no padrão.')
  const size=grid.getBoundingClientRect(),at=clamp(Math.floor(((e.clientX-size.left)/size.width*p.bars*BAR)/snap)*snap,0,p.bars*BAR-snap)
  const m=clamp(Number(grid.dataset.top)-Math.floor((e.clientY-size.top)/25),0,127),n=note(at,m,snap,.82)
  change(()=>{p.notes.push(n);selectedNote=n.id});noteWill(p,n)
 }
}
document.addEventListener('click',act)
document.addEventListener('dblclick',e=>{
 const b=e.target.closest('[data-clip]')
 if(b){view='piano';chooseClip(d.clips.find(x=>x.id===b.dataset.clip))}
})
document.addEventListener('contextmenu',e=>{
 const c=e.target.closest('[data-clip]'),n=e.target.closest('[data-note]')
 if(c){e.preventDefault();selectedClip=c.dataset.clip;removeSelected()}
 if(n){e.preventDefault();selectedNote=n.dataset.note;removeSelected()}
})
document.addEventListener('change',e=>{
 const b=e.target,k=b.dataset.field
 if(b.id==='wav-rate'){exportRate=+b.value;return}
 if(b.id==='wav-depth'){exportDepth=+b.value;return}
 if(b.id==='title'){const n=b.value.trim();if(n&&d.name!==n)change(()=>d.name=n,{restartAudio:false});else b.value=d.name;return}
 if(b.id==='bpm'){const v=clamp(Math.round(+b.value||d.bpm),40,250);change(()=>d.bpm=v);return}
 if(b.id==='sw'){const v=clamp(+b.value/100||0,0,.65);change(()=>d.swing=v);return}
 if(k==='pat'){const p=d.patterns.find(x=>x.id===b.value);if(p){select(p.track,p);if(dlog.open)patternDialog()}return}
 if(k==='auto-track'){select(b.value);return}
 if(k==='bars'){
  const n=clamp(Math.round(+b.value||d.bars),1,MAX_BARS)
  if(d.clips.some(c=>c.bar+(d.patterns.find(p=>p.id===c.pattern)?.bars||1)>n)){toast('Remova os clipes que ficariam fora da playlist antes de encolher.');draw();return}
  change(()=>{d.bars=n;d.loopStart=Math.min(d.loopStart,n-1);d.loopEnd=clamp(d.loopEnd,d.loopStart+1,n);for(const t of d.tracks)t.auto=t.auto.filter(x=>x.bar<n)});return
 }
 if(k==='loopStart'||k==='loopEnd'){const v=Math.round(+b.value||1);change(()=>{if(k==='loopStart')d.loopStart=clamp(v-1,0,d.loopEnd-1);else d.loopEnd=clamp(v,d.loopStart+1,d.bars)});return}
 const p=chosen()
 if(k==='patsize'&&p){
  const n=clamp(Math.round(+b.value||1),1,selected().preset==='sample'?MAX_BARS:16);if(n===p.bars)return
  const draft={...d,clips:d.clips.filter(c=>c.pattern!==p.id)}
  for(const c of d.clips.filter(c=>c.pattern===p.id))if(!arrange(draft,{...p,bars:n},c.bar)){draw();toast('O tamanho cruza outro clipe. Mova ou remova os clipes primeiro.');return}
  change(()=>{p.bars=n;p.notes=p.notes.filter(x=>x.at<n*BAR);p.notes.forEach(x=>x.len=Math.min(x.len,n*BAR-x.at))});return
 }
 if(k==='velocity'&&p){const n=p.notes.find(x=>x.id===selectedNote);if(n)change(()=>n.v=clamp(+b.value/100||.8,.05,1));return}
 if(k==='snap'){snap=+b.value;return}
 if(k==='octave'){octave=clamp(+b.value||0,0,8);draw();return}
 if(b.dataset.mix){
  const t=d.tracks.find(t=>t.id===b.dataset.id),v=+b.value,m=b.dataset.mix
  if(b.dataset.id==='master')change(()=>d.master=v)
  else if(t&&['vol','pan','low','delay','verb','drive'].includes(m))change(()=>t[m]=v)
  return
 }
 if(b.dataset.auto!==undefined){
  const t=selected(),bar=+b.dataset.auto,v=Number(b.value)
  change(()=>t.auto=t.auto.filter(a=>a.bar!==bar).concat({bar,v}).sort((a,b)=>a.bar-b.bar))
 }
})
document.addEventListener('input',e=>{
 const b=e.target,k=b.dataset.mix
 if(!k)return
 const val=+b.value
 b.parentElement.querySelector('.mval').textContent=k==='low'?val+' Hz':k==='pan'?Math.round(val*50):Math.round(val*100)+'%'
 const g=player.g
 if(!g)return
 if(b.dataset.id==='master')g.main.gain.value=val
 else{
  const t=g.channels.get(b.dataset.id)
  if(k==='vol'&&t?.audible)t.gain.gain.value=val
  if(k==='pan'&&t)t.pan.pan.value=val
  if(k==='low'&&t)t.tone.frequency.value=val
 }
})
let pickerBusy=false
$('#project-file').addEventListener('change',async e=>{
 const f=e.target.files[0];e.target.value='';if(!f||pickerBusy)return
 if(f.size>96*1024*1024)return toast('Projeto acima do limite de 96 MB.')
 pickerBusy=true
 try{
  const p=/\.midi?$/i.test(f.name)?importMidi(await f.arrayBuffer(),f.name.replace(/\.midi?$/i,'')):sanitize(JSON.parse(await f.text()))
  if(dlog.open)dlog.close();load(p);waveform.clear();updateWave();toast('Projeto aberto: '+p.name)
 }catch(e){toast(e.message||'Não consegui abrir o projeto.')}
 finally{pickerBusy=false}
})
$('#audio-file').addEventListener('change',async e=>{
 const f=e.target.files[0];e.target.value='';if(!f)return
 try{await addAudio(f,f.name.replace(/\.[^.]+$/,''),sampleTarget)}catch(e){toast(e.message)}
})
editor.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy'}})
editor.addEventListener('drop',async e=>{
 if(!e.dataTransfer.files.length)return
 e.preventDefault()
 const loc=e.target.closest('[data-cell]')
 try{const f=e.dataTransfer.files[0];await addAudio(f,f.name.replace(/\.[^.]+$/,''),'',loc?+loc.dataset.cell:null)}catch(e){toast(e.message)}
})
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&dlog.open)return
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveNow(true);return}
 if(e.target.matches('input,textarea,select')||e.target.isContentEditable||dlog.open)return
 if(e.code==='Space'&&!e.target.matches('button,[role=button]')){e.preventDefault();play();return}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();restore(e.shiftKey?'redo':'undo');return}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected()}
})
window.addEventListener('pagehide',()=>{if(mic)mic.capture.finish();if(saveTimer)void saveNow(false)})
sync();library();draw()
try{const state=await read();if(state&&history.length===0&&!player.playing&&!pending){d=state;sync();draw();updateWave();$('#save-status').textContent=' • salvo'}}catch{noAuto=true;$('#save-status').textContent=' • backup manual'}
function activeFx(){
 if(fxTarget!=='master'&&!d.tracks.some(t=>t.id===fxTarget))fxTarget='master'
 const tr=d.tracks.find(t=>t.id===fxTarget)
 return tr?(tr.fx||[]):(d.masterFx||[])
}
function replaceFx(a){
 const tr=d.tracks.find(t=>t.id===fxTarget)
 if(tr)tr.fx=a
 else d.masterFx=a
}
function fxBadge(name,k,title,disabled=false){
 return '<button class="fx-icon" aria-label="'+title+'" title="'+title+'" data-fx-act="'+k+'" '+(disabled?'disabled':'')+'>'+name+'</button>'
}
function fxFormat(key,unit,value){
 if(key==='division')return DELAY_LABELS[value-1]||'1/8'
 const num=Number.isInteger(value)?String(value):String(Number(value.toFixed(2)))
 return num+(unit?(unit==='%'||unit===':1'?unit:' '+unit):'')
}
function pluginsView(){
 const chain=activeFx()
 if(!chain.some(s=>s.id===fxSelected))fxSelected=chain[0]?.id||''
 const active=chain.find(s=>s.id===fxSelected), info=FX_TYPES[active?.type]
 const options='<option value="master" '+(fxTarget==='master'?'selected':'')+'>Master / saída estéreo</option>'+d.tracks.map(t=>'<option value="'+t.id+'" '+(fxTarget===t.id?'selected':'')+'>'+escaped(t.name)+'</option>').join('')
 const target='<select data-field="fx-target" aria-label="Canal da cadeia">'+options+'</select>'
 const opts=Object.entries(FX_TYPES).map(([k,v])=>'<option value="'+k+'" '+(fxType===k?'selected':'')+'>'+v.name+'</option>').join('')
 let out=header('INSERTS   /   DO TOPO PARA BAIXO','Cadeia de plugins',target+button('fx-presets','Presets','wave'))
 out+='<section class="fx-rack" aria-label="Cadeia de efeitos"><div class="fx-stack"><div class="fx-caption"><span>ORDEM DO SINAL</span><b>'+pad(chain.length)+' / '+FX_LIMIT+'</b></div>'
 if(!chain.length)out+='<p class="fx-quiet">Nenhum insert. Adicione um efeito ou carregue uma cadeia de voz ou master.</p>'
 chain.forEach((s,i)=>{
  const v=FX_TYPES[s.type]
  if(!v)return
  out+='<div class="fx-slot '+(fxSelected===s.id?'active':'')+(s.bypass?' bypass':'')+'" style="--fx:'+v.color+'"><button class="fx-pick" data-fx-pick="'+s.id+'" title="'+escaped(v.desc)+'"><span class="fx-code">'+v.code+'</span><span><b>'+v.name+'</b><small>'+pad(i+1)+' · '+(s.bypass?'bypass':v.group)+'</small></span></button><button class="fx-icon power '+(!s.bypass?'on':'')+'" data-fx-bypass="'+s.id+'" aria-label="Bypass: '+v.name+'" aria-pressed="'+s.bypass+'" title="Bypass">⏻</button></div>'
 })
 out+='<div class="fx-add"><select data-field="fx-type" aria-label="Plugin para adicionar">'+opts+'</select><button class="btn primary" data-cmd="fx-add" '+(chain.length>=FX_LIMIT?'disabled':'')+'>'+ic('plus')+' Plugin</button></div></div><div class="fx-face">'
 if(!info)out+='<div class="fx-zero"><span class="fx-zero-icon">'+ic('wave')+'</span><h3>Crie seu som</h3><p>Doze efeitos nativos em cadeia. O mesmo processamento vai para o WAV.</p></div>'
 else{
  const loc=chain.indexOf(active)
  out+='<div class="fx-head" style="--fx:'+info.color+'"><div><span class="eyebrow">'+info.group.toUpperCase()+' • '+info.code+'</span><h3>'+info.name+'</h3></div><div class="fx-controls">'+fxBadge('↑','up','Mover plugin para cima',loc===0)+fxBadge('↓','down','Mover plugin para baixo',loc===chain.length-1)+fxBadge(ic('undo'),'reset','Restaurar parâmetros')+fxBadge(ic('trash'),'remove','Remover plugin')+'</div></div><p class="fx-desc">'+escaped(info.desc)+(info.worklet?' <span>AudioWorklet</span>':'')+'</p>'
  out+='<div class="fx-knobs">'+Object.entries(info.params).map(([k,f])=>{
   const v=active.params[k],label=f[0]
   if(Object.hasOwn(FX_CHOICES,k))return '<label class="fx-knob">'+label+'<select data-fx-param="'+k+'" aria-label="'+label+'">'+FX_CHOICES[k].map((n,i)=>'<option value="'+i+'" '+(i===v?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'
   if(k==='division')return '<label class="fx-knob">'+label+'<select data-fx-param="'+k+'" aria-label="'+label+'">'+DELAY_LABELS.map((n,i)=>'<option value="'+(i+1)+'" '+(i+1===v?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'
   return '<label class="fx-knob"><div>'+label+'<output>'+fxFormat(k,f[5],v)+'</output></div><input type="range" data-fx-param="'+k+'" aria-label="'+label+'" min="'+f[1]+'" max="'+f[2]+'" step="'+f[3]+'" value="'+v+'" style="accent-color:'+info.color+'"></label>'
  }).join('')+'</div>'
 }
 return out+'</div></section><div class="hints">Bypass mantém os ajustes. Cada faixa e o master têm a própria cadeia. Plugins são originais do Onda, não arquivos VST.</div>'
}
function manageFx(kind){
 const chain=activeFx(),i=chain.findIndex(s=>s.id===fxSelected)
 if(i<0)return
 change(()=>{
  const a=chain.slice(),item=a[i]
  if(kind==='up'&&i>0)[a[i],a[i-1]]=[a[i-1],a[i]]
  if(kind==='down'&&i<a.length-1)[a[i],a[i+1]]=[a[i+1],a[i]]
  if(kind==='remove'){a.splice(i,1);fxSelected=a[Math.min(i,a.length-1)]?.id||''}
  if(kind==='reset'){a[i]={...fxSlot(item.type),id:item.id,bypass:item.bypass}}
  replaceFx(a)
 })
}
Object.assign(cmds,{
 'fx-add':()=>{
  const a=activeFx(),s=fxSlot(fxType)
  if(!s||a.length>=FX_LIMIT)return
  change(()=>{replaceFx([...a,s]);fxSelected=s.id})
 },
 'fx-presets':()=>dialog('Presets de plugins','<p>Escolha uma cadeia para o canal selecionado. Ela substitui os inserts atuais, mas dá pra desfazer.</p><div class="fx-presets">'+Object.entries(FXS_PRESETS).map(([key,p])=>'<button class="fx-preset" data-fx-preset="'+key+'"><b>'+p.name+'</b><span>'+p.desc+'</span></button>').join('')+'</div>')
})
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-fx-act],[data-fx-pick],[data-fx-bypass],[data-fx-preset]')
 if(!el||el.disabled)return
 const set=el.dataset
 if(set.fxPick){fxSelected=set.fxPick;draw();return}
 if(set.fxAct){manageFx(set.fxAct);return}
 if(set.fxBypass){
  const slot=activeFx().find(s=>s.id===set.fxBypass)
  if(slot)change(()=>slot.bypass=!slot.bypass)
 }
 if(set.fxPreset&&Object.hasOwn(FXS_PRESETS,set.fxPreset)){
  const slots=fxPreset(set.fxPreset)
  change(()=>{replaceFx(slots);fxSelected=slots[0]?.id||''});dlog.close()
 }
})
document.addEventListener('change',e=>{
 const el=e.target,k=el.dataset.field
 if(k==='fx-target'){fxTarget=el.value;fxSelected='';draw();return}
 if(k==='fx-type'){fxType=el.value;return}
 if(el.dataset.fxParam){
  const slot=activeFx().find(s=>s.id===fxSelected)
  if(!slot||!Object.hasOwn(FX_TYPES[slot.type].params,el.dataset.fxParam))return
  const val=Number(el.value),param=el.dataset.fxParam
  change(()=>slot.params=fxSlot(slot.type,{...slot.params,[param]:val}).params)
 }
})
document.addEventListener('input',e=>{
 const el=e.target,k=el.dataset.fxParam
 if(!k)return
 const slot=activeFx().find(s=>s.id===fxSelected),out=el.parentElement.querySelector('output')
 if(out&&slot)out.textContent=fxFormat(k,FX_TYPES[slot.type].params[k][5],Number(el.value))
})
