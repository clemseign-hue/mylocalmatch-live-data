// scrape-laura.js
//
// Récupère les calendriers de matchs amateurs de la Ligue Auvergne-Rhône-Alpes
// de Football (LAuRAFoot) et les transforme en JSON exploitable par l'application.
//
// v2 — passe par ScraperAPI (scraperapi.com) au lieu d'un navigateur headless
// classique : le site LAuRAFoot bloque les adresses réseau des serveurs GitHub
// Actions (constaté en v1), quel que soit le déguisement du navigateur.
// ScraperAPI fait transiter la requête par d'autres adresses et rend le
// JavaScript côté serveur, on récupère directement le HTML final.
//
// Nécessite la variable d'environnement SCRAPER_API_KEY (voir README —
// stockée comme "secret" GitHub, jamais en clair dans ce fichier).

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const DATA_DIR = __dirname;
const COMMUNES = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'communes-laura.json'), 'utf-8'));
const API_KEY = process.env.SCRAPER_API_KEY;

const COMPETITIONS = [
  { name: 'Régional 1 - Poule A', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457860&phase=1&poule=1&type=ch' },
  { name: 'Régional 1 - Poule B', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457860&phase=1&poule=2&type=ch' },
  { name: 'Régional 2 - Poule A', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457861&phase=1&poule=1&type=ch' },
  { name: 'Régional 2 - Poule B', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457861&phase=1&poule=2&type=ch' },
  { name: 'Régional 2 - Poule C', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457861&phase=1&poule=3&type=ch' },
  { name: 'Régional 2 - Poule D', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457861&phase=1&poule=4&type=ch' },
  { name: 'Régional 2 - Poule E', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457861&phase=1&poule=5&type=ch' },
  { name: 'Régional 3 - Poule A', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457862&phase=1&poule=1&type=ch' },
  { name: 'Régional 3 - Poule B', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457862&phase=1&poule=2&type=ch' },
  { name: 'Régional 3 - Poule C', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457862&phase=1&poule=3&type=ch' },
  { name: 'Régional 3 - Poule D', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457862&phase=1&poule=4&type=ch' },
  { name: 'Régional 3 - Poule E', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457862&phase=1&poule=5&type=ch' },
  { name: 'Régional 3 - Poule F', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457862&phase=1&poule=6&type=ch' },
  { name: 'Régional 3 - Poule G', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457862&phase=1&poule=7&type=ch' },
  { name: 'Régional 3 - Poule H', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457862&phase=1&poule=8&type=ch' },
  { name: 'Régional 3 - Poule I', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457862&phase=1&poule=9&type=ch' },
  { name: 'Régional 3 - Poule J', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457862&phase=1&poule=10&type=ch' },
  { name: 'Coupe de France - LAURA', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?id=449168&poule=13&phase=1&type=cp&tab=resultat' },
];

const MONTHS = { janvier:1, février:2, mars:3, avril:4, mai:5, juin:6, juillet:7, août:8, septembre:9, octobre:10, novembre:11, décembre:12 };
const DATE_RE = /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})\s*-\s*(\d{1,2})H(\d{2})/gi;
const SEP_RE = /\s-\s/;

function slugify(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const CLUB_PREFIXES = /^(U\.?S\.?|A\.?S\.?|F\.?C\.?|E\.?S\.?|S\.?C\.?|R\.?C\.?|S\.?P\.?|A\.?S\.?C\.?|A\.?M\.?S?\.?|C\.?S\.?|J\.?S\.?|A\.?C\.?|U\.?O\.?|ENT\.?|ENTENTE)\s+/i;

function geocode(cityName) {
  if (!cityName) return null;
  const candidates = [cityName];
  const stripped = cityName.replace(/\s+\d+\s*$/, '').trim();
  candidates.push(stripped);
  candidates.push(stripped.replace(CLUB_PREFIXES, ''));
  stripped.split(/[\s.]+/).filter(w => w.length >= 4).forEach(w => candidates.push(w));

  for (const c of candidates) {
    const key = slugify(c);
    if (COMMUNES[key]) return { ...COMMUNES[key], approx: false };
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRendered(url, attempt = 1) {
  if (!API_KEY) throw new Error('SCRAPER_API_KEY manquant (secret GitHub non configuré ?)');
  const endpoint = `http://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(url)}&render=true`;
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) {
    if (res.status >= 500 && attempt < 3) {
      await sleep(3000 * attempt);
      return fetchRendered(url, attempt + 1);
    }
    throw new Error(`ScraperAPI HTTP ${res.status} (après ${attempt} tentative${attempt > 1 ? 's' : ''})`);
  }
  return await res.text();
}

function bodyText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return $('body').text();
}

function parseSchedule(text) {
  const matches = [...text.matchAll(DATE_RE)];
  const events = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    let chunk = text.slice(start, end).split(/Journée\s*\d+|Sidebar|Recherche avancée/i)[0];
    const nlIdx = chunk.indexOf('\n');
    if (nlIdx !== -1) chunk = chunk.slice(0, nlIdx);

    const sep = chunk.search(SEP_RE);
    if (sep === -1) continue;
    const sepMatch = chunk.slice(sep).match(SEP_RE);
    const home = chunk.slice(0, sep + 1).trim();
    const away = chunk.slice(sep + sepMatch[0].length).trim();
    if (!home || !away) continue;

    const month = MONTHS[m[3].toLowerCase()];
    if (!month) continue;
    events.push({
      home, away,
      date: `${m[4]}-${String(month).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`,
      time: `${m[5].padStart(2, '0')}:${m[6]}`,
    });
  }
  return events;
}

async function scrapeCompetition(comp) {
  const html = await fetchRendered(comp.url);
  const text = bodyText(html);

  fs.writeFileSync(path.join(DATA_DIR, `debug-${slugify(comp.name)}.txt`), text);

  const parsed = parseSchedule(text);
  const events = parsed.map(p => {
    const geo = geocode(p.home) || geocode(comp.name);
    return {
      sport: comp.sport,
      competition: comp.name,
      home: p.home,
      away: p.away,
      date: p.date,
      time: p.time,
      lat: geo ? geo.lat : null,
      lng: geo ? geo.lng : null,
      geocoded: !!geo,
      real: true,
      source: 'LAuRAFoot — ' + comp.name,
    };
  });

  return { events, parsedCount: events.length, textLength: text.length };
}

async function main() {
  const allEvents = [];
  const report = [];

  for (const comp of COMPETITIONS) {
    console.log(`Extraction : ${comp.name}...`);
    try {
      const result = await scrapeCompetition(comp);
      allEvents.push(...result.events);
      report.push({ competition: comp.name, parsedCount: result.parsedCount, textLength: result.textLength });
      console.log(`  → ${result.parsedCount} match(s) reconnu(s) (${result.textLength} caractères lus)`);
    } catch (err) {
      report.push({ competition: comp.name, error: err.message });
      console.log(`  → échec : ${err.message}`);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sourceNote: "Extrait automatiquement depuis laurafoot.fff.fr via ScraperAPI. Coordonnées approximatives quand la ville n'a pas pu être identifiée.",
    events: allEvents,
    report,
  };

  fs.writeFileSync(path.join(DATA_DIR, 'events-amateur.json'), JSON.stringify(output, null, 2));
  console.log(`\nTerminé : ${allEvents.length} match(s) extrait(s) au total.`);
  console.log('Voir debug-*.txt pour vérifier/ajuster la reconnaissance si le nombre semble bas.');
}

main().catch(err => {
  console.error('Erreur fatale du scraper :', err);
  process.exit(1);
});
