// Serveur Firebase (offre gratuite) : identifiant anonyme + base Firestore.
// Chargé seulement quand on en a besoin (J'y vais, scan) pour ne pas alourdir l'ouverture de l'appli.
// Sans réseau, les scans sont mis en file d'attente sur l'appareil et envoyés au retour du réseau.
import { loadPref, savePref } from './data';
import type { Coupon } from './partners';
import { firebaseConfig } from './firebase-config';

export const backendReady = true;

export interface ScanRecord extends Coupon { scanId: string; userId: string; queuedAt: string; pinHash?: string }

type Fb = {
  db: import('firebase/firestore').Firestore;
  uid: string;
  fs: typeof import('firebase/firestore');
};
let fbPromise: Promise<Fb> | null = null;

function fb(): Promise<Fb> {
  if (!fbPromise) {
    fbPromise = (async () => {
      const [{ initializeApp }, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
      const app = initializeApp(firebaseConfig);
      const a = auth.getAuth(app);
      const cred = a.currentUser ? { user: a.currentUser } : await auth.signInAnonymously(a);
      return { db: fs.getFirestore(app), uid: cred.user.uid, fs };
    })();
    fbPromise.catch(() => { fbPromise = null; }); // nouvel essai au prochain appel
  }
  return fbPromise;
}

const withTimeout = <T,>(p: Promise<T>, ms = 8000) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('délai dépassé')), ms))]);
const scanDocId = (matchId: string, partnerId: string, uid: string) => `${matchId}_${partnerId}_${uid}`;
const sha256 = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
export const pinHash = (partnerId: string, pin: string) => sha256(`${partnerId}:${pin}`);

// Identifiant anonyme Firebase (repli : identifiant local si le serveur est injoignable)
export async function serverUserId(fallback: string) {
  try { return (await withTimeout(fb())).uid; } catch { return fallback; }
}

// Compteur « J'y vais » : un document par match et par utilisateur anonyme (F01)
export async function recordGoing(matchId: string, going: boolean) {
  try {
    const { db, uid, fs } = await withTimeout(fb());
    const ref = fs.doc(db, 'going', `${matchId}_${uid}`);
    if (going) await fs.setDoc(ref, { match_id: matchId, utilisateur_anonyme: uid, date: fs.serverTimestamp() });
    else await fs.deleteDoc(ref);
  } catch { /* non bloquant : le compteur n'est qu'indicatif */ }
}

// Le coupon a-t-il déjà été utilisé (contrôle serveur, F09) ? En cas d'erreur réseau : on s'en remet au contrôle local.
export async function couponAlreadyUsed(matchId: string, partnerId: string): Promise<boolean> {
  try {
    const { db, uid, fs } = await withTimeout(fb(), 6000);
    const snap = await withTimeout(fs.getDoc(fs.doc(db, 'scans', scanDocId(matchId, partnerId, uid))), 6000);
    return snap.exists();
  } catch { return false; }
}

// Enregistre un scan (F08). 'used' = déjà enregistré pour ce match (refus du serveur), 'queued' = pas de réseau.
export async function saveScan(scan: ScanRecord, queueOnFail = true, test = false): Promise<'ok' | 'used' | 'queued' | 'denied'> {
  try {
    const { db, uid, fs } = await withTimeout(fb(), 6000);
    // Mode test : collection séparée, sans limite de scans (ne fausse pas les vraies statistiques)
    const ref = test ? fs.doc(fs.collection(db, 'scans_test')) : fs.doc(db, 'scans', scanDocId(scan.matchId, scan.partnerId, uid));
    await withTimeout(fs.setDoc(ref, {
      partenaire_id: scan.partnerId,
      match_id: scan.matchId,
      utilisateur_anonyme: uid,
      date_heure: scan.at,                    // heure réelle du scan (sur le téléphone)
      recu_le: fs.serverTimestamp(),          // heure de réception par le serveur
      premiere_visite: scan.firstVisit,
      distance_m: scan.distanceM,
      mode: scan.mode,
      ...(scan.pinHash ? { pin_hash: scan.pinHash } : {}),
    }), 8000);
    return 'ok';
  } catch (err) {
    const code = (err as { code?: string }).code || '';
    if (code === 'permission-denied') {
      // Création refusée : soit le coupon existe déjà, soit le code PIN ne correspond pas
      try {
        const { db, uid, fs } = await fb();
        const snap = await fs.getDoc(fs.doc(db, 'scans', scanDocId(scan.matchId, scan.partnerId, uid)));
        return snap.exists() ? 'used' : 'denied';
      } catch { return 'denied'; }
    }
    if (queueOnFail && !test) queueScan(scan);
    return 'queued';
  }
}

// Vérification du code PIN par le serveur (F10) : le code n'est jamais dans l'appli, seulement son empreinte.
export async function verifyPin(partnerId: string, pin: string): Promise<'ok' | 'wrong' | 'unavailable'> {
  try {
    const { db, uid, fs } = await withTimeout(fb(), 6000);
    const hash = await pinHash(partnerId, pin);
    await withTimeout(fs.setDoc(fs.doc(db, 'pin_checks', `${uid}_${partnerId}_${Date.now()}`), { partenaire_id: partnerId, utilisateur_anonyme: uid, pin_hash: hash, date: fs.serverTimestamp() }), 6000);
    return 'ok';
  } catch (err) {
    return (err as { code?: string }).code === 'permission-denied' ? 'wrong' : 'unavailable';
  }
}

// ---------- File d'attente hors ligne (synchronisée au retour du réseau, P2 F11) ----------
export function queueScan(scan: ScanRecord) {
  const queue = loadPref<ScanRecord[]>('scanQueue', []);
  if (!queue.some(s => s.matchId === scan.matchId && s.partnerId === scan.partnerId)) queue.push(scan);
  savePref('scanQueue', queue);
}

export async function flushScanQueue() {
  const queue = loadPref<ScanRecord[]>('scanQueue', []);
  if (!queue.length || !navigator.onLine) return;
  const remaining: ScanRecord[] = [];
  for (const scan of queue) if (await saveScan(scan, false) === 'queued') remaining.push(scan);
  savePref('scanQueue', remaining);
}
