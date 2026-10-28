import type { ReactNode } from 'react';
import type { Theme } from '../theme';

// Panneau qui monte depuis le bas de l'écran, façon iOS.
export function Sheet({ t, onClose, children }: { t: Theme; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center" style={{ background: t.overlay }} onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t px-4 pt-4"
        style={{ background: t.sheet, borderColor: t.border, color: t.text, paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
        onClick={e => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: t.chipBorder }} />
        {children}
      </div>
    </div>
  );
}
