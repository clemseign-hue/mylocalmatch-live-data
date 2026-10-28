// Robot d'extraction MyLocalMatch — football amateur LAURA.
// Source 1 : API publique de la FFF (api-dofa.fff.fr) → toutes les journées, stade, sans crédit ScraperAPI.
// Source 2 (secours) : page LAuRAFoot rendue via ScraperAPI (journées 1–5 seulement).
const fs = require('fs');
const path = require('path');
const DATA_DIR = __dirname; // layout plat
const readJson = (f, def) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')); } catch { return def; } };
const COMMUNES = readJson('communes-laura.json', {});
const CLUBS_VILLES = readJson('clubs-villes.json', {});
const API_KEY = process.env.SCRAPER_API_KEY;
let communesDirty = false;

const BASE = 'https://laurafoot.fff.fr/competitions';
const DOFA = 'https://api-dofa.fff.fr/api';
const COMPETITIONS = [
  ...[1, 2].map(p => ({ name: `Régional 1 - Poule ${'AB'[p - 1]}`, id: 457860, phase: 1, poule: p, type: 'ch' })),
  ...[1, 2, 3, 4, 5].map(p => ({ name: `Régional 2 - Poule ${'ABCDE'[p - 1]}`, id: 457861, phase: 1, poule: p, type: 'ch' })),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => ({ name: `Régional 3 - Poule ${'ABCDEFGHIJ'[p - 1]}`, id: 457862, phase: 1, poule: p, type: 'ch' })),
  { name: 'Coupe de France - LAURA', id: 449168, phase: 1, poule: 13, type: 'cp' },
].map(c => ({
  ...c,
  url: c.type === 'cp'
    ? `${BASE}?id=${c.id}&poule=${c.poule}&phase=${c.phase}&type=cp&tab=resultat`
    : `${BASE}?tab=calendar&id=${c.id}&phase=${c.phase}&poule=${c.poule}&type=ch`,
}));

// On garde les matchs depuis 7 jours (l'app masque déjà les matchs passés).
const KEEP_FROM = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

// Départements et emprise d'Auvergne-Rhône-Alpes : écarte les homonymes hors région.
const LAURA_DEPTS = ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'];
const inLaura = p => !!p && typeof p === 'object' && p.lat >= 44.1 && p.lat <= 46.85 && p.lng >= 2.05 && p.lng <= 7.2;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clean = s => (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const pad = n => String(n).padStart(2, '0');

// ---------- Source 1 : API FFF ----------
// L'API FFF bloque aussi les serveurs GitHub : en cas de refus, on passe par ScraperAPI
// sans rendu JavaScript (≈1 crédit par requête au lieu de ≈10).
let dofaViaProxy = false;
async function fetchJson(url) {
  if (!dofaViaProxy) {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'MyLocalMatch/1.0' }, signal: AbortSignal.timeout(20000) });
    if (res.ok) return res.json();
    if (!API_KEY || ![401, 403, 429].includes(res.status)) throw new Error(`API FFF HTTP ${res.status}`);
    dofaViaProxy = true;
  }
  const api = `http://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(url)}&keep_headers=true`;
  const res = await fetch(api, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`API FFF via ScraperAPI HTTP ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`API FFF via ScraperAPI : réponse non JSON (${text.slice(0, 80)})`); }
}

const teamName = t => {
  if (!t) return '';
  if (typeof t === 'string') return clean(t);
  const club = t.club && (t.club.name || t.club.nom);
  const name = clean(t.short_name || t.name || t.nom || club || '');
  const num = t.code || t.number;
  return num && num > 1 && !/\s\d+$/.test(name) ? `${name} ${num}` : name;
};

function dofaDateTime(m) {
  const d = String(m.date || m.date_match || '');
  const dm = d.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!dm) return null;
  let time = null;
  const t = String(m.time || m.heure || '').match(/(\d{1,2})\s*[H:h]\s*(\d{2})/);
  if (t) time = `${pad(t[1])}:${t[2]}`;
  else if (dm[4] && dm[4] !== '00') time = `${dm[4]}:${dm[5]}`;
  return { date: `${dm[1]}-${dm[2]}-${dm[3]}`, time: time || '15:00' };
}

function dofaVenue(m) {
  const t = m.terrain || m.stade || null;
  if (!t || typeof t !== 'object') return null;
  const lat = parseFloat(t.latitude ?? t.lat), lng = parseFloat(t.longitude ?? t.lng ?? t.lon);
  return {
    name: clean(t.name || t.libelle || t.nom),
    address: clean(t.address || t.adresse),
    zip: clean(t.zip_code || t.code_postal || t.postal_code),
    city: clean(t.city || t.ville || t.commune),
    pos: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
  };
}

async function fetchViaDofa(comp) {
  const members = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${DOFA}/compets/${comp.id}/phases/${comp.phase}/poules/${comp.poule}/matchs?page=${page}`;
    const json = await fetchJson(url);
    if (page === 1) fs.writeFileSync(path.join(DATA_DIR, `debug-dofa-${slug(comp.name)}.json`), JSON.stringify(json, null, 2).slice(0, 20000));
    const list = Array.isArray(json) ? json : (json['hydra:member'] || json.member || json.items || []);
    members.push(...list);
    const next = json['hydra:view'] && json['hydra:view']['hydra:next'];
    if (!list.length || !next) break;
    await sleep(300);
  }
  const events = [];
  for (const m of members) {
    const dt = dofaDateTime(m);
    const home = teamName(m.home || m.equipe_dom || m.home_team);
    const away = teamName(m.away || m.equipe_ext || m.away_team);
    if (!dt || !home || !away) continue;
    if (/exempt/i.test(home + ' ' + away)) continue;
    const venue = dofaVenue(m);
    const journee = m.poule_journee && (m.poule_journee.number ?? m.poule_journee.numero);
    events.push({ home, away, ...dt, venue, journee: journee || null, matchId: m.ma_no || m.id || null });
  }
  if (!events.length) throw new Error(`API FFF : 0 match exploitable (${members.length} reçus)`);
  return events;
}

