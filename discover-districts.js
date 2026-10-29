// Exploration ponctuelle de l'API FFF : quelles requêtes listent les compétitions d'un district ?
// Lancement manuel uniquement (≈1 crédit ScraperAPI par requête). Résultat : debug-discovery.json
const fs = require('fs');
const API_KEY = process.env.SCRAPER_API_KEY;
const DOFA = 'https://api-dofa.fff.fr/api';

async function get(url) {
  let res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }).catch(e => ({ ok: false, status: e.message }));
  if (!res.ok && API_KEY) {
    res = await fetch(`http://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(url)}&keep_headers=true`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60000) }).catch(e => ({ ok: false, status: e.message }));
  }
  const text = res.ok ? await res.text() : '';
  let json = null; try { json = JSON.parse(text); } catch { /* pas du JSON */ }
  return { url, status: res.status, json, sample: json ? undefined : text.slice(0, 300) };
}

const summarize = j => {
  if (!j) return null;
  const list = Array.isArray(j) ? j : j['hydra:member'];
  return {
    total: j['hydra:totalItems'], view: j['hydra:view'],
    items: (list || [j]).slice(0, 60).map(x => ({ cp_no: x.cp_no, name: x.name, type: x.type, level: x.level, season: x.season, cdg: x.cdg && x.cdg.cg_no, number: x.number, stage_number: x.stage_number, keys: Object.keys(x).slice(0, 25) })),
  };
};

(async () => {
  const probes = [
    `${DOFA}/compets?cdg.cg_no=127&season=2026`,
    `${DOFA}/compets?cg_no=127`,
    `${DOFA}/cdgs/127/compets`,
    `${DOFA}/compets/453692`,
    `${DOFA}/compets/453692/phases`,
    `${DOFA}/compets/453692/phases/1/poules`,
    `${DOFA}/compets/457862/phases/1/poules`,
    `${DOFA}/cdgs`,
  ];
  const out = [];
  for (const url of probes) {
    const r = await get(url);
    out.push({ url, status: r.status, summary: summarize(r.json), sample: r.sample });
    console.log(r.status, url);
  }
  fs.writeFileSync('debug-discovery.json', JSON.stringify(out, null, 2));
})();
