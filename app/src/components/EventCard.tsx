import { forwardRef, useEffect, useState } from 'react';
import type { MatchEvent } from '../types';
import { sportColor, sportInitial, type Theme } from '../theme';
import { Icon } from './Icon';
import { calendarHref, shareMatch } from '../share';
import { FINAL_GOING_LOCK, VALIDATION_SCREEN_MS, type Coupon, type Partner } from '../partners';

export interface CardOffer { partner: Partner; km: number; coupon?: Coupon }

interface Props {
  t: Theme; event: MatchEvent & { distanceKm: number }; side?: 'Domicile' | 'Extérieur'; favorite: boolean; selected: boolean;
  onSelect: () => void; onCopied: () => void;
  going: boolean; goingOpen: boolean; goingLocked: boolean; blockedBy: string | null; onToggleGoing: () => void; offers: CardOffer[]; onScan: () => void; onShowValidation: (o: CardOffer) => void;
}

// Itinéraire Plans : coordonnées exactes si le stade a été localisé précisément,
// sinon on laisse Plans chercher le stade par son nom et son adresse (plus fiable qu'un point approximatif).
function directionsUrl(e: MatchEvent) {
  if (!e.approximate) return `https://maps.apple.com/?daddr=${e.lat},${e.lng}&dirflg=d`;
  const stadium = e.venue.split(',')[0].replace(/\s+\d+$/, '');
  const where = [stadium, e.address].filter(Boolean).join(', ');
  return `https://maps.apple.com/?daddr=${encodeURIComponent(where || `${e.lat},${e.lng}`)}&dirflg=d`;
}