// ---------- Source 2 (secours) : ScraperAPI ----------
const MONTHS = { janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12 };
const DATE_RE = /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})\s*-\s*(\d{1,2})H(\d{2})/gi;
const SEP_RE = /\s-\s/;

async function fetchRendered(url, attempt = 1) {
  const api = `http://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(url)}&render=true`;
  const res = await fetch(api, { signal: AbortSignal.timeout(60000) });
  if (res.status >= 500 && attempt < 3) { await sleep(3000 * attempt); return fetchRendered(url, attempt + 1); }
  if (!res.ok) throw new Error(`ScraperAPI HTTP ${res.status} (après ${attempt} tentative(s))`);
  return res.text();
}

function htmlToText(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  $('script,style').remove();
  return $('body').text();
}

function cleanTeamName(name) { return clean(name.replace(/^TAB\s*\d+\s*-\s*\d+\s*/i, '').replace(/\s*Pénalité\s*$/i, '')); }

function parseSchedule(text) {
  const matches = [...text.matchAll(DATE_RE)];
  const events = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    let chunk = text.slice(start, end).split(/Journée\s*\d+|Sidebar|Recherche avancée/i)[0];
    const nl = chunk.indexOf('\n'); if (nl !== -1) chunk = chunk.slice(0, nl);
    const sep = chunk.search(SEP_RE); if (sep === -1) continue;
    const sepMatch = chunk.slice(sep).match(SEP_RE);
    const home = cleanTeamName(chunk.slice(0, sep + 1).trim());
    const away = cleanTeamName(chunk.slice(sep + sepMatch[0].length).trim());
    if (!home || !away) continue;
    const month = MONTHS[m[3].toLowerCase()]; if (!month) continue;
    events.push({ home, away, date: `${m[4]}-${pad(month)}-${pad(m[2])}`, time: `${pad(m[5])}:${m[6]}`, venue: null });
  }
  return events;
}

async function fetchViaScraperApi(comp) {
  if (!API_KEY) throw new Error('SCRAPER_API_KEY manquante');
  const text = htmlToText(await fetchRendered(comp.url));
  fs.writeFileSync(path.join(DATA_DIR, `debug-${slug(comp.name)}.txt`), text);
  return parseSchedule(text);
}

// ---------- Géocodage ----------
const CLUB_PREFIXES = /^(U\.?S\.?|A\.?S\.?|F\.?C\.?|E\.?S\.?|S\.?C\.?|R\.?C\.?|S\.?P\.?|A\.?S\.?C\.?|A\.?M\.?S?\.?|C\.?S\.?|J\.?S\.?|A\.?C\.?|U\.?O\.?|O\.?|ENT\.?|ENTENTE)\s+/i;
function stripClub(name) {
  return name.replace(/\s+\d+\s*$/, '').replace(CLUB_PREFIXES, '').replace(/\s+(U\.?S\.?|A\.?S\.?|F\.?C\.?|E\.?S\.?|R\.?C\.?)\s*$/i, '').trim();
}

