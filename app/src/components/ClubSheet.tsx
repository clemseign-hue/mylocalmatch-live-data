import { useMemo, useState } from 'react';
import type { Club } from '../types';
import type { Theme } from '../theme';
import { SearchInput, SearchPanel } from './SearchPanel';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

interface Props { t: Theme; clubs: Club[]; onSelect: (club: string) => void; onClose: () => void }

export function ClubSheet({ t, clubs, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const results = useMemo(() => {
    const q = normalize(search);
    return q ? clubs.filter(c => normalize(c.name).includes(q)) : clubs;
  }, [clubs, search]);

  return (
    <SearchPanel t={t} title="Choisir un club" onClose={onClose}
      search={<SearchInput t={t} value={search} onChange={setSearch} placeholder="Nom du club ou de la ville…" />}>
      <div className="space-y-1 pb-6">
        {results.length === 0 && <p className="py-3 text-xs" style={{ color: t.textMute }}>Aucun club trouvé.</p>}
        {results.slice(0, 100).map(c => (
          <button key={c.name} onClick={() => onSelect(c.name)} className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-3 text-left text-sm" style={{ color: t.text }}>
            <span className="truncate">{c.name}</span>
            <span className="shrink-0 text-[11px]" style={{ color: t.textMute }}>{c.count} match{c.count > 1 ? 's' : ''}</span>
          </button>
        ))}
      </div>
    </SearchPanel>
  );
}
