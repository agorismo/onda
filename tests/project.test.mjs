import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blank,demo,track,pat,clip,note,BAR,STEP,contents,sanitize,arrange} from '../project.mjs'
import {wav,autoGain} from '../audio.mjs'
import {midi,importMidi} from '../midi.mjs'

test('playlist renders the occupied bars, without the loop limiting export',()=>{
 const d=demo()
 d.loopEnd=1
 const a=contents(d)
 assert.equal(a.bars,8)
 assert.ok(a.events.some(e=>e.at>BAR*6))
 assert.ok(a.events.every((e,i)=>i===0||a.events[i-1].at<=e.at))
 assert.ok(a.events.some(e=>e.at%STEP!==0))
})
test('pattern playback does not reuse unrelated clips',()=>{
 const d=demo()
 const chosen=d.patterns[4]
 const {events,bars}=contents(d,'pattern',chosen.id)
 assert.equal(bars,2)
 assert.equal(events.length,chosen.notes.length)
 assert.ok(events.every(e=>e.t.id===chosen.track))
})
test('clip placement rejects overlap and out-of-range bars',()=>{
 const d=blank(),p=d.patterns[0]
 p.bars=2
 assert.equal(arrange(d,p,1),false)
 assert.equal(arrange(d,p,7),false)
 assert.equal(arrange(d,p,2),true)
 assert.equal(d.clips.length,2)
})
test('editable project round trip preserves oscillator, sample, fades and automation',()=>{
 const d=demo()
 const t=track('sample',7,'Voz'),p=pat(t.id,7)
 const n=note(96,60,50,.6)
 Object.assign(t,{sample:'data:audio/wav;base64,UklGRg==',sampleIn:.2,sampleOut:.9,fadeIn:.038,fadeOut:.25,auto:[{bar:2,v:.3}],pan:-.22})
 p.notes=[n];d.tracks.push(t);d.patterns.push(p);d.clips.push(clip(p.id,2))
 const q=sanitize(JSON.parse(JSON.stringify(d)))
 const u=q.tracks.at(-1)
 assert.equal(q.name,d.name)
 assert.equal(u.sample,t.sample)
 assert.equal(u.fadeIn,t.fadeIn)
 assert.equal(u.sampleOut,t.sampleOut)
 assert.equal(u.pan,t.pan)
 assert.equal(contents(q).events.length,contents(d).events.length)
 assert.ok(Math.abs(autoGain(u,1)-.65)<1e-9)
})
test('invalid input and malformed sample data are handled',()=>{
 assert.throws(()=>sanitize({version:7}))
 const d=blank()
 d.tracks[0].sample='https://fake.invalid/leak.wav'
 d.bpm=9000
 const e=sanitize(d)
 assert.equal(e.tracks[0].sample,null)
 assert.equal(e.bpm,250)
})
test('MIDI exports and imports pitched notes and drums with tempo',async ()=>{
 const d=demo()
 const b=await midi(d).arrayBuffer()
 const e=importMidi(b,'Volta')
 assert.equal(e.name,'Volta')
 assert.equal(e.bpm,d.bpm)
 assert.ok(e.tracks.some(t=>t.preset==='kick'))
 assert.ok(e.tracks.some(t=>t.preset==='keys'))
 assert.ok(contents(e).events.length>40)
})
test('stereo WAV contains interleaved PCM with expected header and clipped audio',async ()=>{
 const block=[new Float32Array([0,.5,-1]),new Float32Array([1.4,-.5,0])]
 const b=await wav({length:3,numberOfChannels:2,sampleRate:44100,getChannelData:c=>block[c]}).arrayBuffer()
 const v=new DataView(b)
 assert.equal(Buffer.from(b).subarray(0,4).toString(),'RIFF')
 assert.equal(v.getUint16(22,true),2)
 assert.equal(v.getUint32(24,true),44100)
 assert.equal(v.getInt16(46,true),32767)
 assert.equal(v.getInt16(52,true),-32768)
 assert.equal(v.getUint32(40,true),12)
})

test('plugin chains stay ordered in .onda with untrusted values clamped',async ()=>{
 const {fxPreset,fxSlot,FX_LIMIT}=await import('../fx-catalog.mjs')
 const d=demo()
 d.tracks[0].fx=[fxSlot('sat',{amount:8},true),fxSlot('pitch',{scale:2,root:20,str:900})]
 d.masterFx=fxPreset('master')
 const p=sanitize(JSON.parse(JSON.stringify(d)))
 assert.deepEqual(p.tracks[0].fx.map(f=>f.type),['sat','pitch'])
 assert.equal(p.tracks[0].fx[0].bypass,true)
 assert.equal(p.tracks[0].fx[1].params.root,11)
 assert.equal(p.tracks[0].fx[1].params.str,100)
 assert.deepEqual(p.masterFx.map(f=>f.type),['eq','comp','limit'])
 assert.ok(p.masterFx.length<FX_LIMIT)
})
test('24-bit PCM preserves signed samples in the proper byte order',async ()=>{
 const {pcmWav}=await import('../recorder.mjs')
 const b=await pcmWav([{data:[new Float32Array([-.5,1,-1])],offset:0}],3,48000,1,24).arrayBuffer()
 const v=new DataView(b),a=new Uint8Array(b)
 assert.equal(v.getUint16(34,true),24)
 assert.equal(v.getUint32(24,true),48000)
 assert.equal(v.getUint32(40,true),9)
 assert.equal(v.getUint32(4,true),46)
 assert.deepEqual([...a.subarray(44,53)],[0,0,192,255,255,127,0,0,128])
})