export const EventCard = forwardRef<HTMLDivElement, Props>(function EventCard({ t, event: e, side, favorite, selected, onSelect, onCopied, going, goingOpen, goingLocked, blockedBy, onToggleGoing, offers, onScan, onShowValidation }, ref) {
  // Match avec offre : premier toucher = avertissement, second toucher (dans les 4 s) = confirmation définitive
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const tm = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(tm); }, [armed]);
  useEffect(() => { if (!selected) setArmed(false); }, [selected]);
  const pressGoing = () => {
    if (!going && e.hasOffer && !armed) { setArmed(true); return; }
    setArmed(false);
    onToggleGoing();
  };
  return (
    <div ref={ref} onClick={onSelect} className="relative cursor-pointer overflow-hidden rounded-xl border transition"
      style={{ borderColor: selected ? t.gold : t.border, background: t.card }}>
      <div className="flex">
        <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 border-r border-dashed"
          style={{ background: sportColor(e.sport) + '1A', borderColor: t.dashed }}>
          <span className="font-display flex h-9 w-9 items-center justify-center rounded-full text-sm" style={{ background: sportColor(e.sport), color: '#111113' }}>
            {sportInitial(e.sport)}
          </span>
          <span className="text-[9px] font-semibold" style={{ color: t.textSoft }}>{e.distanceKm} km</span>
        </div>
        <div className="min-w-0 flex-1 px-4 py-3">
          <h3 className="font-display text-lg leading-tight">
            {favorite && <Icon name="star" size={13} color={t.gold} filled className="mr-1 inline-block -translate-y-0.5" />}
            {e.home} <span style={{ color: t.gold }}>vs</span> {e.away}
          </h3>
          {e.hasOffer && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: t.flare, color: '#FFFFFF' }}>
              <Icon name="gift" size={12} /> Offre partenaire
            </span>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: t.textSoft }}>
            {side && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={side === 'Domicile' ? { background: t.gold + '26', color: t.gold } : { background: t.chipBorder + '66', color: t.textSoft }}>
                {side}
              </span>
            )}
            {e.competition}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: t.text }}>
            <span className="flex items-center gap-1"><Icon name="calendar" size={12} color={t.textMute} /> {e.dayLabel}</span>
            <span className="flex items-center gap-1"><Icon name="clock" size={12} color={t.textMute} /> {e.time}</span>
            {e.venue && <span className="flex min-w-0 items-center gap-1"><Icon name="pin" size={12} color={t.textMute} className="shrink-0" /> <span className="truncate">{e.venue}</span></span>}
          </div>
          {selected && e.address && <p className="mt-1 text-[11px]" style={{ color: t.textSoft }}>{e.address}</p>}
          {e.approximate && <p className="mt-1 text-[10px]" style={{ color: t.textMute }}>Position sur la carte approximative</p>}
          {going && !selected && <p className="mt-1 text-[11px] font-semibold" style={{ color: t.flare }}>Je vais au match ✓</p>}
        </div>
      </div>
      {selected && (
        <div className="border-t border-dashed px-4 py-3" style={{ borderColor: t.dashed }}>
          {!going && blockedBy ? (
            <p className="rounded-xl px-3 py-2.5 text-center text-[12px] font-semibold" style={{ background: t.inputBg, color: t.textSoft }}>
              « J'y vais » déjà validé pour {blockedBy} ce jour-là (choix définitif).
            </p>
          ) : going || goingOpen ? (
            <>
              {!going && e.hasOffer && (
                <div className="mb-2 flex gap-2 rounded-xl border-2 px-3 py-2.5 text-[12px] leading-snug" style={{ borderColor: t.flare, background: t.flare + '14', color: t.text }}>
                  <Icon name="info" size={16} color={t.flare} className="mt-0.5 shrink-0" />
                  {FINAL_GOING_LOCK
                    ? <span><strong>Ce match donne accès à une offre partenaire.</strong> En confirmant « J'y vais », ta validation est <strong>définitive</strong> : tu ne pourras plus choisir un autre match ce jour-là.</span>
                    : <span><strong>Ce match donne accès à une offre partenaire.</strong> Un seul « J'y vais » par jour : l'offre n'est valable que pour le match choisi.</span>}
                </div>
              )}
              <button onClick={ev => { ev.stopPropagation(); pressGoing(); }} className="w-full rounded-full py-2.5 text-sm font-semibold transition"
                style={going ? { background: t.flare + '1F', color: t.flare, border: `1px solid ${t.flare}` }
                  : armed ? { background: t.text, color: t.bg, animation: 'mlm-pulse .8s ease-in-out infinite' } : { background: t.flare, color: '#FFFFFF' }}>
                {going ? 'Je vais au match ✓' : armed ? 'Touche encore pour confirmer' : e.hasOffer ? "J'y vais (2 touchers pour confirmer)" : "J'y vais"}
              </button>
              <p className="mt-1 text-center text-[10px]" style={{ color: t.textMute }}>
                {goingLocked ? 'Choix définitif pour ce jour' : going ? 'Touche à nouveau pour annuler' : 'Un seul match par jour'}
              </p>
            </>
          ) : (
            <p className="rounded-full py-2 text-center text-[12px] font-semibold" style={{ background: t.inputBg, color: t.textMute }}>
              « J'y vais » disponible la semaine du match
            </p>
          )}
          {offers.length > 0 && (
            <div className="mt-3 rounded-xl p-3" style={{ background: t.inputBg }} onClick={ev => ev.stopPropagation()}>
              <p className="font-display mb-2 text-lg">Après le match</p>
              <div className="space-y-2">
                {offers.map(o => {
                  const recent = o.coupon && Date.now() - new Date(o.coupon.at).getTime() < VALIDATION_SCREEN_MS;
                  return (
                    <div key={o.partner.id} className="rounded-lg px-3 py-2" style={{ background: t.card }}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{o.partner.nom}</span>
                        <span className="shrink-0 text-[11px]" style={{ color: t.textMute }}>{o.km < 1 ? `${Math.round(o.km * 1000)} m` : `${o.km.toFixed(1)} km`} du stade</span>
                      </div>
                      <p className="text-[13px]" style={{ color: o.coupon ? t.textMute : t.gold }}>{o.partner.offre}</p>
                      {o.coupon && (
                        <p className="mt-0.5 flex items-center justify-between text-[11px]" style={{ color: t.textMute }}>
                          Utilisée le {new Date(o.coupon.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à {new Date(o.coupon.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {recent && <button className="font-semibold underline" style={{ color: t.flare }} onClick={() => onShowValidation(o)}>Revoir l'écran</button>}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {(
                <button onClick={onScan} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold" style={{ background: t.flare, color: '#FFFFFF' }}>
                  <Icon name="qrcode" size={16} /> Scanner au comptoir
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {selected && (
        <div className="grid grid-cols-4 border-t border-dashed" style={{ borderColor: t.dashed }}>
          <a href={directionsUrl(e)} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()}
            className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold" style={{ color: t.gold }}>
            <Icon name="route" size={16} /> Itinéraire
          </a>
          <a href={calendarHref(e)} download={`match-${e.id}.ics`} onClick={ev => ev.stopPropagation()}
            className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold" style={{ color: t.text }}>
            <Icon name="calendar-plus" size={16} /> Calendrier
          </a>
          <button onClick={async ev => { ev.stopPropagation(); if (await shareMatch(e) === 'copied') onCopied(); }}
            className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold" style={{ color: t.text }}>
            <Icon name="share" size={16} /> Partager
          </button>
          {e.detailsUrl ? (
            <a href={e.detailsUrl} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()}
              className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium" style={{ color: t.textSoft }}>
              <Icon name="arrow-up-right" size={16} /> Détails
            </a>
          ) : <span />}
        </div>
      )}
    </div>
  );
});
