// Vérification ponctuelle (0 crédit) des pages publiques de compétitions de ffhandball.fr.
// robots.txt autorise tous les robots ; robot identifié honnêtement, 2 s entre les pages. Résultat : debug-handball.json
const fs = require('fs');
const UA = 'MyLocalMatch/1.0 (+https://github.com/clemseign-hue/mylocalmatch-live-data)';
const BASE = 'https://www.ffhandball.fr';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function page(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  await sleep(2000);
  return { status: r.status, url: r.url, text };
}
const links = (text, re) => [...new Set([...text.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(h => re.test(h)))];

(async () => {
  const out = {};
  const home = await page(`${BASE}/competitions/`);
  out.home = { status: home.status, url: home.url, compLinks: links(home.text, /\/competitions\/saison-/).slice(0, 80) };
  // Données embarquées dans la page (attributs data-*, JSON)
  out.home.dataAttrs = [...new Set([...home.text.matchAll(/\s(data-[a-z\-]+)=/g)].map(m => m[1]))].slice(0, 40);
  out.home.jsonBlocks = [...home.text.matchAll(/<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]{0,400})/g)].map(m => m[1]).slice(0, 5);
  // Contenu de l'attribut data-cfk (configuration des blocs de la page)
  out.home.cfk = [...home.text.matchAll(/data-cfk="([^"]{0,600})/g)].map(m => m[1]).slice(0, 3);
  // Index public de l'API WordPress : liste des espaces de noms et routes exposés par le site
  const idx = await page(`${BASE}/wp-json/`);
  try {
    const j = JSON.parse(idx.text);
    out.wpjson = { status: idx.status, namespaces: j.namespaces, routes: Object.keys(j.routes || {}).filter(r => !/^\/wp\/v2|oembed|yoast|contact-form|wp-site-health|batch/.test(r)).slice(0, 80) };
  } catch { out.wpjson = { status: idx.status, sample: idx.text.slice(0, 300) }; }
  // Une page « régional » si on en trouve une
  const regional = out.home.compLinks.find(l => /regional|auvergne|aura/i.test(l));
  if (regional) {
    const p = await page(new URL(regional, BASE).href);
    out.regional = { status: p.status, url: p.url, links: links(p.text, /\/competitions\//).slice(0, 80), sample: p.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000) };
  }
  fs.writeFileSync('debug-handball.json', JSON.stringify(out, null, 2));
  console.log(out.home.compLinks.length, 'liens ; régional :', regional || 'aucun');
})();
