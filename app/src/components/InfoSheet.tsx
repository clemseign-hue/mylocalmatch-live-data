import type { ReactNode } from 'react';
import type { Theme } from '../theme';
import { Sheet } from './Sheet';
import { Icon } from './Icon';

const REPO = 'https://github.com/clemseign-hue/mylocalmatch-live-data';

function Section({ t, title, children }: { t: Theme; title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="font-display mb-1.5 text-lg">{title}</h3>
      <div className="space-y-2 text-[13px] leading-relaxed" style={{ color: t.textSoft }}>{children}</div>
    </section>
  );
}

// À propos, sources des données, mentions légales et confidentialité.
export function InfoSheet({ t, onClose }: { t: Theme; onClose: () => void }) {
  const a = { color: t.flare, textDecoration: 'underline' };
  return (
    <Sheet t={t} onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl">Infos & mentions légales</h2>
        <button onClick={onClose} aria-label="Fermer"><Icon name="x" size={18} color={t.textSoft} /></button>
      </div>

      <Section t={t} title="À propos">
        <p>MyLocalMatch recense gratuitement les matchs de football amateur à voir près de chez toi, en Auvergne-Rhône-Alpes (Régional 1 à 3) et dans le district Drôme-Ardèche (Départemental 1 à 4).</p>
      </Section>

      <Section t={t} title="Sources des données">
        <p>Les calendriers proviennent des informations publiques de la Fédération Française de Football (LAuRAFoot, district Drôme-Ardèche) et sont mis à jour automatiquement chaque semaine. Ils restent la propriété de leurs auteurs.</p>
        <p>MyLocalMatch est un projet indépendant, sans lien avec la FFF, ses ligues ou ses districts. Un match peut être reporté ou modifié : vérifie toujours l'horaire officiel via « Détails » avant de te déplacer.</p>
        <p>Positions des stades : © contributeurs <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={a}>OpenStreetMap</a> et Base Adresse Nationale. Fonds de carte : OpenFreeMap et OpenStreetMap.</p>
      </Section>

      <Section t={t} title="Mentions légales">
        <p><strong>Éditeur :</strong> MyLocalMatch, projet personnel non commercial. Contact : <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer" style={a}>page de contact du projet</a>.</p>
        <p><strong>Hébergeur :</strong> GitHub, Inc. (GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.</p>
      </Section>

      <Section t={t} title="Confidentialité">
        <p><strong>Aucun compte, aucun cookie, aucune publicité, aucun outil de mesure d'audience.</strong> MyLocalMatch ne collecte ni ne conserve de données personnelles sur un serveur.</p>
        <p><strong>Ta position</strong> (bouton GPS) sert uniquement, sur ton téléphone, à calculer la distance des stades. Elle n'est envoyée nulle part.</p>
        <p><strong>Tes préférences</strong> (ville choisie, clubs favoris, thème, style de carte) sont enregistrées uniquement dans ton navigateur. Tu peux les effacer en supprimant les données du site dans les réglages de Safari.</p>
        <p><strong>Services utilisés</strong>, qui reçoivent ton adresse IP comme tout site web : GitHub (hébergement de l'appli et des données), OpenFreeMap et OpenStreetMap (fond de carte), API Adresse de l'État (uniquement le texte tapé dans la recherche de lieu). Le bouton « Itinéraire » ouvre Plans d'Apple.</p>
      </Section>
    </Sheet>
  );
}
