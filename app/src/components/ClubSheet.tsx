import { useMemo, useState } from 'react';
import type { Club } from '../types';
import type { Theme } from '../theme';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

interface Props { t: Theme; clubs: Club[]; onSelect: (club: string) => void; onClose: () => void }

export function ClubSheet({ t, clubs, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const results = useMemo(() => {
    const q = normalize(search);
    return q ? clubs.filter(c => normalize(c.name).includes(q)) : clubs;
  }, [clubs, search]);

  return (
    <Sheet t={t} onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl">Choisir un club</h2>
        <button onClick={onClose} aria-label="Fermer"><Icon name="x" size={18} color={t.textSoft} /></button>
      </div>
      <div className="mb-3 flex items-center gap-2 rounded-full px-3 py-2" style={{ background: t.inputBg }}>
        <Icon name="search" size={14} color={t.textMute} />
        {/* 16px minimum : évite le zoom automatique de Safari sur iPhone */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom du club ou de la ville…"
          className="w-full bg-transparent text-base outline-none" style={{ color: t.text }} autoComplete="off" />
      </div>
      <div className="space-y-1">
        {results.length === 0 && <p className="px-3 py-3 text-xs" style={{ color: t.textMute }}>Aucun club trouvé.</p>}
        {results.slice(0, 100).map(c => (
          <button key={c.name} onClick={() => onSelect(c.name)} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm" style={{ color: t.text }}>
            <span className="truncate">{c.name}</span>
            <span className="shrink-0 text-[11px]" style={{ color: t.textMute }}>{c.count} match{c.count > 1 ? 's' : ''}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
