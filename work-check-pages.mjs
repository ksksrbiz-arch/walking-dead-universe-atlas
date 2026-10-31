for(const host of ['walking-dead-universe-atlas.pages.dev','3b71fe72.walking-dead-universe-atlas.pages.dev','walking-dead-universe-atlas.vercel.app']){
 const r=await fetch('https://'+host+'/?accuracy='+Date.now());const t=await r.text();
 console.log(host,r.status,r.headers.get('cf-cache-status'),r.headers.get('cache-control'),t.match(/assets\/index-[\w-]+\.js/g));
}
