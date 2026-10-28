import { useEffect, useState } from 'react';
import type { Place } from '../types';
import { CITIES, type Theme } from '../theme';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

interface Props { t: Theme; locating: boolean; onLocate: () => void; onSelect: (p: Place) => void; onClose: () => void }

// Recherche libre via l'API Adresse du gouvernement (gratuite, sans clé).
export function LocationSheet({ t, locating, onLocate, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<(Place & { id: string })[]>([]);
  const [searching, setSearching] = useState(false);
  const showingSearch = search.trim().length >= 2;

  useEffect(() => {
    if (!showingSearch) { setSuggestions([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(search)}&limit=6`)
        .then(r => r.json())
        .then(json => {
          if (cancelled) return;
          setSuggestions((json.features || []).map((f: { properties: { id: string; label: string }; geometry: { coordinates: [number, number] } }) => ({
            id: f.properties.id, label: f.properties.label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
          })));
        })
        .catch(() => { if (!cancelled) setSuggestions([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [search, showingSearch]);

  const row = 'flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm';
  return (
    <Sheet t={t} onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl">Choisir une localisation</h2>
        <button onClick={onClose} aria-label="Fermer"><Icon name="x" size={18} color={t.textSoft} /></button>
      </div>
      <button onClick={onLocate} className="mb-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold" style={{ background: t.flare, color: '#FFFFFF' }}>
        <Icon name="locate" size={15} className={locating ? 'animate-pulse' : ''} />
        {locating ? 'Localisation en cours…' : 'Utiliser ma position actuelle'}
      </button>
      <div className="mb-3 flex items-center gap-2 rounded-full px-3 py-2" style={{ background: t.inputBg }}>
        <Icon name="search" size={14} color={t.textMute} />
        {/* 16px minimum : évite le zoom automatique de Safari sur iPhone */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="N'importe quelle ville ou adresse…"
          className="w-full bg-transparent text-base outline-none" style={{ color: t.text }} autoComplete="off" />
      </div>
      {showingSearch ? (
        <div className="mb-2 space-y-1">
          {searching && suggestions.length === 0 && <p className="px-3 py-3 text-xs" style={{ color: t.textMute }}>Recherche…</p>}
          {!searching && suggestions.length === 0 && <p className="px-3 py-3 text-xs" style={{ color: t.textMute }}>Aucun résultat.</p>}
          {suggestions.map(s => (
            <button key={s.id} onClick={() => onSelect(s)} className={row}><Icon name="pin" size={14} color={t.textMute} /> {s.label}</button>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {CITIES.map(c => (
            <button key={c.label} onClick={() => onSelect(c)} className={row}><Icon name="pin" size={14} color={t.textMute} /> {c.label}</button>
          ))}
        </div>
      )}
      <p className="mt-3 text-[10px]" style={{ color: t.textMute }}>Tape le nom de n'importe quelle ville ou adresse en France pour t'y positionner.</p>
    </Sheet>
  );
}
