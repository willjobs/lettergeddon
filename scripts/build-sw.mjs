import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
function files(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(`${dir}/${e.name}`, `${prefix}${e.name}/`)
        : [`${prefix}${e.name}`],
    )
    .filter((p) => p !== "sw.js");
}
const assets = files("dist");
const hash = createHash("sha256");
for (const p of assets) hash.update(readFileSync(`dist/${p}`));
const cache = `lettergeddon-${hash.digest("hex").slice(0, 16)}`;
writeFileSync(
  "dist/sw.js",
  `const CACHE=${JSON.stringify(cache)};const ASSETS=${JSON.stringify(["./", ...assets])};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('lettergeddon-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(caches.open(CACHE).then(async cache=>{const hit=await cache.match(event.request,{ignoreVary:true});if(hit)return hit;try{return await fetch(event.request);}catch(error){if(event.request.mode==='navigate')return (await cache.match('./'))||Response.error();throw error;}}));});
`,
);
