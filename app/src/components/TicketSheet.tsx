import { useMemo, useState } from 'react';
import type { MatchEvent } from '../types';
import { PRICING, type Theme } from '../theme';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

const LABELS = ['Plein tarif', 'Tarif réduit', 'Enfant -12 ans'];

// Billetterie de démonstration : aucun paiement réel.
export function TicketSheet({ t, event, onClose }: { t: Theme; event: MatchEvent; onClose: () => void }) {
  const pricing = PRICING[event.sport] || [10, 7, 4];
  const [qty, setQty] = useState([0, 0, 0]);
  const [confirmed, setConfirmed] = useState(false);
  const code = useMemo(() => `MLM-${event.id}-${Math.floor(1000 + Math.random() * 9000)}`, [event.id]);
  const total = qty.reduce((sum, q, i) => sum + q * pricing[i], 0);
  const count = qty.reduce((a, b) => a + b, 0);
  const change = (i: number, delta: number) => setQty(prev => prev.map((v, idx) => (idx === i ? Math.max(0, v + delta) : v)));
  const round = 'flex h-8 w-8 items-center justify-center rounded-full border';

  if (confirmed) {
    return (
      <Sheet t={t} onClose={onClose}>
        <div className="py-4 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: t.gold + '26' }}>
            <Icon name="check" size={24} color={t.gold} />
          </div>
          <h2 className="font-display mb-1 text-xl">Réservation confirmée</h2>
          <p className="mb-5 text-sm" style={{ color: t.textSoft }}>{count} billet{count > 1 ? 's' : ''} pour {event.home} vs {event.away}</p>
          <div className="mb-5 rounded-xl border-2 border-dashed p-4" style={{ borderColor: t.dashed }}>
            <Icon name="qrcode" size={64} className="mx-auto mb-2" color={t.text} />
            <p className="font-mono text-[11px]" style={{ color: t.textMute }}>{code}</p>
          </div>
          <button onClick={onClose} className="w-full rounded-full py-3 text-sm font-semibold" style={{ background: t.card, border: `1px solid ${t.chipBorder}`, color: t.text }}>Fermer</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet t={t} onClose={onClose}>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-xl">Billetterie</h2>
        <button onClick={onClose} aria-label="Fermer"><Icon name="x" size={18} color={t.textSoft} /></button>
      </div>
      <p className="mb-4 text-sm" style={{ color: t.textSoft }}>
        {event.home} <span style={{ color: t.gold }}>vs</span> {event.away} · {event.dayLabel} {event.time}
      </p>
      <div className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]" style={{ background: t.flare + '1A', color: t.flare }}>
        <Icon name="info" size={13} /> Billetterie de démonstration — tarifs indicatifs, pas le site officiel de vente.
      </div>
      <div className="mb-5 space-y-3">
        {LABELS.map((label, i) => (
          <div key={label} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: t.inputBg }}>
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs" style={{ color: t.textMute }}>{pricing[i]} €</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => change(i, -1)} className={round} style={{ borderColor: t.chipBorder }} aria-label="Retirer"><Icon name="minus" size={12} /></button>
              <span className="w-4 text-center text-sm font-semibold">{qty[i]}</span>
              <button onClick={() => change(i, 1)} className={round} style={{ borderColor: t.chipBorder }} aria-label="Ajouter"><Icon name="plus" size={12} /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm" style={{ color: t.textSoft }}>Total</span>
        <span className="font-display text-2xl">{total.toFixed(2).replace('.', ',')} €</span>
      </div>
      <button disabled={count === 0} onClick={() => setConfirmed(true)} className="w-full rounded-full py-3 text-sm font-semibold disabled:opacity-40" style={{ background: t.flare, color: '#FFFFFF' }}>
        Confirmer la réservation
      </button>
    </Sheet>
  );
}
