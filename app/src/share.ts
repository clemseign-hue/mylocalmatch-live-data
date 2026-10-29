import type { MatchEvent } from './types';

// Adresse de l'appli pointant sur un match précis (ouverte, elle sélectionne ce match).
export const matchUrl = (e: MatchEvent) => `${location.origin}${location.pathname}?match=${encodeURIComponent(e.id)}`;

const matchTitle = (e: MatchEvent) => `${e.home} - ${e.away}`;

// Partage via la feuille de partage de l'iPhone ; à défaut, copie du lien.
export async function shareMatch(e: MatchEvent): Promise<'shared' | 'copied' | 'cancelled'> {
  const text = `${matchTitle(e)} · ${e.dayLabel} ${e.time}${e.venue ? ` · ${e.venue}` : ''}`;
  const url = matchUrl(e);
  if (navigator.share) {
    try { await navigator.share({ title: matchTitle(e), text, url }); return 'shared'; } catch { return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); return 'copied'; } catch { return 'cancelled'; }
}

// Fichier calendrier (.ics) : l'iPhone propose « Ajouter au calendrier ». Durée indicative : 2 h.
export function calendarHref(e: MatchEvent) {
  const [h, m] = (e.time || '15:00').split(':').map(Number);
  const start = new Date(`${e.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
  const esc = (s: string) => s.replace(/[\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MyLocalMatch//FR', 'BEGIN:VEVENT',
    `UID:${e.id}@mylocalmatch`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(`⚽ ${matchTitle(e)}`)}`,
    `LOCATION:${esc([e.venue.split(',')[0], e.address].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${esc(`${e.competition}\nHoraire à vérifier : ${e.detailsUrl || ''}\n${matchUrl(e)}`)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
