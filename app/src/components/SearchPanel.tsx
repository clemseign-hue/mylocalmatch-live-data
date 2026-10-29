import { useEffect, useState, type ReactNode } from 'react';
import type { Theme } from '../theme';
import { Icon } from './Icon';

// Hauteur et position de la zone réellement visible (sur iPhone, le clavier la réduit).
function useVisibleViewport() {
  const read = () => {
    const vv = window.visualViewport;
    return { top: vv ? vv.offsetTop : 0, height: vv ? vv.height : window.innerHeight };
  };
  const [box, setBox] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setBox(read());
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => { vv?.removeEventListener('resize', update); vv?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return box;
}

interface Props { t: Theme; title: string; onClose: () => void; search: ReactNode; children: ReactNode }

// Panneau de recherche plein écran : la recherche reste en haut et les résultats juste dessous,
// dans la partie visible au-dessus du clavier.
export function SearchPanel({ t, title, onClose, search, children }: Props) {
  const { top, height } = useVisibleViewport();

  // Empêche la page derrière de défiler pendant la recherche
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-x-0 z-[1000] flex flex-col" style={{ top, height, background: t.sheet, color: t.text }}>
      <div className="shrink-0 border-b px-4 pb-3" style={{ borderColor: t.border, paddingTop: top > 0 ? 12 : 'calc(env(safe-area-inset-top) + 12px)' }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl">{title}</h2>
          <button onClick={onClose} className="flex items-center gap-1 text-sm font-semibold" style={{ color: t.flare }} aria-label="Fermer">
            Fermer <Icon name="x" size={16} />
          </button>
        </div>
        {search}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2">
        {children}
      </div>
    </div>
  );
}

// Champ de recherche commun (16 px minimum : évite le zoom automatique de Safari).
export function SearchInput({ t, value, onChange, placeholder }: { t: Theme; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full px-3 py-2" style={{ background: t.inputBg }}>
      <Icon name="search" size={14} color={t.textMute} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} enterKeyHint="search"
        className="w-full bg-transparent text-base outline-none" style={{ color: t.text }} autoComplete="off" autoCorrect="off" spellCheck={false} />
      {value && <button onClick={() => onChange('')} aria-label="Effacer"><Icon name="x" size={14} color={t.textMute} /></button>}
    </div>
  );
}
