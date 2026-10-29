import { useMemo, useState } from 'react';
import type { Club } from '../types';
import type { Theme } from '../theme';
import { SearchInput, SearchPanel } from './SearchPanel';
import { Icon } from './Icon';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

interface Props { t: Theme; clubs: Club[]; favs: string[]; onToggleFav: (club: string) => void; onSelect: (club: string) => void; onClose: () => void }

export function ClubSheet({ t, clubs, favs, onToggleFav, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const results = useMemo(() => {
    const q = normalize(search);
    const list = q ? clubs.filter(c => normalize(c.name).includes(q)) : clubs;
    return [...list.filter(c => favs.includes(c.name)), ...list.filter(c => !favs.includes(c.name))];
  }, [clubs, search, favs]);

  return (
    <SearchPanel t={t} title="Choisir un club" onClose={onClose}
      search={<SearchInput t={t} value={search} onChange={setSearch} placeholder="Nom du club ou de la ville…" />}>
      <div className="space-y-1 pb-6">
        {results.length === 0 && <p className="py-3 text-xs" style={{ color: t.textMute }}>Aucun club trouvé.</p>}
        {!search && favs.length === 0 && (
          <p className="pb-2 text-[11px]" style={{ color: t.textMute }}>Touche l'étoile d'un club pour l'ajouter à « Mes clubs ».</p>
        )}
        {results.slice(0, 100).map(c => {
          const fav = favs.includes(c.name);
          return (
            <div key={c.name} className="flex items-center gap-1">
              <button onClick={() => onToggleFav(c.name)} className="flex h-10 w-10 shrink-0 items-center justify-center" aria-label={fav ? `Retirer ${c.name} de mes clubs` : `Ajouter ${c.name} à mes clubs`}>
                <Icon name="star" size={18} color={fav ? t.gold : t.textMute} filled={fav} />
              </button>
              <button onClick={() => onSelect(c.name)} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg py-3 pr-1 text-left text-sm" style={{ color: t.text }}>
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 text-[11px]" style={{ color: t.textMute }}>{c.count} match{c.count > 1 ? 's' : ''}</span>
              </button>
            </div>
          );
        })}
      </div>
    </SearchPanel>
  );
}
