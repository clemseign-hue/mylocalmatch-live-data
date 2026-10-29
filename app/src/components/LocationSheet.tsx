import { useEffect, useState } from 'react';
import type { Place } from '../types';
import { CITIES, type Theme } from '../theme';
import { Icon } from './Icon';
import { SearchInput, SearchPanel } from './SearchPanel';

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

  const row = 'flex w-full items-center gap-2 rounded-lg px-1 py-3 text-left text-sm';
  return (
    <SearchPanel t={t} title="Choisir une localisation" onClose={onClose}
      search={<SearchInput t={t} value={search} onChange={setSearch} placeholder="N'importe quelle ville ou adresse…" />}>
      {showingSearch ? (
        <div className="space-y-1">
          {searching && suggestions.length === 0 && <p className="py-3 text-xs" style={{ color: t.textMute }}>Recherche…</p>}
          {!searching && suggestions.length === 0 && <p className="py-3 text-xs" style={{ color: t.textMute }}>Aucun résultat.</p>}
          {suggestions.map(s => (
            <button key={s.id} onClick={() => onSelect(s)} className={row} style={{ color: t.text }}><Icon name="pin" size={14} color={t.textMute} /> {s.label}</button>
          ))}
        </div>
      ) : (
        <>
          <button onClick={onLocate} className="my-2 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold" style={{ background: t.flare, color: '#FFFFFF' }}>
            <Icon name="locate" size={15} className={locating ? 'animate-pulse' : ''} />
            {locating ? 'Localisation en cours…' : 'Utiliser ma position actuelle'}
          </button>
          <div className="space-y-1">
            {CITIES.map(c => (
              <button key={c.label} onClick={() => onSelect(c)} className={row} style={{ color: t.text }}><Icon name="pin" size={14} color={t.textMute} /> {c.label}</button>
            ))}
          </div>
          <p className="mt-3 pb-6 text-[10px]" style={{ color: t.textMute }}>Tape le nom de n'importe quelle ville ou adresse en France pour t'y positionner.</p>
        </>
      )}
    </SearchPanel>
  );
}
