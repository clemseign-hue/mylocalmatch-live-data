import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Club, MatchEvent, Place } from './types';
import { DATE_FILTERS, LEVELS, THEMES } from './theme';
import { DEFAULT_MAP_STYLE } from './mapStyles';
import { REFRESH_INTERVAL_MS, addDaysISO, fetchEvents, haversineKm, isWeekendDate, loadPref, savePref, todayISO } from './data';
import { Icon } from './components/Icon';
import { MatchMap } from './components/MatchMap';
import { EventCard } from './components/EventCard';
import { LocationSheet } from './components/LocationSheet';
import { InfoSheet } from './components/InfoSheet';
import { ResultCard } from './components/ResultCard';
import { ClubSheet } from './components/ClubSheet';

const DEFAULT_PLACE: Place = { label: 'Lyon', lat: 45.7640, lng: 4.8357 };
const PAGE_SIZE = 40;
const RADII = [null, 10, 20, 50] as const; // rayon autour du lieu choisi (null = toutes distances)
type Mode = 'avenir' | 'resultats';
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
  const [level, setLevel] = useState('tous');
  const [date, setDate] = useState('weekend'); // à l'ouverture : les matchs de ce week-end
  const [selected, setSelected] = useState<string | null>(null);
  const [place, setPlace] = useState<Place>(() => loadPref('place', DEFAULT_PLACE));
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [club, setClub] = useState<string | null>(() => loadPref('club', null));
  const [showClubs, setShowClubs] = useState(false);
  const [mapStyle, setMapStyle] = useState<string>(() => loadPref('mapStyle', DEFAULT_MAP_STYLE));
  const [favs, setFavs] = useState<string[]>(() => loadPref('favs', []));
  const [favOnly, setFavOnly] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Lien direct vers un match (?match=…), ouvert une seule fois au chargement
  const pendingMatch = useRef<string | null>(new URLSearchParams(location.search).get('match'));
  const [manualMode, setManualMode] = useState<'dark' | 'light' | null>(() => loadPref('theme', null));
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [results, setResults] = useState<MatchEvent[]>([]);
  const [mode, setMode] = useState<Mode>('avenir');
  const [radius, setRadius] = useState<number | null>(() => loadPref('radius', null));
  const [online, setOnline] = useState(() => navigator.onLine);
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

  const toggleFav = (name: string) => {
    setFavs(prev => {
      const next = prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name];
      savePref('favs', next);
      if (!next.length) setFavOnly(false);
      return next;
    });
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const refresh = useCallback(async () => {
    setFetchState(s => (s === 'ok' ? 'ok' : 'loading'));
    try {
      const { events, results, generatedAt } = await fetchEvents();
      setEvents(events);
      setResults(results);
      setLastUpdated(generatedAt);
      setFetchState('ok');
    } catch {
      setFetchState('error');
    }
  }, []);

  useEffect(() => {
    const on = () => { setOnline(true); refresh(); }, off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [refresh]);

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
      .filter(e => !favOnly || favs.includes(e.homeClub) || favs.includes(e.awayClub))
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
      .filter(e => !radius || club || favOnly || e.distanceKm <= radius) // le rayon ne s'applique pas à un club choisi
      .sort((a, b) => club || favOnly // un club ou mes clubs : ordre chronologique
        ? (a.date || '').localeCompare(b.date || '') || a.time.localeCompare(b.time)
        : a.distanceKm - b.distanceKm || (a.date || '').localeCompare(b.date || '') || a.time.localeCompare(b.time));
  }, [events, level, date, place, club, favOnly, favs, radius]);

  // Résultats (matchs terminés) : mêmes filtres club / mes clubs / niveau / rayon, du plus récent au plus ancien
  const pastResults = useMemo(() => results
    .filter(e => !club || e.homeClub === club || e.awayClub === club)
    .filter(e => !favOnly || favs.includes(e.homeClub) || favs.includes(e.awayClub))
    .filter(e => level === 'tous' || e.level === level)
    .map(e => ({ ...e, distanceKm: Math.round(haversineKm(place.lat, place.lng, e.lat, e.lng) * 10) / 10 }))
    .filter(e => !radius || club || favOnly || e.distanceKm <= radius)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.distanceKm - b.distanceKm),
  [results, club, favOnly, favs, level, place, radius]);

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

  useEffect(() => setVisible(PAGE_SIZE), [level, date, place, club, favOnly, radius, mode]);

  // Ouverture via un lien partagé : on lève les filtres pour être sûr d'afficher le match, puis on le sélectionne.
  useEffect(() => {
    const id = pendingMatch.current;
    if (!id || !events.length) return;
    pendingMatch.current = null;
    history.replaceState(null, '', location.pathname);
    if (!events.some(e => e.id === id)) { showToast('Ce match n\'est plus disponible.'); return; }
    setMode('avenir'); setDate('tous'); setLevel('tous'); setClub(null); setFavOnly(false); setRadius(null);
    setTimeout(() => selectEventRef.current(id), 50);
  }, [events]);

  const selectEvent = (id: string) => {
    setSelected(id);
    const index = filtered.findIndex(e => e.id === id);
    if (index >= visible) setVisible(index + 10);
    requestAnimationFrame(() => listRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const selectEventRef = useRef(selectEvent);
  selectEventRef.current = selectEvent;

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
            <button onClick={() => { const next = RADII[(RADII.indexOf(radius as typeof RADII[number]) + 1) % RADII.length]; setRadius(next); savePref('radius', next); }}
              className="mt-1.5 flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold" style={radius ? { borderColor: t.flare, color: t.flare } : { borderColor: t.chipBorder, color: t.textSoft }}>
              <Icon name="locate" size={11} /> {radius ? `Moins de ${radius} km` : 'Toutes distances'}
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
        <div className="mt-4 grid grid-cols-2 rounded-xl p-1" style={{ background: t.inputBg }} role="tablist">
          {([['avenir', 'À venir', 'calendar'], ['resultats', 'Résultats', 'check']] as const).map(([id, label, icon]) => (
            <button key={id} role="tab" aria-selected={mode === id} onClick={() => { setMode(id); setSelected(null); }}
              className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition"
              style={mode === id ? { background: id === 'avenir' ? t.flare : t.textSoft, color: '#FFFFFF' } : { color: t.textMute }}>
              <Icon name={icon} size={14} /> {label}
            </button>
          ))}
        </div>
        {mode === 'avenir' && (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {DATE_FILTERS.map(d => (
              <button key={d.id} onClick={() => setDate(d.id)} className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition" style={smallChip(date === d.id)}>{d.label}</button>
            ))}
          </div>
        )}
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          <button onClick={() => (favs.length ? setFavOnly(v => !v) : setShowClubs(true))}
            className="flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold transition" style={chip(favOnly)}>
            <Icon name="star" size={11} color={favOnly ? t.chipActiveText : t.gold} filled={favs.length > 0} /> Mes clubs{favs.length ? ` (${favs.length})` : ''}
          </button>
          {LEVELS.map(l => (
            <button key={l.id} onClick={() => setLevel(l.id)} className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition" style={smallChip(level === l.id)}>{l.label}</button>
          ))}
        </div>
        {club ? (
          <div className="mt-3 flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: t.gold, background: t.gold + '1A' }}>
            <button onClick={() => toggleFav(club)} aria-label={favs.includes(club) ? 'Retirer de mes clubs' : 'Ajouter à mes clubs'}>
              <Icon name="star" size={16} color={t.gold} filled={favs.includes(club)} />
            </button>
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

      {mode === 'resultats' ? (
        <ResultsSection t={t} results={pastResults} club={club} visible={visible} onMore={() => setVisible(v => v + PAGE_SIZE)}
          lastUpdated={lastUpdated} fetchState={fetchState} online={online} />
      ) : (<>
      <section className="px-4 pb-2 pt-4">
        <MatchMap t={t} events={filtered} center={place} selectedId={selected} onSelect={selectEvent} fitKey={club}
          styleId={mapStyle} onStyleChange={id => { setMapStyle(id); savePref('mapStyle', id); }} />
        <p className="mt-3 text-center text-[11px]" style={{ color: t.textMute }}>
          {count} match{count > 1 ? 's' : ''} à venir{club ? ` pour ${club}` : favOnly ? ' pour mes clubs' : ''} · touche un point pour voir le match
        </p>
        <div className="mt-1 flex items-center justify-center gap-1.5 text-center text-[10px]" style={{ color: t.textMute }}>
          {fetchState === 'loading' && <span>Chargement des matchs…</span>}
          {fetchState === 'ok' && lastUpdated && (
            <span>Données mises à jour le {new Date(lastUpdated).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          )}
          {fetchState === 'error' && <span>Impossible de récupérer les matchs (hors-ligne ?). Réessaie dans un instant.</span>}
        </div>
        {!online && <p className="mt-1 text-center text-[11px] font-semibold" style={{ color: t.flare }}>Hors connexion : derniers matchs enregistrés sur ton téléphone.</p>}
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
            favorite={favs.includes(e.homeClub) || favs.includes(e.awayClub)}
            onSelect={() => selectEvent(e.id)} onCopied={() => showToast('Lien du match copié')} />
        ))}
        {visible < count && (
          <button onClick={() => setVisible(v => v + PAGE_SIZE)} className="w-full rounded-full border py-3 text-sm font-semibold" style={{ borderColor: t.chipBorder, color: t.text, background: t.card }}>
            Voir plus de matchs ({count - visible} restants)
          </button>
        )}
        <div className="flex gap-2 rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed" style={{ borderColor: t.border, color: t.textMute }}>
          <Icon name="info" size={13} className="mt-0.5 shrink-0" />
          <span>
            Football amateur : Auvergne-Rhône-Alpes (R1, R2, R3) et district Drôme-Ardèche (D1 à D4), d'après les calendriers officiels FFF,
            mis à jour automatiquement chaque semaine. Les matchs déjà joués disparaissent de la liste. Vérifie l'horaire sur « Détails » avant de te déplacer.{' '}
            <button onClick={() => setShowInfo(true)} className="font-semibold underline" style={{ color: t.textSoft }}>Infos, sources et mentions légales</button>
          </span>
        </div>
      </section>
      </>)}

      {selected && !showInfo && !showLocation && !showClubs && (
        <button onClick={() => setSelected(null)} className="fixed bottom-5 right-5 z-[700] flex h-10 w-10 items-center justify-center rounded-full border"
          style={{ background: t.card, borderColor: t.chipBorder, color: t.textSoft, marginBottom: 'env(safe-area-inset-bottom)' }} aria-label="Fermer la sélection">
          <Icon name="x" size={16} />
        </button>
      )}
      {showClubs && <ClubSheet t={t} clubs={clubs} favs={favs} onToggleFav={toggleFav} onSelect={chooseClub} onClose={() => setShowClubs(false)} />}
      {showLocation && <LocationSheet t={t} locating={locating} onLocate={handleLocate} onSelect={choosePlace} onClose={() => setShowLocation(false)} />}
      {showInfo && <InfoSheet t={t} onClose={() => setShowInfo(false)} />}
      {toast && (
        <div className="fixed inset-x-0 z-[1100] flex justify-center px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
          <div className="rounded-full px-4 py-2 text-sm font-semibold shadow-lg" style={{ background: t.chipActiveBg, color: t.chipActiveText }}>{toast}</div>
        </div>
      )}
    </div>
  );
}

