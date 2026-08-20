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
  { name: 'Régional 2 - Poule A', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457861&phase=1&poule=1&type=ch' },
  { name: 'Régional 3 - Poule A', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457862&phase=1&poule=1&type=ch' },
  { name: 'Coupe de France - LAURA', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?id=449168&poule=13&phase=1&type=cp&tab=resultat' },
];

const MONTHS = { JANVIER:1, 'FÉVRIER':2, MARS:3, AVRIL:4, MAI:5, JUIN:6, JUILLET:7, 'AOÛT':8, SEPTEMBRE:9, OCTOBRE:10, NOVEMBRE:11, 'DÉCEMBRE':12 };
const DAY_HEADER = /^(LUNDI|MARDI|MERCREDI|JEUDI|VENDREDI|SAMEDI|DIMANCHE)\s+(\d{1,2})\s+([A-ZÀ-Ü]+)\s+(\d{4})(?:\s*-\s*(\d{1,2})H(\d{2}))?/i;

function slugify(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function geocode(cityName) {
  const key = slugify(cityName);
  if (COMMUNES[key]) return { ...COMMUNES[key], approx: false };
  return null;
}

async function fetchRendered(url) {
  if (!API_KEY) throw new Error('SCRAPER_API_KEY manquant (secret GitHub non configuré ?)');
  const endpoint = `http://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(url)}&render=true`;
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`ScraperAPI HTTP ${res.status}`);
  return await res.text();
}

function bodyText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return $('body').text();
}

// Reconnaît les lignes de date ("DIMANCHE 30 AOÛT 2026 - 15H00") et associe les
// deux lignes d'équipes qui suivent (avec ou sans tiret explicite entre elles),
// selon la forme que prend réellement le texte une fois extrait de la page.
function parseSchedule(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const events = [];
  let currentDate = null, currentTime = null, pendingHome = null;

  const looksLikeTeam = (l) => l.length >= 2 && l.length <= 45 && !DAY_HEADER.test(l) && !/^JOURNÉE/i.test(l) && !/^\d+$/.test(l) && !/^(RÉSULTATS|AGENDA|CLASSEMENT|CALENDRIER)$/i.test(l);

  for (const line of lines) {
    const dm = line.match(DAY_HEADER);
    if (dm) {
      const month = MONTHS[dm[3].toUpperCase()];
      if (month) {
        currentDate = `${dm[4]}-${String(month).padStart(2, '0')}-${String(dm[2]).padStart(2, '0')}`;
        currentTime = dm[5] ? `${dm[5].padStart(2, '0')}:${dm[6]}` : null;
      }
      pendingHome = null;
      continue;
    }
    if (!currentDate) continue;

    const dashMatch = line.match(/^(.{2,40}?)\s*[-–—]\s*(.{2,40})$/);
    if (dashMatch) {
      events.push({ home: dashMatch[1].trim(), away: dashMatch[2].trim(), date: currentDate, time: currentTime });
      currentDate = null;
      continue;
    }
    if (looksLikeTeam(line)) {
      if (pendingHome === null) {
        pendingHome = line;
      } else {
        events.push({ home: pendingHome, away: line, date: currentDate, time: currentTime });
        pendingHome = null;
        currentDate = null;
      }
    }
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
