import { readFile, writeFile } from 'node:fs/promises'
const get=n=>readFile(new URL(n,import.meta.url),'utf8')
const modules=['fx-catalog.mjs','project.mjs','processor.mjs','fx-engine.mjs','audio.mjs','recorder.mjs','storage.mjs','midi.mjs','app.mjs']
const body=(await Promise.all(modules.map(get))).map((code,i)=>'// '+modules[i]+'\n'+code.replace(/^import .*$/gm,'').replace(/^export (?=(async |const |function |class ))/gm,'')).join('\n')
const svg=encodeURIComponent(await get('assets/icon.svg'))
const style=await get('styles.css')
let html=(await get('index.html')).replace('href="./assets/icon.svg"','href="data:image/svg+xml,'+svg+'"').replace('<link rel="stylesheet" href="./styles.css">',()=>'<style>'+style+'</style>')
html=html.replace('<script type="module" src="./app.mjs"></script>',()=>'<script type="module">\n'+body+'</script>')
if(process.argv[2])await writeFile(process.argv[2],html)
else await writeFile('Onda-Abrir.html',html)
