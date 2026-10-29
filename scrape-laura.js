// Robot d'extraction MyLocalMatch — football amateur LAURA.
// Source : API publique de la FFF (api-dofa.fff.fr) → toutes les journées et le stade.
// Elle bloque les serveurs GitHub : les requêtes passent alors par ScraperAPI sans rendu (≈1 crédit/requête).
// En cas d'échec, les matchs déjà connus de la poule sont conservés.
const fs = require('fs');
const path = require('path');
const DATA_DIR = __dirname; // layout plat
const readJson = (f, def) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')); } catch { return def; } };
const COMMUNES = readJson('communes-laura.json', {});
const CLUBS_VILLES = readJson('clubs-villes.json', {});
// Cache des stades localisés via OpenStreetMap (clé = numéro de terrain FFF).
const STADES = readJson('stades-laura.json', {});
let stadesDirty = false;
// Page de l'API où commencent les matchs à venir, par poule : on ne repaie pas les pages déjà jouées.
const PAGES_STATE = readJson('pages-state.json', {});
const PREVIOUS = readJson('events-amateur.json', { events: [] });
// Archive des résultats : alimentée gratuitement par les scores présents dans les pages déjà lues.
const RESULTS = readJson('resultats.json', {});
const API_KEY = process.env.SCRAPER_API_KEY;
let communesDirty = false;

const DOFA = 'https://api-dofa.fff.fr/api';
const LIGUE = { site: 'https://laurafoot.fff.fr', source: 'LAuRAFoot' };
const DROME_ARDECHE = { site: 'https://drome-ardeche.fff.fr', source: 'District Drôme-Ardèche' };
const POULES = 'ABCDEFGHIJ';
// Championnats suivis (numéros FFF trouvés avec discover-districts.js).
const championnat = (label, id, nbPoules, org) =>
  Array.from({ length: nbPoules }, (_, i) => ({ name: nbPoules > 1 ? `${label} - Poule ${POULES[i]}` : label, id, phase: 1, poule: i + 1, org }));
const COMPETITIONS = [
  ...championnat('Régional 1', 457860, 2, LIGUE),
  ...championnat('Régional 2', 457861, 5, LIGUE),
  ...championnat('Régional 3', 457862, 10, LIGUE),
  // District Drôme-Ardèche (n° 125), seniors masculins
  ...championnat('Départemental 1 Drôme-Ardèche', 452463, 1, DROME_ARDECHE),
  ...championnat('Départemental 2 Drôme-Ardèche', 452464, 2, DROME_ARDECHE),
  ...championnat('Départemental 3 Drôme-Ardèche', 452465, 4, DROME_ARDECHE),
  ...championnat('Départemental 4 Drôme-Ardèche', 452466, 6, DROME_ARDECHE),
].map(c => ({ ...c, url: `${c.org.site}/competitions?tab=calendar&id=${c.id}&phase=${c.phase}&poule=${c.poule}&type=ch` }));

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
    id: t.te_no || null,
    name: clean(t.name || t.libelle || t.nom),
    address: clean(t.address || t.adresse),
    zip: clean(t.zip_code || t.code_postal || t.postal_code),
    city: clean(t.city || t.ville || t.commune),
    pos: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
  };
}

