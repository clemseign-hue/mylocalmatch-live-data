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
import { ScanFlow } from './components/ScanFlow';
import { ValidationScreen } from './components/ValidationScreen';
import type { CardOffer } from './components/EventCard';
import { couponKey, fetchPartners, goingAllowed, setTestMode, testMode, inWindow, loadCoupons, loadGoing, partnersNear, saveCoupons, saveGoing, type Coupon, type Partner } from './partners';
import { recordGoing } from './backend';
import { ClubSheet } from './components/ClubSheet';

const DEFAULT_PLACE: Place = { label: 'Valence', lat: 44.9334, lng: 4.8924 }; // zone de lancement : Drôme-Ardèche
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
  const [level, setLevel] = useState('tous');
  const [date, setDate] = useState('weekend'); // à l'ouverture : les matchs de ce week-end
  const [selected, setSelected] = useState<string | null>(null);
  const [place, setPlace] = useState<Place>(() => {
    const saved = loadPref<Place | null>('place', null);
    // L'ancien lieu par défaut (Lyon, jamais choisi explicitement) bascule sur Valence
    return !saved || (saved.label === 'Lyon' && saved.lat === 45.7640) ? DEFAULT_PLACE : saved;
  });
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
  // Offres partenaires (scan QR au comptoir)
  const [partners, setPartners] = useState<Partner[]>([]);
  const [going, setGoing] = useState<Record<string, string>>(loadGoing);
  const [coupons, setCoupons] = useState<Record<string, Coupon>>(loadCoupons);
  const [scanning, setScanning] = useState(false);
  const [validation, setValidation] = useState<{ partner: Partner; coupon: Coupon } | null>(null);
  const [, setTick] = useState(0); // réévalue la fenêtre des offres chaque minute
  useEffect(() => { const i = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(i); }, []);
  // Lien direct vers un match (?match=…), ouvert une seule fois au chargement
  const pendingMatch = useRef<string | null>(new URLSearchParams(location.search).get('match'));
  const [manualMode, setManualMode] = useState<'dark' | 'light' | null>(() => loadPref('theme', null));
  const [events, setEvents] = useState<MatchEvent[]>([]);
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

  const toastTimer = useRef<number>(0);
  const showToast = (msg: string) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 4500); };

  // Mode test (réservé au propriétaire) : 5 touchers rapides sur le titre l'activent ou le désactivent
  const [testOn, setTestOn] = useState(testMode);
  const titleTaps = useRef<number[]>([]);
  const onTitleTap = () => {
    const now = Date.now();
    titleTaps.current = [...titleTaps.current.filter(ts => now - ts < 3000), now];
    if (titleTaps.current.length >= 5) {
      titleTaps.current = [];
      const next = !testOn;
      setTestMode(next); setTestOn(next);
      showToast(next ? 'Mode test activé' : 'Mode test désactivé');
      fetchPartners().then(setPartners);
    }
  };

  // « J'y vais » : semaine en cours, un seul match par jour ; verrouillé dès qu'une offre a été utilisée (sauf en mode test)
  const hasCoupon = (matchId: string) => !testOn && Object.values(coupons).some(c => c.matchId === matchId);
  const toggleGoing = (id: string) => {
    const match = events.find(e => e.id === id);
    if (!match) return;
    if (going[id]) {
      if (hasCoupon(id)) { showToast('Offre déjà utilisée : « J\'y vais » ne peut plus être annulé.'); return; }
      const next = { ...going }; delete next[id];
      setGoing(next); saveGoing(next); recordGoing(id, false);
      return;
    }
    const today = todayISO();
    if (!goingAllowed(match, today)) { showToast('« J\'y vais » s\'ouvre la semaine du match.'); return; }
    const sameDay = events.find(e => going[e.id] && e.date === match.date && e.id !== id);
    if (sameDay && hasCoupon(sameDay.id)) { showToast(`Tu as déjà utilisé une offre pour ${sameDay.home} - ${sameDay.away} ce jour-là.`); return; }
    const next = { ...going };
    if (sameDay) { delete next[sameDay.id]; recordGoing(sameDay.id, false); showToast(`« J'y vais » déplacé : un seul match par jour.`); }
    next[id] = new Date().toISOString();
    setGoing(next); saveGoing(next); recordGoing(id, true);
  };

  // Offres « Après le match » d'un match : partenaires dans le rayon, pendant la fenêtre de validité (F03)
  const offersFor = (e: MatchEvent): CardOffer[] => (going[e.id]
    ? partnersNear(e, partners).filter(({ partner }) => inWindow(e, partner))
      .map(({ partner, km }) => ({ partner, km, coupon: coupons[couponKey(e.id, partner.id)] }))
    : []);
  const goingMatches = useMemo(() => events.filter(e => going[e.id]), [events, going]);

  const onValidated = (c: Coupon) => {
    setCoupons(prev => { const next = { ...prev, [couponKey(c.matchId, c.partnerId)]: c }; saveCoupons(next); return next; });
    setScanning(false);
    const partner = partners.find(p => p.id === c.partnerId);
    if (partner) setValidation({ partner, coupon: c });
  };

  const refresh = useCallback(async () => {
    setFetchState(s => (s === 'ok' ? 'ok' : 'loading'));
    try {
      const [{ events, generatedAt }, partnerList] = await Promise.all([fetchEvents(), fetchPartners()]);
      setEvents(events);
      setPartners(partnerList);
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
      .sort((a, b) => club || favOnly // un club ou mes clubs : ordre chronologique
        ? (a.date || '').localeCompare(b.date || '') || a.time.localeCompare(b.time)
        : a.distanceKm - b.distanceKm || (a.date || '').localeCompare(b.date || '') || a.time.localeCompare(b.time));
  }, [events, level, date, place, club, favOnly, favs]);


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

  useEffect(() => setVisible(PAGE_SIZE), [level, date, place, club, favOnly]);

  // Ouverture via un lien partagé : on lève les filtres pour être sûr d'afficher le match, puis on le sélectionne.
  useEffect(() => {
    const id = pendingMatch.current;
    if (!id || !events.length) return;
    pendingMatch.current = null;
    history.replaceState(null, '', location.pathname);
    if (!events.some(e => e.id === id)) { showToast('Ce match n\'est plus disponible.'); return; }
    setDate('tous'); setLevel('tous'); setClub(null); setFavOnly(false);
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
            <h1 onClick={onTitleTap} className="font-display select-none text-3xl leading-none">MyLocal<span style={{ color: t.flare }}>Match</span>
              {testOn && <span className="ml-2 rounded px-1.5 py-0.5 align-middle font-body text-[10px] font-bold" style={{ background: t.gold, color: '#111113' }}>TEST</span>}
            </h1>
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
          {DATE_FILTERS.map(d => (
            <button key={d.id} onClick={() => setDate(d.id)} className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition" style={smallChip(date === d.id)}>{d.label}</button>
          ))}
        </div>
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
            onSelect={() => (selected === e.id ? setSelected(null) : selectEvent(e.id))} onCopied={() => showToast('Lien du match copié')}
            going={!!going[e.id]} onToggleGoing={() => toggleGoing(e.id)} goingLocked={!!going[e.id] && hasCoupon(e.id)}
            goingOpen={goingAllowed(e, todayISO())} offers={selected === e.id ? offersFor(e) : []}
            onScan={() => setScanning(true)} onShowValidation={o => o.coupon && setValidation({ partner: o.partner, coupon: o.coupon })} />
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

      {showClubs && <ClubSheet t={t} clubs={clubs} favs={favs} onToggleFav={toggleFav} onSelect={chooseClub} onClose={() => setShowClubs(false)} />}
      {showLocation && <LocationSheet t={t} locating={locating} onLocate={handleLocate} onSelect={choosePlace} onClose={() => setShowLocation(false)} />}
      {showInfo && <InfoSheet t={t} onClose={() => setShowInfo(false)} />}
      {scanning && <ScanFlow t={t} partners={partners} goingMatches={goingMatches} coupons={coupons} onValidated={onValidated} onClose={() => setScanning(false)} />}
      {validation && <ValidationScreen partner={validation.partner} coupon={validation.coupon} onClose={() => setValidation(null)} />}
      {toast && (
        <div className="fixed inset-x-0 z-[1300] flex justify-center px-4" style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }} onClick={() => setToast(null)}>
          <div role="status" className="flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-semibold shadow-2xl"
            style={{ background: t.flare, color: '#FFFFFF', animation: 'mlm-drop .25s ease-out' }}>
            <Icon name="info" size={22} className="shrink-0" /> <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

