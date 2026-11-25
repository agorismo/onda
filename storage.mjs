const ready=()=>new Promise((resolve,reject)=>{
 const req=indexedDB.open('onda-workstation-v1',1)
 req.onupgradeneeded=()=>req.result.createObjectStore('projects')
 req.onerror=()=>reject(req.error)
 req.onsuccess=()=>resolve(req.result)
})
export async function read(){
 const db=await ready()
 return new Promise((resolve,reject)=>{const tx=db.transaction('projects');const r=tx.objectStore('projects').get('working');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close()})
}
export async function write(project){
 const db=await ready()
 return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(project,'working');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})
}