async function fetchViaDofa(comp) {
  // On ne se fie pas au lien « page suivante » (parfois absent) : on avance tant que des matchs arrivent.
  // Les matchs sont classés par date : on reprend à la première page qui contenait des matchs à venir.
  const stateKey = `${comp.id}-${comp.phase}-${comp.poule}`;
  const start = PAGES_STATE[stateKey] || 1;
  const members = []; const seen = new Set(); const pages = [];
  let firstUseful = null;
  for (let page = start; page <= 12; page++) {
    const url = `${DOFA}/compets/${comp.id}/phases/${comp.phase}/poules/${comp.poule}/matchs?page=${page}`;
    let json;
    try { json = await fetchJson(url); } catch (err) { if (page === start) throw err; pages.push(`p${page}: ${err.message}`); break; }
    if (page === start) fs.writeFileSync(path.join(DATA_DIR, `debug-dofa-${slug(comp.name)}.json`), JSON.stringify(json, null, 2).slice(0, 20000));
    const list = Array.isArray(json) ? json : (json['hydra:member'] || json.member || json.items || []);
    if (page === start && !list.length && start > 1) { delete PAGES_STATE[stateKey]; return fetchViaDofa(comp); } // calendrier remanié : on repart du début
    if (firstUseful === null && list.some(m => { const dt = dofaDateTime(m); return dt && dt.date >= KEEP_FROM; })) firstUseful = page;
    const fresh = list.filter(m => { const k = m.ma_no || JSON.stringify([m.date, m.home, m.away]); if (seen.has(k)) return false; seen.add(k); return true; });
    pages.push(`p${page}: ${list.length}`);
    members.push(...fresh);
    // Page incomplète = dernière page : inutile de payer une requête de plus pour une page vide.
    if (!fresh.length || list.length < 30 || json['hydra:totalItems'] && members.length >= json['hydra:totalItems']) break;
    await sleep(300);
  }
  comp.pages = pages.join(', ');
  if (firstUseful) PAGES_STATE[stateKey] = firstUseful;
  const events = [];
  for (const m of members) {
    const dt = dofaDateTime(m);
    const home = teamName(m.home || m.equipe_dom || m.home_team);
    const away = teamName(m.away || m.equipe_ext || m.away_team);
    if (!dt || !home || !away) continue;
    if (/exempt/i.test(home + ' ' + away)) continue;
    const venue = dofaVenue(m);
    const journee = m.poule_journee && (m.poule_journee.number ?? m.poule_journee.numero);
    const score = v => (typeof v === 'number' ? v : null);
    const forfeit = m.home_is_forfeit === 'O' ? 'home' : m.away_is_forfeit === 'O' ? 'away' : null;
    events.push({ home, away, ...dt, venue, journee: journee || null, matchId: m.ma_no || m.id || null,
      homeScore: score(m.home_score), awayScore: score(m.away_score), forfeit });
  }
  if (!events.length) throw new Error(`API FFF : 0 match exploitable (${members.length} reçus)`);
  return events;
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

// ---------- Localisation précise des stades (OpenStreetMap / Nominatim) ----------
// Règles d'usage Nominatim : 1 requête/seconde max, application identifiée, résultats mis en cache.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const SPORT_PLACE = /^(pitch|stadium|sports_centre|recreation_ground|track|sports_hall)$/;
const RETRY_AFTER_DAYS = 30;
const LOOKUP_VERSION = 2; // augmenter pour relancer la recherche des stades non trouvés
// Plusieurs serveurs Overpass : on passe au suivant si l'un est lent ou saturé.
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const OVERPASS_BUDGET_MS = 12 * 60 * 1000; // au-delà, on garde la meilleure position déjà connue
let startedAt = null; // démarre à la première recherche Overpass
let overpassDown = 0;
const overpassLog = [];
const logOverpass = msg => { if (overpassLog.length < 30) overpassLog.push(`${new Date().toISOString()} ${msg}`); };
const GENERIC_WORDS = new Set(['stade', 'stades', 'complexe', 'sportif', 'sportive', 'sports', 'sport', 'municipal', 'municipale', 'terrain', 'terrains', 'parc', 'plaine', 'espace', 'synthetique', 'honneur', 'annexe', 'football', 'foot', 'des', 'du', 'de', 'la', 'le', 'les']);
const nameTokens = n => slug(n).split('-').filter(w => w.length >= 4 && !GENERIC_WORDS.has(w) && !/^\d+$/.test(w));
let lastNominatim = 0;

// « PARC DES SPORTS PIERRE COULON 01 » → « PARC DES SPORTS PIERRE COULON »
const stadiumName = name => clean(name.replace(/\s+(n°\s*)?\d+$/i, '').replace(/\s+(terrain|synth[ée]tique|honneur|annexe)\b.*$/i, ''));

async function nominatim(q) {
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastNominatim = Date.now();
  try {
    const url = `${NOMINATIM}?format=jsonv2&countrycodes=fr&limit=8&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'MyLocalMatch/1.0 (https://github.com/clemseign-hue/mylocalmatch-live-data)', 'Accept-Language': 'fr' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}

const distKm = (a, b) => {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};

// Terrains de foot / stades recensés dans OpenStreetMap autour d'un point (API Overpass).
async function pitchesAround(pos, radius) {
  const q = `[out:json][timeout:25];(nwr["leisure"~"^(pitch|stadium)$"]["sport"~"soccer|football|multi"](around:${radius},${pos.lat},${pos.lng});nwr["leisure"="stadium"](around:${radius},${pos.lat},${pos.lng}););out center tags 40;`;
  startedAt = startedAt || Date.now();
  if (Date.now() - startedAt > OVERPASS_BUDGET_MS || overpassDown >= 8) return [];
  for (const server of OVERPASS) {
    try {
      const r = await fetch(server, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'MyLocalMatch/1.0' }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) { logOverpass(`${server} HTTP ${r.status} ${(await r.text()).slice(0, 200).replace(/\s+/g, ' ')}`); continue; }
      const j = await r.json();
      overpassDown = 0;
      logOverpass(`${server} OK ${(j.elements || []).length} éléments`);
      return (j.elements || []).map(el => ({ lat: el.lat ?? el.center?.lat, lng: el.lon ?? el.center?.lon, name: (el.tags && el.tags.name) || '' })).filter(p => p.lat != null);
    } catch (err) { logOverpass(`${server} ${err.name}: ${err.message}`); /* serveur suivant */ }
  }
  overpassDown++; // après 8 échecs complets d'affilée, on n'insiste plus pour ce passage
  return [];
}

// Choisit le terrain : celui dont le nom correspond, sinon le plus proche de l'adresse,
// sinon (ville seule) uniquement s'il n'y a qu'un seul site de foot dans la commune.
async function stadiumNear(v, anchor, anchorKind) {
  const pitches = await pitchesAround(anchor, anchorKind === 'adresse' ? 1200 : 3000);
  if (!pitches.length) return null;
  const tokens = nameTokens(stadiumName(v.name));
  const named = pitches.filter(p => tokens.length && nameTokens(p.name).some(t => tokens.includes(t)));
  const byDist = list => list.map(p => ({ ...p, d: distKm(p, anchor) })).sort((a, b) => a.d - b.d);
  if (named.length) return byDist(named)[0];
  const sorted = byDist(pitches);
  if (anchorKind === 'adresse' && sorted[0].d <= 0.7) return sorted[0];
  if (anchorKind === 'ville' && sorted.every(p => distKm(p, sorted[0]) <= 0.6)) return sorted[0];
  return null;
}

async function findStadium(v, cityPos) {
  const name = stadiumName(v.name);
  const queries = [`${name}, ${v.city}`, `${name}, ${v.zip}`];
  if (!/^stade|^parc|^complexe|^terrain/i.test(name)) queries.push(`stade ${name}, ${v.city}`);
  for (const q of queries) {
    for (const r of await nominatim(q)) {
      const pos = { lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
      const isSport = (r.category === 'leisure' && SPORT_PLACE.test(r.type))
        || (['leisure', 'amenity', 'building', 'landuse'].includes(r.category) && /stade|stadium|sport|foot/i.test(r.name || ''));
      // Le résultat doit être un lieu sportif, dans la région, et à moins de 10 km de la commune indiquée.
      if (isSport && inLaura(pos) && (!cityPos || distKm(pos, cityPos) < 10)) return pos;
    }
  }
  return null;
}

async function locateVenue(v) {
  const key = String(v.id || slug(`${v.name} ${v.zip} ${v.city}`));
  const cached = STADES[key];
  if (cached && (cached.precision === 'stade' || ((cached.v || 1) >= LOOKUP_VERSION && Date.now() - Date.parse(cached.checkedAt) < RETRY_AFTER_DAYS * 864e5))) {
    return cached.lat != null ? cached : null;
  }
  const cityPos = v.city ? await geocodeCity(v.city) : null;
  let result = null;
  const stadium = await findStadium(v, cityPos);
  if (stadium) result = { ...stadium, precision: 'stade' };
  else if (v.address) {
    const g = await geocodeViaBAN([v.address, v.zip, v.city].filter(Boolean).join(' '));
    if (g && (!cityPos || distKm(g, cityPos) < 10)) result = { ...g, precision: 'adresse' };
  }
  if (!result && cityPos) result = { ...cityPos, precision: 'ville' };
  // Pas trouvé par le nom : on cherche les terrains de foot autour de l'adresse (ou de la commune).
  if (result && result.precision !== 'stade') {
    const near = await stadiumNear(v, result, result.precision);
    if (near) result = { lat: near.lat, lng: near.lng, precision: 'stade' };
  }
  const complete = (!startedAt || Date.now() - startedAt <= OVERPASS_BUDGET_MS) && overpassDown < 8;
  STADES[key] = { name: v.name, address: v.address, zip: v.zip, city: v.city, lat: result ? result.lat : null, lng: result ? result.lng : null, precision: result ? result.precision : null, v: complete ? LOOKUP_VERSION : 1, checkedAt: new Date().toISOString() };
  stadesDirty = true;
  return result;
}

async function locate(e) {
  const v = e.venue;
  if (v) {
    if (inLaura(v.pos)) return { ...v.pos, precision: 'stade' };
    if (v.name || v.address || v.city) { const r = await locateVenue(v); if (r) return r; }
  }
  const c = await geocodeClub(e.home);
  return c ? { ...c, precision: 'ville' } : null;
}

// ---------- Fichier compact lu par l'appli : matchs-app.json ----------
// Tables partagées (compétitions, stades) + lignes courtes : bien plus léger à charger en 4G.
function writeAppFile(data) {
  const today = new Date().toISOString().slice(0, 10);
  const comps = [], compIdx = new Map(), venues = [], venueIdx = new Map();
  const r5 = x => (x == null ? null : Math.round(x * 1e5) / 1e5);
  const comp = e => {
    if (!compIdx.has(e.competition)) { compIdx.set(e.competition, comps.length); comps.push([e.competition, e.detailsUrl || null]); }
    return compIdx.get(e.competition);
  };
  const venue = e => {
    const key = [e.venue, e.address, r5(e.lat), r5(e.lng)].join('|');
    if (!venueIdx.has(key)) { venueIdx.set(key, venues.length); venues.push([e.venue || '', e.address || '', r5(e.lat), r5(e.lng), e.precision === 'stade' ? 1 : 0]); }
    return venueIdx.get(key);
  };
  const row = e => [comp(e), e.date, e.time, e.home.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(), e.away.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(), venue(e), String(e.matchId || '')];
  const located = e => e.lat != null && e.lng != null && e.home && e.away;
  const upcoming = (data.events || []).filter(e => located(e) && e.date >= today).map(row);
  // Les résultats (resultats.json) restent archivés mais ne sont pas affichés dans l'appli pour l'instant.
  const app = { v: 1, generatedAt: data.generatedAt, comps, venues, up: upcoming };
  fs.writeFileSync(path.join(DATA_DIR, 'matchs-app.json'), JSON.stringify(app));
  return app;
}

// ---------- Relocalisation seule : node scrape-laura.js --stades ----------
// Recalcule la position des stades des matchs déjà récupérés, sans interroger la FFF.
async function relocateOnly() {
  const file = path.join(DATA_DIR, 'events-amateur.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const byName = new Map(Object.entries(STADES).map(([id, s]) => [slug(`${s.name} ${s.city}`), id]));
  const venues = new Map();
  for (const e of data.events) {
    if (!e.venue) continue;
    const id = e.stadeId || byName.get(slug(e.venue.replace(/,\s*/, ' ')));
    const st = id && STADES[id];
    if (!st) continue;
    const m = (e.address || '').match(/^(?:(.*),\s*)?(\d{5})\s+(.+)$/);
    venues.set(id, { id, name: st.name, city: st.city, address: st.address ?? (m && m[1]) ?? '', zip: st.zip ?? (m && m[2]) ?? '' });
    e.stadeId = id;
  }
  let n = 0;
  for (const v of venues.values()) {
    await locateVenue(v);
    if (++n % 20 === 0) console.log(`  … ${n}/${venues.size} stades`);
  }
  let moved = 0;
  for (const e of data.events) {
    const st = e.stadeId && STADES[e.stadeId];
    if (!st || st.lat == null) continue;
    if (st.lat !== e.lat || st.lng !== e.lng || st.precision !== e.precision) moved++;
    Object.assign(e, { lat: st.lat, lng: st.lng, geocoded: true, precision: st.precision });
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  writeAppFile(data);
  fs.writeFileSync(path.join(DATA_DIR, 'debug-overpass.txt'), overpassLog.join('\n'));
  if (stadesDirty) fs.writeFileSync(path.join(DATA_DIR, 'stades-laura.json'), JSON.stringify(STADES, null, 2));
  const counts = Object.values(STADES).reduce((c, s) => (c[s.precision] = (c[s.precision] || 0) + 1, c), {});
  console.log(`${venues.size} stades traités, ${moved} matchs repositionnés, précision des stades :`, counts);
}

// ---------- Programme principal ----------
if (process.argv.includes('--app')) {
  const app = writeAppFile(PREVIOUS);
  console.log(`matchs-app.json : ${app.up.length} matchs à venir`);
} else if (process.argv.includes('--stades')) { relocateOnly(); } else (async () => {
  const events = []; const report = []; const unlocated = new Set();
  // --only=texte : ne met à jour que les compétitions dont le nom contient ce texte (les autres sont conservées).
  const onlyArg = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).trim();
  for (const comp of COMPETITIONS) {
    if (onlyArg && !comp.name.toLowerCase().includes(onlyArg.toLowerCase())) {
      const previous = (PREVIOUS.events || []).filter(e => e.competition === comp.name && e.date >= KEEP_FROM);
      events.push(...previous);
      report.push({ competition: comp.name, skipped: true, previousKept: previous.length });
      continue;
    }
    let parsed = null, source = null, errors = [];
    try { parsed = await fetchViaDofa(comp); source = 'api-fff'; } catch (err) { errors.push(err.message); }
    if (!parsed) {
      // Échec (crédits épuisés, API indisponible…) : on garde les matchs déjà connus de cette poule.
      const previous = (PREVIOUS.events || []).filter(e => e.competition === comp.name && e.date >= KEEP_FROM);
      events.push(...previous);
      report.push({ competition: comp.name, error: errors.join(' | '), previousKept: previous.length });
      continue;
    }
    let kept = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const e of parsed) {
      const played = e.date < today && e.homeScore != null && e.awayScore != null;
      if (e.date < KEEP_FROM && !played) continue;
      const pos = await locate(e);
      if (played && e.matchId) {
        const { venue: v, ...r } = e;
        RESULTS[e.matchId] = { ...r, competition: comp.name, venue: v && v.name ? [v.name, v.city].filter(Boolean).join(', ') : null,
          address: v ? [v.address, [v.zip, v.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null : null,
          lat: pos ? pos.lat : null, lng: pos ? pos.lng : null, precision: pos ? pos.precision : null, detailsUrl: comp.url };
      }
      if (e.date < KEEP_FROM) continue;
      if (!pos) unlocated.add(e.home);
      const { venue, ...rest } = e;
      events.push({
        sport: 'football', competition: comp.name, ...rest,
        venue: venue && venue.name ? [venue.name, venue.city].filter(Boolean).join(', ') : null,
        stadeId: venue && venue.id ? String(venue.id) : null,
        address: venue ? [venue.address, [venue.zip, venue.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null : null,
        lat: pos ? pos.lat : null, lng: pos ? pos.lng : null, geocoded: !!pos, precision: pos ? pos.precision : null,
        real: true, source: `${comp.org.source} — ${comp.name}`, detailsUrl: comp.url,
      });
      kept++;
    }
    report.push({ competition: comp.name, source, pages: comp.pages, parsedCount: parsed.length, keptCount: kept, warnings: errors.length ? errors : undefined });
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
  fs.writeFileSync(path.join(DATA_DIR, 'resultats.json'), JSON.stringify(RESULTS, null, 1));
  writeAppFile(output);
  if (stadesDirty) fs.writeFileSync(path.join(DATA_DIR, 'stades-laura.json'), JSON.stringify(STADES, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'pages-state.json'), JSON.stringify(PAGES_STATE, null, 2));
  if (communesDirty) fs.writeFileSync(path.join(DATA_DIR, 'communes-laura.json'), JSON.stringify(COMMUNES, null, 2));
  const upcoming = events.filter(e => e.date >= new Date().toISOString().slice(0, 10)).length;
  console.log(`${events.length} matchs (${upcoming} à venir), ${report.filter(r => r.error).length} erreurs, ${unlocated.size} clubs non localisés`);
})();
