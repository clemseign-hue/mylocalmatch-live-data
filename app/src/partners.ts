import type { MatchEvent } from './types';
import { haversineKm, loadPref, savePref } from './data';

// ---------- Partenaires (partenaires.json du dépôt) ----------
export interface Partner {
  id: string; nom: string; type: string; adresse: string;
  lat: number; lng: number; offre: string;
  rayon_km?: number; heure_fin?: string; actif: boolean;
  test?: boolean; // visible uniquement en mode test
}

// Mode test : activé par le lien ?test=1 (désactivé par ?test=0), mémorisé sur l'appareil.
export function testMode(): boolean {
  const q = new URLSearchParams(location.search).get('test');
  if (q === '1' || q === '0') savePref('testMode', q === '1');
  return loadPref<boolean>('testMode', false);
}

const PARTNERS_URLS = [
  'https://raw.githubusercontent.com/clemseign-hue/mylocalmatch-live-data/main/partenaires.json',
  'https://cdn.jsdelivr.net/gh/clemseign-hue/mylocalmatch-live-data@main/partenaires.json',
];

export async function fetchPartners(): Promise<Partner[]> {
  for (const url of PARTNERS_URLS) {
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const json = await res.json();
      const test = testMode();
      return ((json.partenaires || []) as Partner[]).filter(p => p && p.id && p.actif === true && (!p.test || test)); // R06
    } catch { /* source suivante */ }
  }
  return [];
}

// ---------- Règles ----------
export const DEFAULT_RADIUS_KM = 3;          // R01
export const MAX_SCAN_DISTANCE_M = 150;      // R04
export const MAX_SCAN_DISTANCE_LOW_GPS_M = 300;
export const VALIDATION_SCREEN_MS = 10 * 60 * 1000; // R07

// R02 : du coup d'envoi + 45 min jusqu'à heure_fin (23:59 par défaut) le jour du match.
export function offerWindow(match: MatchEvent, partner: Partner) {
  const kickoff = new Date(`${match.date}T${match.time || '15:00'}:00`);
  const start = new Date(kickoff.getTime() + 45 * 60 * 1000);
  const [h, m] = (partner.heure_fin || '23:59').split(':').map(Number);
  const end = new Date(`${match.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:59`);
  return { start, end };
}

export const inWindow = (match: MatchEvent, partner: Partner, now = new Date()) => {
  if (partner.test && testMode()) return true; // partenaire de test : disponible à toute heure pour essayer le scanner
  const { start, end } = offerWindow(match, partner);
  return now >= start && now <= end;
};

// Partenaires dans le rayon du stade (R01), avec leur distance au stade.
export function partnersNear(match: MatchEvent, partners: Partner[]) {
  return partners
    .map(p => ({ partner: p, km: haversineKm(match.lat, match.lng, p.lat, p.lng) }))
    .filter(x => x.km <= (x.partner.rayon_km ?? DEFAULT_RADIUS_KM))
    .sort((a, b) => a.km - b.km);
}

// R05 : QR = https://mylocalmatch.fr/p/{id} (futur domaine) ou l'adresse actuelle de l'appli ?p={id}.
export function partnerIdFromQr(text: string): string | null {
  try {
    const url = new URL(text.trim());
    const okHost = url.hostname === 'mylocalmatch.fr' || url.hostname === 'www.mylocalmatch.fr' || url.hostname === 'clemseign-hue.github.io';
    if (!okHost) return null;
    const m = url.pathname.match(/\/p\/([a-z0-9-]+)\/?$/i);
    return (m && m[1]) || url.searchParams.get('p');
  } catch { return null; }
}

// R08 : couleur et mot du jour, identiques pour tous le même jour.
const DAY_COLORS = ['#FF5A36', '#2F80ED', '#F4B740', '#9B51E0', '#27AE9C', '#EB5757', '#F2994A'];
const DAY_WORDS = ['CORNER', 'TACLE', 'LUCARNE', 'PENALTY', 'DRIBBLE', 'VOLÉE', 'TRANSVERSALE', 'CROCHET', 'RETOURNÉE', 'PANENKA', 'MUR', 'AILIER', 'LIBERO', 'BUTEUR'];
export function dayCode(d = new Date()) {
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let h = 2166136261;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return { color: DAY_COLORS[h % DAY_COLORS.length], word: DAY_WORDS[(h >>> 8) % DAY_WORDS.length] };
}

// ---------- État sur l'appareil ----------
export interface Coupon { matchId: string; partnerId: string; at: string; firstVisit: boolean; distanceM: number | null; mode: 'qr' | 'pin' }

export const loadGoing = () => loadPref<Record<string, string>>('going', {});   // matchId → date du clic
export const saveGoing = (g: Record<string, string>) => savePref('going', g);
export const couponKey = (matchId: string, partnerId: string) => `${matchId}|${partnerId}`;
export const loadCoupons = () => loadPref<Record<string, Coupon>>('coupons', {});
export const saveCoupons = (c: Record<string, Coupon>) => savePref('coupons', c);

// Identifiant anonyme de l'appareil (remplacé par l'identifiant anonyme Firebase quand le backend sera branché).
export function anonymousId() {
  let id = loadPref<string | null>('anonId', null);
  if (!id) { id = crypto.randomUUID(); savePref('anonId', id); }
  return id;
}

// Distance (m) entre deux points, arrondie au mètre (R11 : on ne garde que ça, pas les coordonnées).
export const distanceM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000);
