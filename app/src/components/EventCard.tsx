import { forwardRef } from 'react';
import type { MatchEvent } from '../types';
import { sportColor, sportInitial, type Theme } from '../theme';
import { Icon } from './Icon';
import { calendarHref, shareMatch } from '../share';
import { VALIDATION_SCREEN_MS, type Coupon, type Partner } from '../partners';

export interface CardOffer { partner: Partner; km: number; coupon?: Coupon }

interface Props {
  t: Theme; event: MatchEvent & { distanceKm: number }; side?: 'Domicile' | 'Extérieur'; favorite: boolean; selected: boolean;
  onSelect: () => void; onCopied: () => void;
  going: boolean; onToggleGoing: () => void; offers: CardOffer[]; onScan: () => void; onShowValidation: (o: CardOffer) => void;
}

// Itinéraire Plans : coordonnées exactes si le stade a été localisé précisément,
// sinon on laisse Plans chercher le stade par son nom et son adresse (plus fiable qu'un point approximatif).
function directionsUrl(e: MatchEvent) {
  if (!e.approximate) return `https://maps.apple.com/?daddr=${e.lat},${e.lng}&dirflg=d`;
  const stadium = e.venue.split(',')[0].replace(/\s+\d+$/, '');
  const where = [stadium, e.address].filter(Boolean).join(', ');
  return `https://maps.apple.com/?daddr=${encodeURIComponent(where || `${e.lat},${e.lng}`)}&dirflg=d`;
}

export const EventCard = forwardRef<HTMLDivElement, Props>(function EventCard({ t, event: e, side, favorite, selected, onSelect, onCopied, going, onToggleGoing, offers, onScan, onShowValidation }, ref) {
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
          <button onClick={ev => { ev.stopPropagation(); onToggleGoing(); }} className="w-full rounded-full py-2.5 text-sm font-semibold transition"
            style={going ? { background: t.flare + '1F', color: t.flare, border: `1px solid ${t.flare}` } : { background: t.flare, color: '#FFFFFF' }}>
            {going ? 'Je vais au match ✓' : "J'y vais"}
          </button>
          {going && <p className="mt-1 text-center text-[10px]" style={{ color: t.textMute }}>Touche à nouveau pour annuler</p>}
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