async function geocodeViaBAN(q, extra = '') {
  try {
    const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5${extra}`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    const f = (j.features || []).find(f => LAURA_DEPTS.includes(String(f.properties.postcode || '').slice(0, 2)));
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates;
    return { lat, lng };
  } catch { return null; }
}

async function geocodeCity(ville) {
  const key = slug(ville);
  if (inLaura(COMMUNES[key])) return COMMUNES[key];
  const g = await geocodeViaBAN(ville, '&type=municipality');
  if (g) { COMMUNES[key] = g; communesDirty = true; }
  return g;
}

async function geocodeClub(clubName) {
  const base = stripClub(clubName);
  const ville = CLUBS_VILLES[slug(clubName.replace(/\s+\d+\s*$/, ''))] || CLUBS_VILLES[slug(base)];
  if (ville) { const c = await geocodeCity(ville); if (c) return c; }
  const variants = [base, ...base.split(/\s+/).filter(w => w.length >= 4)];
  for (const v of variants) { const c = COMMUNES[slug(v)]; if (inLaura(c)) return c; }
  return null;
}

async function locate(e) {
  const v = e.venue;
  if (v) {
    if (inLaura(v.pos)) return { ...v.pos, precision: 'stade' };
    if (v.address || v.city) {
      const g = await geocodeViaBAN([v.address, v.zip, v.city].filter(Boolean).join(' '));
      if (g) return { ...g, precision: v.address ? 'stade' : 'ville' };
    }
    if (v.city) { const c = await geocodeCity(v.city); if (c) return { ...c, precision: 'ville' }; }
  }
  const c = await geocodeClub(e.home);
  return c ? { ...c, precision: 'ville' } : null;
}

// ---------- Programme principal ----------
(async () => {
  const events = []; const report = []; const unlocated = new Set();
  for (const comp of COMPETITIONS) {
    let parsed = null, source = null, errors = [];
    try { parsed = await fetchViaDofa(comp); source = 'api-fff'; } catch (err) { errors.push(err.message); }
    if (!parsed) {
      try { parsed = await fetchViaScraperApi(comp); source = 'scraperapi'; } catch (err) { errors.push(err.message); }
    }
    if (!parsed) { report.push({ competition: comp.name, error: errors.join(' | ') }); continue; }
    let kept = 0;
    for (const e of parsed) {
      if (e.date < KEEP_FROM) continue;
      const pos = await locate(e);
      if (!pos) unlocated.add(e.home);
      const { venue, ...rest } = e;
      events.push({
        sport: 'football', competition: comp.name, ...rest,
        venue: venue && venue.name ? [venue.name, venue.city].filter(Boolean).join(', ') : null,
        lat: pos ? pos.lat : null, lng: pos ? pos.lng : null, geocoded: !!pos, precision: pos ? pos.precision : null,
        real: true, source: `LAuRAFoot — ${comp.name}`, detailsUrl: comp.url,
      });
      kept++;
    }
    report.push({ competition: comp.name, source, parsedCount: parsed.length, keptCount: kept, warnings: errors.length ? errors : undefined });
  }
  events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const output = { generatedAt: new Date().toISOString(), sourceNote: "Extrait automatiquement des calendriers LAuRAFoot / FFF. Coordonnées du stade quand elles sont connues, sinon de la ville du club.", events, report, unlocatedClubs: [...unlocated].sort() };
  // Si tout a échoué, on ne remplace pas les données existantes par une liste vide.
  if (!events.length && fs.existsSync(path.join(DATA_DIR, 'events-amateur.json'))) {
    fs.writeFileSync(path.join(DATA_DIR, 'last-run-report.json'), JSON.stringify(output, null, 2));
    console.log('Aucun match récupéré : données précédentes conservées (voir last-run-report.json).');
    return;
  }
  fs.writeFileSync(path.join(DATA_DIR, 'events-amateur.json'), JSON.stringify(output, null, 2));
  if (communesDirty) fs.writeFileSync(path.join(DATA_DIR, 'communes-laura.json'), JSON.stringify(COMMUNES, null, 2));
  const upcoming = events.filter(e => e.date >= new Date().toISOString().slice(0, 10)).length;
  console.log(`${events.length} matchs (${upcoming} à venir), ${report.filter(r => r.error).length} erreurs, ${unlocated.size} clubs non localisés`);
})();
