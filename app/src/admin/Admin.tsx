import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Partner } from '../partners';
import { firebaseConfig } from '../firebase-config';

// Page d'administration (non listée dans l'appli) : affiches A6 des partenaires (F12) et export CSV des scans (F13).
const PARTNERS_URL = 'https://raw.githubusercontent.com/clemseign-hue/mylocalmatch-live-data/main/partenaires.json';
const APP_URL = 'https://clemseign-hue.github.io/mylocalmatch-live-data/';
const qrTarget = (id: string, domain: boolean) => (domain ? `https://mylocalmatch.fr/p/${id}` : `${APP_URL}?p=${encodeURIComponent(id)}`);

export function Admin() {
  const [tab, setTab] = useState<'affiches' | 'export'>('affiches');
  return (
    <div className="font-body min-h-screen bg-neutral-100 text-neutral-900">
      <header className="no-print flex flex-wrap items-center gap-3 border-b bg-white px-4 py-3">
        <h1 className="font-display text-2xl">MyLocal<span style={{ color: '#FF5A36' }}>Match</span> · Admin</h1>
        <nav className="flex gap-2">
          {(['affiches', 'export'] as const).map(id => (
            <button key={id} onClick={() => setTab(id)} className="rounded-full px-4 py-1.5 text-sm font-semibold"
              style={tab === id ? { background: '#FF5A36', color: '#fff' } : { background: '#eee' }}>
              {id === 'affiches' ? 'Affiches A6' : 'Export des scans'}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'affiches' ? <Posters /> : <Export />}
    </div>
  );
}

// ---------- F12 : affiches à imprimer ----------
function Posters() {
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [domain, setDomain] = useState(false);
  useEffect(() => {
    fetch(`${PARTNERS_URL}?t=${Date.now()}`).then(r => r.json()).then(j => setPartners((j.partenaires || []).filter((p: Partner) => p.actif)))
      .catch(() => setPartners([]));
  }, []);
  return (
    <div>
      <div className="no-print space-y-3 p-4">
        <p className="text-sm">Une affiche A6 (10,5 × 14,8 cm) par partenaire actif de <code>partenaires.json</code>. Imprime avec <strong>Fichier › Imprimer</strong> (format A6 ou « ajuster à la page », marges aucune).</p>
        <fieldset className="space-y-1 rounded-lg border bg-white p-3 text-sm">
          <legend className="px-1 font-semibold">Adresse contenue dans le QR-code</legend>
          <label className="flex items-start gap-2"><input type="radio" checked={!domain} onChange={() => setDomain(false)} className="mt-1" />
            <span>Adresse actuelle de l'appli — fonctionne dès maintenant, même scannée avec l'appareil photo (ouvre l'appli).</span></label>
          <label className="flex items-start gap-2"><input type="radio" checked={domain} onChange={() => setDomain(true)} className="mt-1" />
            <span><strong>mylocalmatch.fr/p/…</strong> — uniquement quand le nom de domaine sera actif (sinon un scan avec l'appareil photo mène à une page inexistante).</span></label>
        </fieldset>
        <button onClick={() => window.print()} className="rounded-full px-5 py-2 font-semibold text-white" style={{ background: '#FF5A36' }}>Imprimer les affiches</button>
      </div>
      {partners === null && <p className="p-4">Chargement…</p>}
      {partners && partners.length === 0 && <p className="p-4">Aucun partenaire actif.</p>}
      <div className="flex flex-wrap gap-6 p-4 print:block print:p-0">
        {partners?.map(p => <Poster key={p.id} partner={p} url={qrTarget(p.id, domain)} />)}
      </div>
    </div>
  );
}

function Poster({ partner, url }: { partner: Partner; url: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => { QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111113', light: '#FFFFFF' } }).then(setSvg); }, [url]);
  return (
    <section className="poster flex flex-col items-center justify-between bg-white text-center shadow print:shadow-none" style={{ width: '105mm', height: '148mm', padding: '8mm 7mm' }}>
      <div>
        <p className="font-display leading-none" style={{ fontSize: '30pt' }}>MyLocal<span style={{ color: '#FF5A36' }}>Match</span></p>
        <p className="mt-1 font-semibold uppercase tracking-widest" style={{ fontSize: '8pt', color: '#FF5A36' }}>Partenaire MyLocalMatch</p>
      </div>
      <div style={{ width: '72mm', height: '72mm' }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div>
        <p className="font-semibold leading-snug" style={{ fontSize: '12pt' }}>Scanne avec l'app pour ton offre d'après-match</p>
        <p className="mt-1" style={{ fontSize: '8pt', color: '#555' }}>Appli MyLocalMatch › fiche du match › « Scanner au comptoir »</p>
        <p className="font-display mt-2" style={{ fontSize: '14pt' }}>{partner.nom}{partner.test ? ' (TEST)' : ''}</p>
      </div>
    </section>
  );
}

// ---------- F13 : export CSV (connexion administrateur requise) ----------
type Fb = { fs: typeof import('firebase/firestore'); db: import('firebase/firestore').Firestore };
let fbPromise: Promise<Fb & { auth: typeof import('firebase/auth'); a: import('firebase/auth').Auth }> | null = null;
const loadFb = () => (fbPromise ||= (async () => {
  const [{ initializeApp }, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = initializeApp(firebaseConfig, 'admin');
  return { auth, a: auth.getAuth(app), fs, db: fs.getFirestore(app) };
})());

const COLUMNS = ['scan_id', 'date_heure', 'partenaire_id', 'match_id', 'utilisateur_anonyme', 'premiere_visite', 'distance_m', 'mode', 'recu_le'];

function toCsv(rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // Séparateur « ; » et BOM UTF-8 : s'ouvre directement dans Excel en français, lisible par Power BI
  return '﻿' + [COLUMNS.join(';'), ...rows.map(r => COLUMNS.map(c => esc(r[c])).join(';'))].join('\r\n');
}
const fmtDate = (d: Date) => d.toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }); // 2026-11-08 17:42:10

function Export() {
  const [user, setUser] = useState<{ email: string | null; uid: string } | null>(null);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [partner, setPartner] = useState('');
  const [test, setTest] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { loadFb().then(({ auth, a }) => auth.onAuthStateChanged(a, u => setUser(u ? { email: u.email, uid: u.uid } : null))); }, []);

  const login = async () => {
    setMsg(null);
    try { const { auth, a } = await loadFb(); await auth.signInWithEmailAndPassword(a, email, password); }
    catch { setMsg('Connexion refusée : vérifie l\'e-mail et le mot de passe.'); }
  };

  const exportCsv = async () => {
    setMsg('Export en cours…');
    try {
      const { fs, db } = await loadFb();
      const [y, m] = month.split('-').map(Number);
      const start = new Date(y, m - 1, 1).toISOString(), end = new Date(y, m, 1).toISOString();
      const q = fs.query(fs.collection(db, test ? 'scans_test' : 'scans'), fs.where('date_heure', '>=', start), fs.where('date_heure', '<', end));
      const snap = await fs.getDocs(q);
      const rows = snap.docs.map(d => {
        const x = d.data();
        return { ...x, scan_id: d.id, date_heure: x.date_heure ? fmtDate(new Date(x.date_heure)) : '', recu_le: x.recu_le?.toDate ? fmtDate(x.recu_le.toDate()) : '' } as Record<string, unknown>;
      }).filter(r => !partner || r.partenaire_id === partner).sort((a, b) => String(a.date_heure).localeCompare(String(b.date_heure)));
      const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `scans${test ? '-test' : ''}_${month}${partner ? `_${partner}` : ''}.csv`;
      link.click();
      setMsg(`${rows.length} scan(s) exporté(s).`);
    } catch (e) {
      setMsg((e as { code?: string }).code === 'permission-denied' ? 'Accès refusé : ce compte n\'est pas autorisé dans les règles Firestore.' : `Erreur : ${(e as Error).message}`);
    }
  };

  if (!user || !user.email) return (
    <div className="mx-auto max-w-sm space-y-3 p-6">
      <p className="text-sm">Connexion réservée à l'administrateur.</p>
      <input className="w-full rounded border px-3 py-2 text-base" type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
      <input className="w-full rounded border px-3 py-2 text-base" type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
      <button onClick={login} className="w-full rounded-full py-2 font-semibold text-white" style={{ background: '#FF5A36' }}>Se connecter</button>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <p className="text-sm">Connecté : <strong>{user.email}</strong> · <button className="underline" onClick={async () => { const { auth, a } = await loadFb(); auth.signOut(a); }}>se déconnecter</button></p>
      <p className="break-all text-xs text-neutral-500">Identifiant administrateur (à mettre dans les règles Firestore) : <code>{user.uid}</code></p>
      <label className="block text-sm font-semibold">Mois<input type="month" value={month} onChange={e => setMonth(e.target.value)} className="mt-1 block w-full rounded border px-3 py-2 text-base font-normal" /></label>
      <label className="block text-sm font-semibold">Partenaire (identifiant, vide = tous)<input value={partner} onChange={e => setPartner(e.target.value.trim())} placeholder="ex. bar-du-stade-valence" className="mt-1 block w-full rounded border px-3 py-2 text-base font-normal" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={test} onChange={e => setTest(e.target.checked)} /> Scans du mode test</label>
      <button onClick={exportCsv} className="w-full rounded-full py-2.5 font-semibold text-white" style={{ background: '#FF5A36' }}>Télécharger le CSV</button>
      {msg && <p className="text-sm">{msg}</p>}
      <p className="text-xs text-neutral-500">Colonnes : {COLUMNS.join(', ')}. Séparateur « ; », s'ouvre directement dans Excel et dans Power BI.</p>
    </div>
  );
}
