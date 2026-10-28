import { forwardRef } from 'react';
import type { MatchEvent } from '../types';
import { sportColor, sportInitial, type Theme } from '../theme';
import { Icon } from './Icon';

interface Props { t: Theme; event: MatchEvent & { distanceKm: number }; side?: 'Domicile' | 'Extérieur'; selected: boolean; onSelect: () => void; onTicket: () => void }

// Itinéraire Plans : coordonnées exactes si le stade a été localisé précisément,
// sinon on laisse Plans chercher le stade par son nom et son adresse (plus fiable qu'un point approximatif).
function directionsUrl(e: MatchEvent) {
  if (!e.approximate) return `https://maps.apple.com/?daddr=${e.lat},${e.lng}&dirflg=d`;
  const stadium = e.venue.split(',')[0].replace(/\s+\d+$/, '');
  const where = [stadium, e.address].filter(Boolean).join(', ');
  return `https://maps.apple.com/?daddr=${encodeURIComponent(where || `${e.lat},${e.lng}`)}&dirflg=d`;
}

export const EventCard = forwardRef<HTMLDivElement, Props>(function EventCard({ t, event: e, side, selected, onSelect, onTicket }, ref) {
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
        </div>
      </div>
      {selected && (
        <div className="flex items-center justify-between gap-2 border-t border-dashed px-4 py-2.5" style={{ borderColor: t.dashed }}>
          <button onClick={ev => { ev.stopPropagation(); onTicket(); }} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: t.flare }}>
            <Icon name="ticket" size={13} /> Billetterie
          </button>
          <a href={directionsUrl(e)} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()}
            className="flex items-center gap-1 text-xs font-semibold" style={{ color: t.gold }}>
            <Icon name="route" size={13} /> Itinéraire
          </a>
          {e.detailsUrl && (
            <a href={e.detailsUrl} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()}
              className="flex items-center gap-1 text-xs font-medium" style={{ color: t.textSoft }}>
              Détails <Icon name="arrow-up-right" size={13} />
            </a>
          )}
        </div>
      )}
    </div>
  );
});
