// Accès au serveur (Firebase, offre gratuite). Tant que la configuration n'est pas renseignée,
// l'appli fonctionne en local : les coupons sont gardés sur l'appareil et les scans mis en file d'attente,
// pour être envoyés dès que le serveur sera branché.
import { loadPref, savePref } from './data';
import type { Coupon } from './partners';

export const backendReady = false; // passera à true une fois firebase-config renseigné

export interface ScanRecord extends Coupon { scanId: string; userId: string; queuedAt: string }

export function queueScan(scan: ScanRecord) {
  const queue = loadPref<ScanRecord[]>('scanQueue', []);
  queue.push(scan);
  savePref('scanQueue', queue);
}

export async function recordGoing(_matchId: string, _going: boolean) { /* compteur J'y vais : à brancher sur Firebase */ }

// Vérifie côté serveur que le coupon n'a pas déjà été utilisé (F09). En local : contrôle sur l'appareil uniquement.
export async function couponAlreadyUsed(_matchId: string, _partnerId: string): Promise<boolean> { return false; }

// Code PIN (F10) : vérifié uniquement par le serveur (jamais en clair dans l'appli).
export async function verifyPin(_partnerId: string, _pin: string): Promise<'ok' | 'wrong' | 'unavailable'> {
  return 'unavailable';
}
