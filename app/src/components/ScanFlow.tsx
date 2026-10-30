import { useEffect, useRef, useState } from 'react';
import type { MatchEvent } from '../types';
import type { Theme } from '../theme';
import {
  MAX_SCAN_DISTANCE_LOW_GPS_M, MAX_SCAN_DISTANCE_M, anonymousId, couponKey, distanceM, inWindow,
  partnerIdFromQr, partnersNear, testMode, type Coupon, type Partner,
} from '../partners';
import { couponAlreadyUsed, queueScan, verifyPin } from '../backend';
import { loadPref, savePref } from '../data';
import { Icon } from './Icon';

type Step =
  | { kind: 'intro' } | { kind: 'camera' } | { kind: 'pinChoose' } | { kind: 'pin'; partner: Partner }
  | { kind: 'location'; partner: Partner; match: MatchEvent; mode: 'qr' | 'pin' }
  | { kind: 'firstVisit'; partner: Partner; match: MatchEvent; mode: 'qr' | 'pin'; dist: number | null }
  | { kind: 'error'; message: string; offerPin?: boolean };

interface Props {
  t: Theme; partners: Partner[]; goingMatches: MatchEvent[]; coupons: Record<string, Coupon>;
  onValidated: (c: Coupon) => void; onClose: () => void;
}

// Textes de l'onglet 6 du cahier des charges
const TXT = {
  camera: 'Autorise la caméra pour scanner le QR-code du comptoir.',
  position: 'On vérifie juste que tu es bien chez le partenaire. Ta position n\'est pas conservée.',
  tooFar: (nom: string) => `Tu dois être chez ${nom} pour valider l'offre.`,
  hours: (fin: string) => `Cette offre est valable à partir de la mi-temps et jusqu'à ${fin}.`,
  used: 'Offre déjà utilisée pour ce match.',
  unknownQr: 'Ce QR-code n\'est pas celui d\'un partenaire MyLocalMatch.',
  noGoing: 'Indique « J\'y vais » sur un match pour débloquer les offres.',
  noCamera: 'Caméra indisponible. Demande le code au serveur.',
};

// Code PIN : 3 erreurs = blocage 10 minutes (F10)
const PIN_LOCK_MS = 10 * 60 * 1000;
function pinLockedUntil(): number { return loadPref<number>('pinLock', 0); }
function registerPinError() {
  const errors = loadPref<number>('pinErrors', 0) + 1;
  if (errors >= 3) { savePref('pinLock', Date.now() + PIN_LOCK_MS); savePref('pinErrors', 0); } else savePref('pinErrors', errors);
}

