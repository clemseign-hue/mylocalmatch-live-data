// scrape-laura.js
//
// Récupère les calendriers de matchs amateurs de la Ligue Auvergne-Rhône-Alpes
// de Football (LAuRAFoot) et les transforme en JSON exploitable par l'application.
//
// POURQUOI UN NAVIGATEUR HEADLESS (Playwright) ET PAS UN SIMPLE FETCH :
// Les pages laurafoot.fff.fr chargent la liste des matchs en JavaScript après
// le premier affichage — un simple téléchargement de page ne les voit pas.
// Playwright ouvre un vrai navigateur (sans interface) qui exécute ce JavaScript,
// exactement comme le ferait Safari.
//
// IMPORTANT — À LIRE : je n'ai pas pu observer le HTML final réellement généré par
// ces pages (mes outils ne peuvent pas exécuter de JavaScript). Les sélecteurs
// ci-dessous sont donc une première version, écrite à partir de la structure
// habituelle de ce type de site (tableaux de résultats). Il est probable qu'un
// premier lancement révèle un ajustement à faire (nom de classe CSS différent,
// etc.). Le script est conçu pour être diagnostiqué facilement : en cas d'échec
// d'extraction sur une compétition, il enregistre le texte brut de la page dans
// data/debug-<competition>.txt pour qu'on puisse l'inspecter et corriger le
// sélecteur ensemble.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COMMUNES = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'communes-laura.json'), 'utf-8'));

// Compétitions suivies. Ajoutez-en en copiant le format d'URL trouvé sur
// https://laurafoot.fff.fr/competitions/ (sélectionnez un championnat + une poule,
// copiez l'URL affichée dans la barre d'adresse).
const COMPETITIONS = [
  { name: 'Régional 1 - Poule A', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457860&phase=1&poule=1&type=ch' },
  { name: 'Régional 2 - Poule A', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457861&phase=1&poule=1&type=ch' },
  { name: 'Régional 3 - Poule A', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?tab=calendar&id=457862&phase=1&poule=1&type=ch' },
  { name: 'Coupe de France - LAURA', sport: 'football', url: 'https://laurafoot.fff.fr/competitions?id=449168&poule=13&phase=1&type=cp&tab=resultat' },
];

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function geocode(cityName) {
  const key = slugify(cityName);
  if (COMMUNES[key]) return { ...COMMUNES[key], approx: false };
  return null;
}

// Essaie plusieurs sélecteurs candidats pour trouver les lignes de match.
// Retourne le texte de chaque ligne trouvée.
async function extractRows(page) {
  const candidates = [
    'table tr',
    '[class*="match"]',
    '[class*="calendrier"] li',
    '[class*="result"] li',
  ];
  for (const selector of candidates) {
    const rows = await page.$$eval(selector, els =>
      els.map(el => el.innerText.trim()).filter(t => t.length > 5)
    ).catch(() => []);
    if (rows.length > 3) return { selector, rows };
  }
  return { selector: null, rows: [] };
}

// Tente de reconnaître "Équipe A - Équipe B", une date (JJ/MM) et une heure (HH:MM)
// dans une ligne de texte brute. Renvoie null si le format n'est pas reconnu —
// dans ce cas la ligne brute est conservée pour vérification manuelle.
function parseRow(raw) {
  const dateMatch = raw.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  const timeMatch = raw.match(/(\d{1,2})[h:](\d{2})/);
  const teamsMatch = raw.match(/([A-ZÉÈÀÇ][A-Za-zÉÈÀÇéèêàçôî'. -]{2,40})\s*[-–]\s*([A-ZÉÈÀÇ][A-Za-zÉÈÀÇéèêàçôî'. -]{2,40})/);
  if (!dateMatch || !teamsMatch) return null;

  const year = dateMatch[3] || (new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1);
  const date = `${year}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[1]).padStart(2, '0')}`;
  const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : null;

  return {
    home: teamsMatch[1].trim(),
    away: teamsMatch[2].trim(),
    date,
    time,
  };
}

async function scrapeCompetition(page, comp) {
  await page.goto(comp.url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500); // laisse le temps au JS de peupler le tableau

  const { selector, rows } = await extractRows(page);
  const events = [];
  const unparsed = [];

  for (const raw of rows) {
    const parsed = parseRow(raw);
    if (parsed) {
      // Le nom de ville n'est pas toujours présent dans la ligne de calendrier ;
      // à défaut, on géocode sur le nom de l'équipe à domicile (heuristique).
      const geo = geocode(parsed.home) || geocode(comp.name);
      events.push({
        sport: comp.sport,
        competition: comp.name,
        home: parsed.home,
        away: parsed.away,
        date: parsed.date,
        time: parsed.time,
        lat: geo ? geo.lat : null,
        lng: geo ? geo.lng : null,
        geocoded: !!geo,
        real: true,
        source: 'LAuRAFoot — ' + comp.name,
      });
    } else {
      unparsed.push(raw);
    }
  }

  if (unparsed.length > 0) {
    fs.writeFileSync(
      path.join(DATA_DIR, `debug-${slugify(comp.name)}.txt`),
      `Sélecteur utilisé: ${selector}\n\nLignes non reconnues (${unparsed.length}):\n\n` + unparsed.join('\n---\n')
    );
  }

  return { events, totalRows: rows.length, parsedCount: events.length, selector };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (compatible; MyLocalMatchBot/1.0)' });

  const allEvents = [];
  const report = [];

  for (const comp of COMPETITIONS) {
    console.log(`Extraction : ${comp.name}...`);
    try {
      const result = await scrapeCompetition(page, comp);
      allEvents.push(...result.events);
      report.push({ competition: comp.name, ...result, events: undefined });
      console.log(`  → ${result.parsedCount}/${result.totalRows} lignes reconnues (sélecteur: ${result.selector})`);
    } catch (err) {
      report.push({ competition: comp.name, error: err.message });
      console.log(`  → échec : ${err.message}`);
    }
  }

  await browser.close();

  const output = {
    generatedAt: new Date().toISOString(),
    sourceNote: "Extrait automatiquement depuis laurafoot.fff.fr. Coordonnées approximatives quand la ville n'a pas pu être identifiée.",
    events: allEvents,
    report,
  };

  fs.writeFileSync(path.join(DATA_DIR, 'events-amateur.json'), JSON.stringify(output, null, 2));
  console.log(`\nTerminé : ${allEvents.length} match(s) extrait(s) au total.`);
  console.log('Voir data/debug-*.txt pour les lignes non reconnues, si le nombre extrait semble bas.');
}

main().catch(err => {
  console.error('Erreur fatale du scraper :', err);
  process.exit(1);
});
