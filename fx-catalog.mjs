// Param descriptions: [label, min, max, step, default, unit].
export const FX_TYPES={
 pitch:{name:'Afinação Vocal',group:'Voz',code:'PV',desc:'Correção monofônica para voz isolada. Escolha tonalidade, velocidade e intensidade; não use no mix completo.',worklet:true,color:'#d9a6df',params:{
   root:['Tonalidade',0,11,1,0,''],scale:['Escala',0,2,1,0,''],str:['Intensidade',0,100,1,75,'%'],speed:['Resposta',20,320,1,90,'ms'],mix:['Mistura',0,100,1,100,'%']}},
 eq:{name:'EQ Paramétrico',group:'Tonal',code:'EQ',desc:'Corte de graves, shelves nas pontas e duas bandas paramétricas.',worklet:false,color:'#9bcebc',params:{
   hp:['Corte de grave',20,500,1,75,'Hz'],lo:['Graves · ganho',-15,15,.1,0,'dB'],lmHz:['Médio grave · freq.',100,5500,1,320,'Hz'],lm:['Médio grave · ganho',-15,15,.1,-2.5,'dB'],lmQ:['Médio grave · Q',.1,12,.1,1.2,''],hiHz:['Presença · freq.',250,14000,1,3500,'Hz'],hi:['Presença · ganho',-15,15,.1,2,'dB'],hiQ:['Presença · Q',.1,12,.1,1,''],air:['Ar · ganho',-15,15,.1,1,'dB'],out:['Saída',-18,12,.1,0,'dB']}},
 comp:{name:'Compressor',group:'Dinâmica',code:'CP',desc:'Reduz picos. Ataque, release, joelho, razão e compensação independentes.',worklet:false,color:'#f0b682',params:{
   th:['Limiar',-60,0,.1,-20,'dB'],ratio:['Razão',1,20,.1,3.5,':1'],atk:['Ataque',.1,150,.1,12,'ms'],rel:['Release',15,1000,1,130,'ms'],knee:['Joelho',0,35,.1,12,'dB'],make:['Compensação',-12,24,.1,3,'dB'],mix:['Mistura',0,100,1,100,'%']}},
 deesser:{name:'De-esser',group:'Dinâmica',code:'DS',desc:'Reduz a banda aguda quando os esses sobressaem, sem baixar o grave junto.',worklet:true,color:'#ecc48c',params:{
   freq:['Divisão',2500,12500,1,6200,'Hz'],th:['Limiar da banda',-70,0,.1,-34,'dB'],ratio:['Razão',1,20,.1,5,':1'],range:['Atenuação máx.',0,24,.1,9,'dB'],rel:['Release',10,350,1,65,'ms']}},
 gate:{name:'Noise Gate',group:'Dinâmica',code:'GT',desc:'Fecha a faixa quando o nível cai, com histerese, hold e piso ajustáveis.',worklet:true,color:'#d9b5a7',params:{
   th:['Limiar',-90,-5,.1,-50,'dB'],floor:['Piso',-90,0,.1,-36,'dB'],atk:['Ataque',.1,80,.1,4,'ms'],hold:['Hold',0,400,1,50,'ms'],rel:['Release',5,1000,1,130,'ms']}},
 sat:{name:'Saturação',group:'Cor',code:'ST',desc:'Drive suave com oversampling 4×, controle de cor, mistura e saída.',worklet:false,color:'#ed9f8d',params:{
   amount:['Drive',0,30,.1,8,'dB'],tone:['Cor',500,20000,10,9000,'Hz'],mix:['Mistura',0,100,1,36,'%'],out:['Saída',-24,12,.1,-1,'dB']}},
 chorus:{name:'Chorus Estéreo',group:'Modulação',code:'CH',desc:'Duas vozes de delay moduladas em oposição para abrir o estéreo.',worklet:false,color:'#acb8ea',params:{
   rate:['Velocidade',.05,6,.05,.7,'Hz'],depth:['Profundidade',.2,12,.1,4,'ms'],delay:['Atraso base',13,35,.1,17,'ms'],mix:['Mistura',0,100,1,27,'%']}},
 delay:{name:'Delay Sincronizado',group:'Tempo e espaço',code:'DL',desc:'Eco no tempo do projeto com feedback filtrado.',worklet:false,color:'#a6cddf',params:{
   division:['Divisão (1–8)',1,8,1,5,''],fb:['Feedback',0,73,1,31,'%'],tone:['Corte do eco',400,18000,10,5300,'Hz'],mix:['Mistura',0,100,1,23,'%']}},
 verb:{name:'Reverb Sala',group:'Tempo e espaço',code:'RV',desc:'Convolução estéreo com cauda gerada, pré-delay e filtro de cor.',worklet:false,color:'#b2b7e3',params:{
   size:['Cauda',.2,4,.1,1.8,'s'],pre:['Pré-delay',0,140,1,28,'ms'],tone:['Cor',400,18000,10,7100,'Hz'],mix:['Mistura',0,100,1,20,'%']}},
 limit:{name:'Limiter',group:'Master',code:'LM',desc:'Atuação estéreo ligada com lookahead. Limita picos de amostra, não true peak.',worklet:true,color:'#e6cf85',params:{
   ceiling:['Teto',-18,0,.1,-1,'dBFS'],drive:['Ganho de entrada',-12,20,.1,2,'dB'],rel:['Release',5,400,1,70,'ms']}},
 width:{name:'Imagem Estéreo',group:'Master',code:'MS',desc:'Matriz mid/side. 0% soma em mono; 100% preserva a abertura.',worklet:false,color:'#93cbbf',params:{
   amt:['Abertura',0,200,1,112,'%'],out:['Saída',-18,12,.1,0,'dB']}},
 trem:{name:'Tremolo',group:'Modulação',code:'TR',desc:'Modulação de volume com velocidade e intensidade reguláveis.',worklet:false,color:'#b6a1e9',params:{
   rate:['Velocidade',.1,14,.05,4,'Hz'],depth:['Profundidade',0,100,1,34,'%'],mix:['Mistura',0,100,1,80,'%']}}
}
export const FX_LIMIT=10
export const DELAY_GRID=[1/8,1/6,1/4,1/3,.5,.75,1,2]
export const FX_CHOICES={root:['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'],scale:['Cromática','Maior','Menor natural']}
export const DELAY_LABELS=['1/32','1/16 tercina','1/16','1/8 tercina','1/8','1/8 pontuada','1/4','1/2']
export const FXS_PRESETS={
 voice:{name:'Voz próxima',desc:'Gate moderado, EQ, de-esser, compressor e sala discreta.',nodes:[
  ['gate',{th:-53,floor:-23,hold:65,rel:145}],['eq',{hp:85,lm:-2.8,hi:1.7,air:1.1}],['deesser',{th:-37,range:7}],['comp',{th:-19,ratio:3,make:2.5}],['verb',{size:1.1,pre:31,mix:9}]]},
 warm:{name:'Voz quente',desc:'Voz presente com drive suave e eco curto.',nodes:[
  ['eq',{hp:73,lm:-1.3,hi:1.2,air:0}],['comp',{th:-22,atk:9,ratio:2.8,make:2}],['sat',{amount:5,mix:25,out:-1}],['delay',{division:4,fb:18,mix:12}]]},
 room:{name:'Sala ampla',desc:'Abertura, chorus e cauda estéreo.',nodes:[
  ['eq',{hp:115,lm:-2,hi:0,air:0}],['chorus',{depth:3,mix:18,rate:.5}],['verb',{size:2.4,pre:39,mix:26}],['width',{amt:115}]]},
 master:{name:'Master suave',desc:'EQ discreto, compressão leve e teto de pico.',nodes:[
  ['eq',{hp:24,lo:0,lm:0,hi:0,air:.6}],['comp',{th:-12,ratio:1.7,atk:25,make:1,mix:70}],['limit',{drive:1.3,ceiling:-1.2}]]}
}
export const fxClamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x))
export function fxSlot(type,patch={},bypass=false){
 if(!Object.hasOwn(FX_TYPES,type))return null
 const params={}
 for(const [k,f] of Object.entries(FX_TYPES[type].params)){
  const v=patch?.[k];params[k]=typeof v==='number'&&Number.isFinite(v)?fxClamp(v,f[1],f[2]):f[4]
  if(k==='division'||k==='root'||k==='scale')params[k]=Math.round(params[k])
 }
 return {id:globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2),type,bypass:!!bypass,params}
}
export const fxClean=list=>Array.isArray(list)?list.slice(0,FX_LIMIT).map(s=>s&&fxSlot(s.type,s.params,s.bypass===true)).filter(Boolean):[]
export const fxPreset=key=>FXS_PRESETS[key]?.nodes.map(([k,v])=>fxSlot(k,v))||[]
