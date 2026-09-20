'use strict';
// Scan Met object IDs and print only records worth showing: public domain, has an
// image, and has a REAL title (not the placeholder "Print" that thousands carry).
const https=require('https');
function getJson(url){return new Promise((res,rej)=>{https.get(url,{headers:{'User-Agent':'desk-art/1.0'}},r=>{
  if(r.statusCode!==200){r.resume();rej(new Error('HTTP '+r.statusCode));return;}
  let b='';r.setEncoding('utf8');r.on('data',c=>b+=c);r.on('end',()=>{try{res(JSON.parse(b))}catch(e){rej(e)}});
}).on('error',rej)});}
const BAD_TITLE=/^(print|untitled|drawing|fragment|sheet|page|album leaf|study|plate \d+)$/i;
(async()=>{
  const q=process.argv[2]||'landscape';
  const dept=process.argv[3]||'';
  const want=Number(process.argv[4]||12);
  const url=`https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(q)}`
    +`&hasImages=true&isPublicDomain=true${dept?`&departmentId=${dept}`:''}`;
  const ids=(await getJson(url)).objectIDs||[];
  console.log(`# "${q}" dept=${dept||'all'} -> ${ids.length} candidates`);
  let found=0;
  for(const id of ids){
    if(found>=want)break;
    let d;try{d=await getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)}catch{continue}
    if(!d.isPublicDomain||!d.primaryImage)continue;
    const t=(d.title||'').trim();
    if(!t||BAD_TITLE.test(t))continue;
    found++;
    console.log(`${d.objectID}\t${(d.artistDisplayName||'?').slice(0,26)}\t${t.slice(0,52)}\t${(d.objectDate||'').slice(0,14)}\t${d.classification||''}`);
  }
})().catch(e=>{console.error(e.message);process.exit(1)});
