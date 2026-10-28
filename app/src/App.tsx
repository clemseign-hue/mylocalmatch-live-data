import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Club, MatchEvent, Place } from './types';
import { DATE_FILTERS, LEVELS, SPORTS, THEMES } from './theme';
import { REFRESH_INTERVAL_MS, addDaysISO, fetchEvents, haversineKm, isWeekendDate, loadPref, savePref, todayISO } from './data';
import { Icon } from './components/Icon';
import { MatchMap } from './components/MatchMap';
import { EventCard } from './components/EventCard';
import { LocationSheet } from './components/LocationSheet';
import { TicketSheet } from './components/TicketSheet';
import { ClubSheet } from './components/ClubSheet';

const DEFAULT_PLACE: Place = { label: 'Lyon', lat: 45.7640, lng: 4.8357 };
const PAGE_SIZE = 40;
type FetchState = 'idle' | 'loading' | 'ok' | 'error';

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return dark;
}

export default function App() {
  const [sport, setSport] = useState('tous');
  const [level, setLevel] = useState('tous');
  const [date, setDate] = useState('tous');
  const [selected, setSelected] = useState<string | null>(null);
  const [place, setPlace] = useState<Place>(() => loadPref('place', DEFAULT_PLACE));
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [club, setClub] = useState<string | null>(() => loadPref('club', null));
  const [showClubs, setShowClubs] = useState(false);
  const [ticketEvent, setTicketEvent] = useState<MatchEvent | null>(null);
  const [manualMode, setManualMode] = useState<'dark' | 'light' | null>(() => loadPref('theme', null));
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const listRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const systemDark = useSystemDark();
  const isDark = manualMode ? manualMode === 'dark' : systemDark;
  const t = THEMES[isDark ? 'dark' : 'light'];

  useEffect(() => {
    document.body.style.background = t.bg;
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', t.bg));
  }, [t.bg]);

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setManualMode(next);
    savePref('theme', next);
  };

  const choosePlace = (p: Place) => {
    setPlace(p);
    savePref('place', p);
    setShowLocation(false);
    setSelected(null);
  };

  const chooseClub = (name: string | null) => {
    setClub(name);
    savePref('club', name);
    setShowClubs(false);
    setSelected(null);
  };

  const refresh = useCallback(async () => {
    setFetchState(s => (s === 'ok' ? 'ok' : 'loading'));
    try {
      const { events, generatedAt } = await fetchEvents();
      setEvents(events);
      setLastUpdated(generatedAt);
      setFetchState('ok');
    } catch {
      setFetchState('error');
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  // Filtres : un match déjà joué ne s'affiche jamais, quel que soit le filtre de date.
  const filtered = useMemo(() => {
    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);
    const weekEnd = addDaysISO(today, 7);
    return events
      .filter(e => !club || e.homeClub === club || e.awayClub === club)
      .filter(e => sport === 'tous' || e.sport === sport)
      .filter(e => level === 'tous' || e.level === level)
      .filter(e => {
        if (!e.date) return true;
        if (e.date < today) return false;
        if (date === 'aujourdhui') return e.date === today;
        if (date === 'demain') return e.date === tomorrow;
        if (date === 'weekend') return e.date <= weekEnd && isWeekendDate(e.date);
        if (date === 'semaine') return e.date <= weekEnd;
        return true;
      })
      .map(e => ({ ...e, distanceKm: Math.round(haversineKm(place.lat, place.lng, e.lat, e.lng) * 10) / 10 }))
      .sort((a, b) => club
        ? (a.date || '').localeCompare(b.date || '') || a.time.localeCompare(b.time)
        : a.distanceKm - b.distanceKm || (a.date || '').localeCompare(b.date || '') || a.time.localeCompare(b.time));
  }, [events, sport, level, date, place, club]);

  // Liste des clubs (équipes réserves regroupées) avec leur nombre de matchs à venir
  const clubs = useMemo<Club[]>(() => {
    const today = todayISO();
    const counts = new Map<string, number>();
    for (const e of events) {
      if (e.date && e.date < today) continue;
      for (const c of new Set([e.homeClub, e.awayClub])) counts.set(c, (counts.get(c) || 0) + 1);
    }
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [events]);

  useEffect(() => setVisible(PAGE_SIZE), [sport, level, date, place, club]);

  const selectEvent = (id: string) => {
    setSelected(id);
    const index = filtered.findIndex(e => e.id === id);
    if (index >= visible) setVisible(index + 10);
    requestAnimationFrame(() => listRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const handleLocate = () => {
    if (!navigator.geolocation) { setLocateError(true); return; }
    setLocating(true);
    setLocateError(false);
    navigator.geolocation.getCurrentPosition(
      pos => { setLocating(false); choosePlace({ label: 'Ma position', lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => { setLocating(false); setLocateError(true); },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  };

  const chip = (active: boolean) => (active
    ? { background: t.chipActiveBg, color: t.chipActiveText, borderColor: t.chipActiveBg }
    : { borderColor: t.chipBorder, color: t.textSoft });
  const smallChip = (active: boolean) => (active
    ? { background: t.flare, color: '#FFFFFF', borderColor: t.flare }
    : { borderColor: t.border, color: t.textMute });

  const count = filtered.length;
  return (
    <div className="font-body min-h-screen w-full transition-colors duration-300" style={{ background: t.bg, color: t.text }}>
      <header className="border-b px-4 pb-4" style={{ borderColor: t.border, paddingTop: 'calc(env(safe-area-inset-top) + 20px)' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-display text-3xl leading-none">MyLocal<span style={{ color: t.flare }}>Match</span></h1>
            <button onClick={() => setShowLocation(true)} className="mt-1 flex max-w-full items-center gap-1 text-[11px] uppercase tracking-[0.1em]" style={{ color: t.textSoft }}>
              <Icon name="pin" size={11} /> <span className="truncate">{place.label}</span> <span className="shrink-0" style={{ color: t.textMute }}>· changer</span>
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={toggleTheme} aria-label="Basculer le thème" className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: t.chipBorder }}>
              <Icon name={isDark ? 'sun' : 'moon'} size={15} color={isDark ? t.gold : t.textSoft} />
            </button>
            <button onClick={handleLocate} className="flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition active:scale-95" style={{ borderColor: t.chipBorder, background: t.card }}>
              <Icon name="navigation" size={14} color={place.label === 'Ma position' ? t.gold : t.textSoft} className={locating ? 'animate-pulse' : ''} />
              {locating ? '…' : 'GPS'}
            </button>
          </div>
        </div>
        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
          {SPORTS.map(s => (
            <button key={s.id} onClick={() => setSport(s.id)} className="shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition" style={chip(sport === s.id)}>{s.label}</button>
          ))}
        </div>
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {DATE_FILTERS.map(d => (
            <button key={d.id} onClick={() => setDate(d.id)} className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition" style={smallChip(date === d.id)}>{d.label}</button>
          ))}
        </div>
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {LEVELS.map(l => (
            <button key={l.id} onClick={() => setLevel(l.id)} className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition" style={smallChip(level === l.id)}>{l.label}</button>
          ))}
        </div>
        {club ? (
          <div className="mt-3 flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: t.gold, background: t.gold + '1A' }}>
            <Icon name="search" size={14} color={t.gold} />
            <button onClick={() => setShowClubs(true)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold" style={{ color: t.text }}>{club}</button>
            <button onClick={() => chooseClub(null)} aria-label="Voir tous les clubs" className="flex shrink-0 items-center gap-1 text-[11px] font-semibold" style={{ color: t.textSoft }}>
              Tous les clubs <Icon name="x" size={14} />
            </button>
          </div>
        ) : (
          <button onClick={() => setShowClubs(true)} className="mt-3 flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm" style={{ background: t.inputBg, color: t.textMute }}>
            <Icon name="search" size={14} /> Choisir un club (domicile et extérieur)…
          </button>
        )}
      </header>

      <section className="px-4 pb-2 pt-4">
        <MatchMap t={t} dark={isDark} events={filtered} center={place} selectedId={selected} onSelect={selectEvent} fitKey={club} />
        <p className="mt-3 text-center text-[11px]" style={{ color: t.textMute }}>
          {count} match{count > 1 ? 's' : ''} à venir{club ? ` pour ${club}` : ''} · touche un point pour voir le match
        </p>
        <div className="mt-1 flex items-center justify-center gap-1.5 text-center text-[10px]" style={{ color: t.textMute }}>
          {fetchState === 'loading' && <span>Chargement des matchs…</span>}
          {fetchState === 'ok' && lastUpdated && (
            <span>Données mises à jour le {new Date(lastUpdated).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          )}
          {fetchState === 'error' && <span>Impossible de récupérer les matchs (hors-ligne ?). Réessaie dans un instant.</span>}
        </div>
        {locateError && (
          <p className="mt-2 text-center text-[11px]" style={{ color: t.flare }}>
            Position indisponible : autorise la localisation pour Safari dans Réglages, ou choisis une ville.
          </p>
        )}
      </section>

      <section className="space-y-4 px-4 pb-10 pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)' }}>
        {fetchState === 'ok' && count === 0 && (
          <div className="py-16 text-center text-sm" style={{ color: t.textMute }}>Aucun match pour ces filtres. Essaie d'élargir ta recherche.</div>
        )}
        {filtered.slice(0, visible).map(e => (
          <EventCard key={e.id} ref={el => { listRefs.current[e.id] = el; }} t={t} event={e} selected={selected === e.id}
            side={club ? (e.homeClub === club ? 'Domicile' : 'Extérieur') : undefined}
            onSelect={() => selectEvent(e.id)} onTicket={() => setTicketEvent(e)} />
        ))}
        {visible < count && (
          <button onClick={() => setVisible(v => v + PAGE_SIZE)} className="w-full rounded-full border py-3 text-sm font-semibold" style={{ borderColor: t.chipBorder, color: t.text, background: t.card }}>
            Voir plus de matchs ({count - visible} restants)
          </button>
        )}
        <div className="flex gap-2 rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed" style={{ borderColor: t.border, color: t.textMute }}>
          <Icon name="info" size={13} className="mt-0.5 shrink-0" />
          <span>
            Football amateur Auvergne-Rhône-Alpes (R1, R2, R3) d'après les calendriers officiels LAuRAFoot / FFF,
            mis à jour automatiquement chaque semaine. Les matchs déjà joués disparaissent de la liste. Vérifie l'horaire sur « Détails » avant de te déplacer.
          </span>
        </div>
      </section>

      {selected && !ticketEvent && !showLocation && !showClubs && (
        <button onClick={() => setSelected(null)} className="fixed bottom-5 right-5 z-[700] flex h-10 w-10 items-center justify-center rounded-full border"
          style={{ background: t.card, borderColor: t.chipBorder, color: t.textSoft, marginBottom: 'env(safe-area-inset-bottom)' }} aria-label="Fermer la sélection">
          <Icon name="x" size={16} />
        </button>
      )}
      {showClubs && <ClubSheet t={t} clubs={clubs} onSelect={chooseClub} onClose={() => setShowClubs(false)} />}
      {showLocation && <LocationSheet t={t} locating={locating} onLocate={handleLocate} onSelect={choosePlace} onClose={() => setShowLocation(false)} />}
      {ticketEvent && <TicketSheet t={t} event={ticketEvent} onClose={() => setTicketEvent(null)} />}
    </div>
  );
}
