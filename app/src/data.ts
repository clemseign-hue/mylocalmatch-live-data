import type { LevelId, MatchEvent, Sport } from './types';

// Fichier compact produit chaque semaine par le robot GitHub Actions (même dépôt).
// raw.githubusercontent.com est rafraîchi en ~5 min ; jsDelivr sert de secours.
const REPO_FILE = (file: string) => [
  `https://raw.githubusercontent.com/clemseign-hue/mylocalmatch-live-data/main/${file}`,
  `https://cdn.jsdelivr.net/gh/clemseign-hue/mylocalmatch-live-data@main/${file}`,
];
export const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export function levelOf(competition: string): LevelId {
  if (/coupe/i.test(competition)) return 'coupe';
  const m = competition.match(/R[ée]gional\s*(\d)/i);
  if (m) return (`r${m[1]}` as LevelId);
  const d = competition.match(/D[ée]partemental\s*(\d)/i);
  if (d) return (`d${d[1]}` as LevelId);
  return 'autre';
}

// « VICHY RC 2 » (équipe réserve) appartient au club « VICHY RC ».
export const clubOf = (team: string) => team.replace(/\s+\d+$/, '');

// Format de matchs-app.json : tables partagées + lignes courtes (voir writeAppFile dans scrape-laura.js)
type Row = [number, string, string, string, string, number, string];
interface AppFile {
  generatedAt: string;
  comps: [string, string | null][];
  venues: [string, string, number, number, 0 | 1][];
  up: Row[];
}

function toEvent(f: AppFile, r: Row): MatchEvent | null {
  const [c, date, time, home, away, v, id] = r;
  const [competition, detailsUrl] = f.comps[c] || ['', null];
  const [venue, address, lat, lng, exact] = f.venues[v] || ['', '', null, null, 0];
  if (lat == null || lng == null || levelOf(competition) === 'coupe') return null;
  const d = new Date(date + 'T00:00:00');
  return {
    id: `m${id}`, sport: 'football' as Sport,
    home, away, homeClub: clubOf(home), awayClub: clubOf(away),
    competition, level: levelOf(competition),
    venue, address, approximate: !exact, lat, lng, date, time,
    dayLabel: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
    source: competition, detailsUrl,
  };
}

export async function fetchEvents(): Promise<{ events: MatchEvent[]; generatedAt: string | null }> {
  let lastError: unknown;
  for (const url of REPO_FILE('matchs-app.json')) {
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const f = await res.json() as AppFile;
      const parse = (rows: Row[]) => (rows || []).map(r => toEvent(f, r)).filter((e): e is MatchEvent => !!e);
      return { events: parse(f.up), generatedAt: f.generatedAt || null };
    } catch (err) { lastError = err; }
  }
  throw lastError;
}

// ---------- Dates et distances ----------
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayISO = () => isoLocal(new Date());
export function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoLocal(d);
}
export function isWeekendDate(iso: string) {
  const day = new Date(iso + 'T00:00:00').getDay();
  return day === 0 || day === 6;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- Petites préférences mémorisées sur l'appareil ----------
export function loadPref<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem('mlm:' + key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
export function savePref(key: string, value: unknown) {
  try { localStorage.setItem('mlm:' + key, JSON.stringify(value)); } catch { /* navigation privée */ }
}
