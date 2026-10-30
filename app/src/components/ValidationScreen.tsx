import { useEffect, useState } from 'react';
import { dayCode, VALIDATION_SCREEN_MS, type Coupon, type Partner } from '../partners';
import { Icon } from './Icon';

// Écran à montrer au serveur (F07) : heure qui défile à la seconde, fond animé, couleur et mot du jour.
// Après 10 minutes (R07), il affiche « Offre utilisée » sans animation.
export function ValidationScreen({ partner, coupon, onClose }: { partner: Partner; coupon: Coupon; onClose: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const at = new Date(coupon.at);
  const expired = now.getTime() - at.getTime() > VALIDATION_SCREEN_MS;
  const { color, word } = dayCode(now);
  const clock = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const usedAt = `${at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col items-center justify-center overflow-hidden px-6 text-center text-white"
      style={expired ? { background: '#2C2C2E' } : { background: `linear-gradient(135deg, ${color}, #111113, ${color})`, backgroundSize: '400% 400%', animation: 'mlm-wave 6s ease infinite' }}>
      {!expired && <div className="pointer-events-none absolute -inset-1/2" style={{ background: `conic-gradient(from 0deg, transparent, ${color}55, transparent 40%)`, animation: 'mlm-spin 4s linear infinite' }} />}
      <button onClick={onClose} className="absolute right-4 flex items-center gap-1 rounded-full bg-black/40 px-3 py-1.5 text-sm font-semibold" style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}>
        Fermer <Icon name="x" size={14} />
      </button>
      <div className="relative">
        {expired ? (
          <>
            <p className="font-display text-4xl">Offre utilisée</p>
            <p className="mt-2 text-sm opacity-80">{partner.nom} · le {usedAt}</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/20"><Icon name="check" size={44} /></div>
            <p className="font-display text-4xl leading-none">Offre validée ✓</p>
            <p className="mt-3 text-xl font-semibold">{partner.offre}</p>
            <p className="mt-1 text-base opacity-90">{partner.nom}</p>
            <p className="font-display mt-8 text-6xl tabular-nums">{clock}</p>
            <div className="mt-6 inline-block rounded-2xl border-4 border-white/80 px-6 py-2" style={{ background: color }}>
              <p className="text-[11px] font-bold uppercase tracking-widest opacity-90">Mot du jour</p>
              <p className="font-display text-4xl">{word}</p>
            </div>
            <p className="mt-6 text-sm font-semibold">Montre cet écran au serveur</p>
          </>
        )}
      </div>
    </div>
  );
}
