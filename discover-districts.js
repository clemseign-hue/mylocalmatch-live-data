// Exploration ponctuelle : championnats d'un district via les équipes de ses clubs.
// Lancement manuel uniquement ; plafonné à MAX_REQUESTS crédits ScraperAPI. Résultat : debug-discovery.json
const fs = require('fs');
const API_KEY = process.env.SCRAPER_API_KEY;
const DOFA = 'https://api-dofa.fff.fr/api';
const MAX_REQUESTS = 40;
const DISTRICT_RE = /DROME|ARDECHE/i;
const ZIP_RE = /^(26|07)/;
const SOURCES = [ // poules régionales contenant des clubs du district
  { id: 457860, poule: 2 }, { id: 457861, poule: 3 }, { id: 457861, poule: 4 }, { id: 457862, poule: 5 },
];
let requests = 0;
const log = [];

async function get(url) {
  if (requests >= MAX_REQUESTS) throw new Error('plafond de requêtes atteint');
  let res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }).catch(e => ({ ok: false, status: e.message }));
  if (!res.ok && API_KEY) {
    requests++;
    res = await fetch(`http://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(url)}&keep_headers=true`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60000) }).catch(e => ({ ok: false, status: e.message }));
  }
  const text = res.ok ? await res.text() : '';
  let json = null; try { json = JSON.parse(text); } catch { /* pas du JSON */ }
  log.push({ url, status: res.status, ok: !!json });
  console.log(res.status, url);
  return json;
}
const members = j => (Array.isArray(j) ? j : (j && (j['hydra:member'] || j.member)) || []);

(async () => {
  const out = { district: null, clubs: [], competitions: [], log };
  try {
    // 1. Clubs du district présents en régional
    const clubs = new Map();
    for (const s of SOURCES) {
      for (const m of members(await get(`${DOFA}/compets/${s.id}/phases/1/poules/${s.poule}/matchs?page=1`))) {
        for (const side of ['home', 'away']) {
          const t = m[side]; const cl = t && t.club && t.club.cl_no;
          if (cl && m.terrain && ZIP_RE.test(String(m.terrain.zip_code || '')) && side === 'home') clubs.set(cl, t.short_name);
        }
      }
      if (clubs.size >= 6) break;
    }
    out.clubs = [...clubs].map(([cl_no, name]) => ({ cl_no, name }));

    // 2. Équipes des clubs → engagements en championnat de district
    const comps = new Map();
    for (const { cl_no } of out.clubs.slice(0, 6)) {
      let j = await get(`${DOFA}/clubs/${cl_no}/equipes`);
      if (!j) j = await get(`${DOFA}/clubs/${cl_no}`);
      const teams = members(j).length ? members(j) : (j && (j.equipes || j.teams)) || [];
      if (!out.sampleTeam && teams[0]) out.sampleTeam = teams[0];
      for (const t of teams) {
        for (const e of t.engagements || []) {
          const c = e.competition || e;
          if (c && c.cdg && DISTRICT_RE.test(c.cdg.name || '')) {
            out.district = out.district || { cg_no: c.cdg.cg_no, name: c.cdg.name };
            comps.set(c.cp_no, { cp_no: c.cp_no, name: c.name, type: c.type, level: c.level, team: t.short_name, category: t.category_code });
          }
        }
      }
    }

    // 3. Phases et poules des championnats seniors
    for (const c of comps.values()) {
      const entry = { ...c, phases: [] };
      out.competitions.push(entry);
      if (c.type !== 'CH' || c.category && c.category !== 'SEM') continue;
      for (const ph of members(await get(`${DOFA}/compets/${c.cp_no}/phases`))) {
        const poules = members(await get(`${DOFA}/compets/${c.cp_no}/phases/${ph.number}/poules`)).map(p => ({ stage_number: p.stage_number, name: p.name }));
        entry.phases.push({ number: ph.number, name: ph.name, poules });
      }
    }
  } catch (err) { out.error = err.message; }
  out.requests = requests;
  fs.writeFileSync('debug-discovery.json', JSON.stringify(out, null, 2));
  console.log(`${requests} requêtes via ScraperAPI`);
})();
