import type { MatchEvent } from '../types';
import type { Theme } from '../theme';
import { Icon } from './Icon';

// Carte d'un match TERMINÉ : volontairement différente d'un match à venir
// (fond gris, pas de pastille ni d'actions de déplacement, score en grand au centre).
export function ResultCard({ t, event: e, side }: { t: Theme; event: MatchEvent & { distanceKm: number }; side?: 'Domicile' | 'Extérieur' }) {
  const hs = e.homeScore ?? 0, as = e.awayScore ?? 0;
  const homeWin = hs > as, awayWin = as > hs;
  const team = (name: string, win: boolean, forfeit: boolean) => (
    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: win ? t.text : t.textSoft }}>
      {name}{forfeit && <span className="ml-1 text-[10px] font-normal" style={{ color: t.flare }}>(forfait)</span>}
    </span>
  );
  return (
    <div className="rounded-xl border border-dashed px-3 py-2.5" style={{ background: t.inputBg, borderColor: t.chipBorder }}>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px]" style={{ color: t.textMute }}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="rounded px-1.5 py-0.5 font-bold tracking-wider" style={{ background: t.textMute, color: t.inputBg }}>TERMINÉ</span>
          <span className="truncate">{e.competition}</span>
        </span>
        <span className="shrink-0">{side ? `${side} · ` : ''}{e.distanceKm} km</span>
      </div>
      <div className="flex items-center gap-2">
        {team(e.home, homeWin, e.forfeit === 'home')}
        <span className="font-display shrink-0 rounded-md px-2.5 py-0.5 text-xl tabular-nums" style={{ background: t.card, color: t.text }}>
          {hs} <span style={{ color: t.textMute }}>-</span> {as}
        </span>
        <span className="flex min-w-0 flex-1 justify-end">{team(e.away, awayWin, e.forfeit === 'away')}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]" style={{ color: t.textMute }}>
        <span className="truncate">{e.dayLabel} · {e.venue || 'Stade non précisé'}</span>
        {e.detailsUrl && (
          <a href={e.detailsUrl} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-0.5 font-semibold" style={{ color: t.textSoft }}>
            Détails <Icon name="arrow-up-right" size={11} />
          </a>
        )}
      </div>
    </div>
  );
}