// Liste des résultats, regroupés par date, sous un bandeau « matchs terminés » bien visible.
function ResultsSection({ t, results, club, visible, onMore, lastUpdated, fetchState, online }: {
  t: typeof THEMES.dark; results: (MatchEvent & { distanceKm: number })[]; club: string | null; visible: number; onMore: () => void;
  lastUpdated: string | null; fetchState: FetchState; online: boolean;
}) {
  const shown = results.slice(0, visible);
  const groups: [string, typeof shown][] = [];
  for (const e of shown) {
    const last = groups[groups.length - 1];
    if (last && last[0] === e.dayLabel) last[1].push(e); else groups.push([e.dayLabel, [e]]);
  }
  return (
    <section className="space-y-3 px-4 pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)' }}>
      <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold" style={{ background: t.textMute, color: '#FFFFFF' }}>
        <Icon name="check" size={14} /> Matchs terminés · {results.length} résultat{results.length > 1 ? 's' : ''}{club ? ` pour ${club}` : ''}
      </div>
      {!online && <p className="text-center text-[11px] font-semibold" style={{ color: t.flare }}>Hors connexion : derniers résultats enregistrés sur ton téléphone.</p>}
      {fetchState === 'ok' && results.length === 0 && (
        <p className="py-12 text-center text-sm" style={{ color: t.textMute }}>
          Pas encore de résultat pour ces filtres. Les scores s'ajoutent automatiquement à chaque mise à jour hebdomadaire (le lundi).
        </p>
      )}
      {groups.map(([day, list]) => (
        <div key={day} className="space-y-2">
          <h4 className="pt-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: t.textMute }}>{day}</h4>
          {list.map(e => <ResultCard key={e.id} t={t} event={e} side={club ? (e.homeClub === club ? 'Domicile' : 'Extérieur') : undefined} />)}
        </div>
      ))}
      {visible < results.length && (
        <button onClick={onMore} className="w-full rounded-full border py-3 text-sm font-semibold" style={{ borderColor: t.chipBorder, color: t.text, background: t.card }}>
          Voir plus de résultats ({results.length - visible} restants)
        </button>
      )}
      {lastUpdated && <p className="text-center text-[10px]" style={{ color: t.textMute }}>Données mises à jour le {new Date(lastUpdated).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
    </section>
  );
}
