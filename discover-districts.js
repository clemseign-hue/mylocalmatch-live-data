// Exploration ponctuelle : vérifie des numéros de compétition et liste leurs phases/poules.
// Lancement manuel uniquement ; plafonné à MAX_REQUESTS crédits ScraperAPI. Résultat : debug-discovery.json
const fs = require('fs');
const API_KEY = process.env.SCRAPER_API_KEY;
const DOFA = 'https://api-dofa.fff.fr/api';
const MAX_REQUESTS = 15;
const CANDIDATES = [452465, 452467, 452468];
let requests = 0;

async function get(url) {
  if (requests >= MAX_REQUESTS) throw new Error('plafond de requêtes atteint');
  let res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }).catch(e => ({ ok: false, status: e.message }));
  if (!res.ok && API_KEY) {
    requests++;
    res = await fetch(`http://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(url)}&keep_headers=true`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60000) }).catch(e => ({ ok: false, status: e.message }));
  }
  const text = res.ok ? await res.text() : '';
  console.log(res.status, url);
  try { return JSON.parse(text); } catch { return null; }
}
const members = j => (Array.isArray(j) ? j : (j && (j['hydra:member'] || j.member)) || []);

(async () => {
  const out = { competitions: [] };
  try {
    for (const cp of CANDIDATES) {
      const fiche = await get(`${DOFA}/compets/${cp}`);
      const entry = { cp_no: cp, name: fiche && fiche.name, type: fiche && fiche.type, level: fiche && fiche.level, cdg: fiche && fiche.cdg && fiche.cdg.cg_no, phases: [] };
      out.competitions.push(entry);
      if (!fiche || fiche.type !== 'CH' || entry.cdg !== 125) continue;
      for (const ph of members(await get(`${DOFA}/compets/${cp}/phases`))) {
        const poules = members(await get(`${DOFA}/compets/${cp}/phases/${ph.number}/poules`)).map(p => ({ stage_number: p.stage_number, name: p.name }));
        entry.phases.push({ number: ph.number, name: ph.name, poules });
      }
    }
  } catch (err) { out.error = err.message; }
  out.requests = requests;
  fs.writeFileSync('debug-discovery.json', JSON.stringify(out, null, 2));
})();