export function ScanFlow({ t, partners, goingMatches, coupons, onValidated, onClose }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const [busy, setBusy] = useState(false);

  // Contrôles F05 : partenaire actif, J'y vais, fenêtre horaire, coupon non utilisé (puis position)
  async function checkPartner(partnerId: string | null, mode: 'qr' | 'pin'): Promise<Step> {
    const partner = partners.find(p => p.id === partnerId);
    if (!partner) return { kind: 'error', message: TXT.unknownQr };
    if (!goingMatches.length) return { kind: 'error', message: TXT.noGoing };
    const near = goingMatches.filter(m => partnersNear(m, [partner]).length);
    if (!near.length) return { kind: 'error', message: TXT.noGoing };
    const open = near.filter(m => inWindow(m, partner)).sort((a, b) => b.time.localeCompare(a.time));
    if (!open.length) return { kind: 'error', message: TXT.hours(partner.heure_fin || '23:59') };
    // Mode test : le propriétaire peut rescanner autant qu'il veut (aucun contrôle « déjà utilisée »)
    const match = testMode() ? open[0] : open.find(m => !coupons[couponKey(m.id, partner.id)]);
    if (!match || (!testMode() && await couponAlreadyUsed(match.id, partner.id))) return { kind: 'error', message: TXT.used };
    // Mode test (?test=1) : pas de contrôle de distance, pour essayer le parcours de n'importe où
    if (testMode()) return { kind: 'firstVisit', partner, match, mode, dist: null };
    return { kind: 'location', partner, match, mode };
  }

  async function onQr(text: string) {
    setBusy(true);
    setStep(await checkPartner(partnerIdFromQr(text), 'qr'));
    setBusy(false);
  }

  function checkLocation(s: Extract<Step, { kind: 'location' }>) {
    setBusy(true);
    navigator.geolocation.getCurrentPosition(pos => {
      setBusy(false);
      const dist = distanceM({ lat: pos.coords.latitude, lng: pos.coords.longitude }, s.partner);
      const max = pos.coords.accuracy > MAX_SCAN_DISTANCE_M ? MAX_SCAN_DISTANCE_LOW_GPS_M : MAX_SCAN_DISTANCE_M; // R04
      setStep(dist <= max ? { kind: 'firstVisit', partner: s.partner, match: s.match, mode: s.mode, dist } : { kind: 'error', message: TXT.tooFar(s.partner.nom) });
    }, () => { setBusy(false); setStep({ kind: 'error', message: `${TXT.tooFar(s.partner.nom)} Autorise la localisation pour valider.` }); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  function validate(s: Extract<Step, { kind: 'firstVisit' }>, firstVisit: boolean) {
    const coupon: Coupon = { matchId: s.match.id, partnerId: s.partner.id, at: new Date().toISOString(), firstVisit, distanceM: s.dist, mode: s.mode };
    queueScan({ ...coupon, scanId: crypto.randomUUID(), userId: anonymousId(), queuedAt: coupon.at });
    onValidated(coupon);
  }

  // Partenaires proposables pour le code PIN : offres ouvertes des matchs « J'y vais »
  const openPartners = partners.filter(p => goingMatches.some(m => partnersNear(m, [p]).length && inWindow(m, p)));

  const shell = (title: string, body: React.ReactNode) => (
    <div className="fixed inset-0 z-[1100] flex flex-col" style={{ background: t.bg, color: t.text }}>
      <div className="flex items-center justify-between px-4 pb-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <h2 className="font-display text-xl">{title}</h2>
        <button onClick={onClose} className="flex items-center gap-1 text-sm font-semibold" style={{ color: t.flare }}>Fermer <Icon name="x" size={16} /></button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-8">{body}</div>
    </div>
  );
  const primary = 'w-full rounded-full py-3.5 text-base font-semibold disabled:opacity-50';
  const secondary = 'w-full rounded-full border py-3 text-sm font-semibold';

  switch (step.kind) {
    case 'intro':
      return shell('Scanner au comptoir', (
        <div className="flex flex-1 flex-col justify-center gap-4 text-center">
          <Icon name="qrcode" size={64} className="mx-auto" color={t.flare} />
          <p className="text-base">{TXT.camera}</p>
          <button className={primary} style={{ background: t.flare, color: '#fff' }} onClick={() => setStep({ kind: 'camera' })}>Ouvrir la caméra</button>
          <button className={secondary} style={{ borderColor: t.chipBorder }} onClick={() => setStep({ kind: 'pinChoose' })}>Le serveur a un code PIN</button>
        </div>
      ));
    case 'camera':
      return shell('Scanner au comptoir', (
        <>
          <Camera t={t} onResult={onQr} onError={() => setStep({ kind: 'error', message: TXT.noCamera, offerPin: true })} paused={busy} />
          <button className={`${secondary} mt-4`} style={{ borderColor: t.chipBorder }} onClick={() => setStep({ kind: 'pinChoose' })}>Problème de caméra ? Code PIN du serveur</button>
        </>
      ));
    case 'location':
      return shell(step.partner.nom, (
        <div className="flex flex-1 flex-col justify-center gap-4 text-center">
          <Icon name="pin" size={56} className="mx-auto" color={t.flare} />
          <p className="text-base">{TXT.position}</p>
          <button className={primary} disabled={busy} style={{ background: t.flare, color: '#fff' }} onClick={() => checkLocation(step)}>{busy ? 'Vérification…' : 'Vérifier ma position'}</button>
        </div>
      ));
    case 'firstVisit':
      return shell(step.partner.nom, (
        <div className="flex flex-1 flex-col justify-center gap-4 text-center">
          <p className="font-display text-3xl">Première fois chez {step.partner.nom} ?</p>
          <div className="grid grid-cols-2 gap-3">
            <button className={primary} style={{ background: t.flare, color: '#fff' }} onClick={() => validate(step, true)}>Oui</button>
            <button className={primary} style={{ background: t.card, color: t.text, border: `1px solid ${t.chipBorder}` }} onClick={() => validate(step, false)}>Non</button>
          </div>
        </div>
      ));
    case 'pinChoose':
      return shell('Code du serveur', (
        <div className="flex flex-1 flex-col gap-2 pt-2">
          <p className="mb-2 text-sm" style={{ color: t.textSoft }}>Chez quel partenaire es-tu ?</p>
          {openPartners.length === 0 && <p className="text-sm" style={{ color: t.textMute }}>{TXT.noGoing}</p>}
          {openPartners.map(p => (
            <button key={p.id} className="rounded-xl border px-4 py-3 text-left" style={{ borderColor: t.chipBorder, background: t.card }} onClick={() => setStep({ kind: 'pin', partner: p })}>
              <span className="block font-semibold">{p.nom}</span><span className="text-xs" style={{ color: t.textSoft }}>{p.offre}</span>
            </button>
          ))}
        </div>
      ));
    case 'pin':
      return shell(step.partner.nom, (
        <PinPad t={t} onSubmit={async pin => {
          if (Date.now() < pinLockedUntil()) return 'Trop d\'essais : réessaie dans quelques minutes.';
          const r = await verifyPin(step.partner.id, pin);
          if (r === 'unavailable') return 'Le code de secours sera disponible très bientôt. Utilise le scan du QR-code.';
          if (r === 'wrong') { registerPinError(); return 'Code incorrect.'; }
          savePref('pinErrors', 0);
          setStep(await checkPartner(step.partner.id, 'pin'));
          return null;
        }} />
      ));
    case 'error':
      return shell('Scanner au comptoir', (
        <div className="flex flex-1 flex-col justify-center gap-4 text-center">
          <Icon name="info" size={56} className="mx-auto" color={t.flare} />
          <p className="text-lg font-semibold">{step.message}</p>
          <button className={primary} style={{ background: t.flare, color: '#fff' }} onClick={() => setStep({ kind: step.offerPin ? 'pinChoose' : 'camera' })}>{step.offerPin ? 'Saisir le code PIN' : 'Scanner à nouveau'}</button>
          <button className={secondary} style={{ borderColor: t.chipBorder }} onClick={onClose}>Fermer</button>
        </div>
      ));
  }
}

// Caméra arrière + lecture du QR (bibliothèque jsQR, chargée seulement à l'ouverture du scanner)
function Camera({ t, onResult, onError, paused }: { t: Theme; onResult: (text: string) => void; onError: () => void; paused: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausedRef = useRef(paused); pausedRef.current = paused;
  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    (async () => {
      try {
        const [{ default: jsQR }] = await Promise.all([import('jsqr')]);
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const tick = () => {
          if (stopped) return;
          if (!pausedRef.current && video.readyState >= 2 && ctx) {
            const w = video.videoWidth, h = video.videoHeight, scale = Math.min(1, 640 / Math.max(w, h));
            canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code && code.data) { onResult(code.data); return; }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { if (!stopped) onError(); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(tr => tr.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl" style={{ background: '#000' }}>
      <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-56 w-56 rounded-2xl border-4" style={{ borderColor: t.flare, boxShadow: '0 0 0 9999px rgba(0,0,0,.35)' }} />
      </div>
      <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white">Vise le QR-code du comptoir</p>
    </div>
  );
}

function PinPad({ t, onSubmit }: { t: Theme; onSubmit: (pin: string) => Promise<string | null> }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const press = async (d: string) => {
    const next = (pin + d).slice(0, 4);
    setPin(next); setMsg(null);
    if (next.length === 4) { const err = await onSubmit(next); setPin(''); if (err) setMsg(err); }
  };
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <p className="text-center text-sm" style={{ color: t.textSoft }}>Le serveur saisit son code à 4 chiffres</p>
      <div className="flex gap-3">{[0, 1, 2, 3].map(i => <span key={i} className="h-4 w-4 rounded-full" style={{ background: i < pin.length ? t.flare : t.chipBorder }} />)}</div>
      {msg && <p className="text-center text-sm font-semibold" style={{ color: t.flare }}>{msg}</p>}
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k === '' ? <span key="e" /> : (
          <button key={k} onClick={() => (k === '⌫' ? setPin(p => p.slice(0, -1)) : press(k))} className="h-16 w-16 rounded-full text-2xl font-semibold" style={{ background: t.card, color: t.text, border: `1px solid ${t.chipBorder}` }}>{k}</button>
        ))}
      </div>
    </div>
  );
}
