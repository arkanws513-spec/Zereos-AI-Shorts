/* ZEREOS AI Shorts storage adapter: IndexedDB now, cloud adapter later. */
(() => {
  'use strict';
  const DB_NAME='zereos-shorts-db', DB_VERSION=2, PROJECTS='projects', MEDIA='media';
  const ACTIVE_KEY='zereos-shorts-active-project';
  let dbPromise;
  function openDB(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(PROJECTS)){
          const store=db.createObjectStore(PROJECTS,{keyPath:'id'});
          store.createIndex('updatedAt','updatedAt');
        }
        if(!db.objectStoreNames.contains(MEDIA)){
          const store=db.createObjectStore(MEDIA,{keyPath:'id'});
          store.createIndex('projectId','projectId');
          store.createIndex('createdAt','createdAt');
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('تعذر فتح قاعدة البيانات المحلية'));
      req.onblocked=()=>reject(new Error('أغلق النسخ الأخرى من الاستوديو ثم أعد المحاولة'));
    });
    return dbPromise;
  }
  async function run(storeName,mode,action){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,mode),store=tx.objectStore(storeName);
      let request;
      try{request=action(store)}catch(e){reject(e);return}
      tx.oncomplete=()=>resolve(request&&'result'in request?request.result:request);
      tx.onerror=()=>reject(tx.error||new Error('فشلت عملية التخزين'));
      tx.onabort=()=>reject(tx.error||new Error('أُلغيت عملية التخزين'));
    });
  }
  async function read(storeName,action){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      let req;
      try{req=action(db.transaction(storeName,'readonly').objectStore(storeName))}catch(e){reject(e);return}
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('تعذرت قراءة البيانات'));
    });
  }
  const local={
    async listProjects(){return (await read(PROJECTS,s=>s.getAll())||[]).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))},
    async getProject(id){return (await read(PROJECTS,s=>s.get(id)))||null},
    async saveProject(project){
      const now=Date.now(),record={...project,updatedAt:now,createdAt:project.createdAt||now,schemaVersion:2};
      await run(PROJECTS,'readwrite',s=>s.put(record));
      try{localStorage.setItem(ACTIVE_KEY,record.id)}catch(_){}
      return record;
    },
    async deleteProject(id){await run(PROJECTS,'readwrite',s=>s.delete(id));try{if(localStorage.getItem(ACTIVE_KEY)===id)localStorage.removeItem(ACTIVE_KEY)}catch(_){}},
    async activeProjectId(){try{return localStorage.getItem(ACTIVE_KEY)}catch(_){return null}},
    setActiveProjectId(id){try{localStorage.setItem(ACTIVE_KEY,id)}catch(_){}},
    async listMedia(projectId){
      const all=await read(MEDIA,s=>s.getAll());
      return (all||[]).filter(item=>!projectId||item.projectId===projectId).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    },
    async getMedia(id){return (await read(MEDIA,s=>s.get(id)))||null},
    async saveMedia(item){
      const record={...item,id:item.id||'media-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),createdAt:item.createdAt||Date.now()};
      await run(MEDIA,'readwrite',s=>s.put(record));return record;
    },
    async deleteMedia(id){await run(MEDIA,'readwrite',s=>s.delete(id))},
    async usage(){if(navigator.storage?.estimate)return navigator.storage.estimate();return null}
  };
  // Cloud sync can be added as another adapter implementing this same contract.
  window.ZereosStorage=Object.freeze({local,async getAdapter(){return local},async estimate(){return local.usage()}});
})();