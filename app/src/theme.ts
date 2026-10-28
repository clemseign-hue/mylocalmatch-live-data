export const THEMES = {
  dark: { bg: '#0E1712', card: '#16281C', border: '#26382C', text: '#EDE8DC', textSoft: '#8FA394', textMute: '#4E6455', chipBorder: '#3A5240', chipActiveBg: '#EDE8DC', chipActiveText: '#0E1712', flare: '#FF5A36', gold: '#F4B740', dashed: '#3A5240', overlay: 'rgba(6,10,7,0.72)', sheet: '#16281C', inputBg: '#1B2E20' },
  light: { bg: '#F6F4EE', card: '#FFFFFF', border: '#E4DFD1', text: '#1A281C', textSoft: '#5B6B5C', textMute: '#9AA394', chipBorder: '#DAD4C4', chipActiveBg: '#1A281C', chipActiveText: '#F6F4EE', flare: '#D9481F', gold: '#B4790F', dashed: '#DAD4C4', overlay: 'rgba(30,30,20,0.45)', sheet: '#FFFFFF', inputBg: '#F0EDE2' },
};
export type Theme = typeof THEMES.dark;

export const SPORTS = [
  { id: 'tous', label: 'Tous' },
  { id: 'football', label: 'Football', color: '#3FA34D' },
  { id: 'rugby', label: 'Rugby', color: '#C97B2E' },
  { id: 'handball', label: 'Handball', color: '#3A7CA5' },
  { id: 'basket', label: 'Basket', color: '#E0A93A' },
];
export const sportColor = (s: string) => SPORTS.find(x => x.id === s)?.color || '#EDE8DC';
export const sportInitial = (s: string) => ({ football: 'F', rugby: 'R', handball: 'H', basket: 'B' } as Record<string, string>)[s] || '?';
export const PRICING: Record<string, number[]> = { football: [8, 5, 3], rugby: [15, 10, 6], handball: [6, 4, 2], basket: [12, 8, 5] };

export const LEVELS = [
  { id: 'tous', label: 'Tous niveaux' },
  { id: 'r1', label: 'R1' },
  { id: 'r2', label: 'R2' },
  { id: 'r3', label: 'R3' },
] as const;

export const DATE_FILTERS = [
  { id: 'tous', label: 'Tous' }, { id: 'aujourdhui', label: "Aujourd'hui" }, { id: 'demain', label: 'Demain' },
  { id: 'weekend', label: 'Ce week-end' }, { id: 'semaine', label: 'Cette semaine' },
] as const;

// Raccourcis rapides ; la recherche libre permet d'aller sur n'importe quelle commune.
export const CITIES = [
  { label: 'Lyon', lat: 45.7640, lng: 4.8357 },
  { label: 'Villeurbanne', lat: 45.7667, lng: 4.8794 },
  { label: 'Villefranche-sur-Saône', lat: 45.9886, lng: 4.7167 },
  { label: 'Grenoble', lat: 45.1885, lng: 5.7245 },
  { label: 'Saint-Étienne', lat: 45.4397, lng: 4.3872 },
  { label: 'Annecy', lat: 45.8992, lng: 6.1294 },
  { label: 'Valence', lat: 44.9334, lng: 4.8924 },
  { label: 'Chambéry', lat: 45.5646, lng: 5.9178 },
  { label: 'Clermont-Ferrand', lat: 45.7772, lng: 3.0870 },
];
