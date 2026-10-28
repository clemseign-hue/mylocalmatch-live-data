import type { LevelId, MatchEvent, Sport } from './types';

// Fichier produit chaque semaine par le robot GitHub Actions (même dépôt).
// raw.githubusercontent.com est rafraîchi en ~5 min ; jsDelivr sert de secours.
const DATA_URLS = [
  'https://raw.githubusercontent.com/clemseign-hue/mylocalmatch-live-data/main/events-amateur.json',
  'https://cdn.jsdelivr.net/gh/clemseign-hue/mylocalmatch-live-data@main/events-amateur.json',
];
export const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

interface RawEvent {
  sport?: string; competition?: string; home?: string; away?: string; date?: string; time?: string;
  venue?: string | null; lat?: number | null; lng?: number | null; precision?: string | null;
  source?: string; detailsUrl?: string | null; matchId?: number | string | null;
}

export function levelOf(competition: string): LevelId {
  if (/coupe/i.test(competition)) return 'coupe';
  const m = competition.match(/R[ée]gional\s*(\d)/i);
  if (m) return (`r${m[1]}` as LevelId);
  return 'autre';
}

const cleanName = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
// « VICHY RC 2 » (équipe réserve) appartient au club « VICHY RC ».
export const clubOf = (team: string) => team.replace(/\s+\d+$/, '');

function toEvent(e: RawEvent, i: number): MatchEvent | null {
  if (e.lat == null || e.lng == null || !e.home || !e.away) return null;
  const d = e.date ? new Date(e.date + 'T00:00:00') : null;
  const competition = e.competition || '';
  if (levelOf(competition) === 'coupe') return null; // Coupe de France retirée de l'appli
  const home = cleanName(e.home), away = cleanName(e.away);
  return {
    id: e.matchId ? `m${e.matchId}` : `a${i}`,
    sport: (e.sport as Sport) || 'football',
    home, away, homeClub: clubOf(home), awayClub: clubOf(away),
    competition, level: levelOf(competition),
    venue: e.venue || '',
    approximate: e.precision !== 'stade',
    lat: e.lat, lng: e.lng,
    date: e.date || null,
    dayLabel: d ? d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Date à confirmer',
    time: e.time || '',
    partner: false,
    source: e.source || 'LAuRAFoot',
    detailsUrl: e.detailsUrl || null,
  };
}

export async function fetchEvents(): Promise<{ events: MatchEvent[]; generatedAt: string | null }> {
  let lastError: unknown;
  for (const url of DATA_URLS) {
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const events = ((json.events || []) as RawEvent[]).map(toEvent).filter((e): e is MatchEvent => !!e);
      return { events, generatedAt: json.generatedAt || null };
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
