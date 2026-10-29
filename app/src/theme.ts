export const THEMES = {
  dark: { bg: '#111113', card: '#1C1C1E', border: '#2C2C2E', text: '#F2F2F7', textSoft: '#AEAEB2', textMute: '#6E6E73', chipBorder: '#3A3A3C', chipActiveBg: '#F2F2F7', chipActiveText: '#111113', flare: '#FF5A36', gold: '#F4B740', dashed: '#3A3A3C', overlay: 'rgba(0,0,0,0.6)', sheet: '#1C1C1E', inputBg: '#2C2C2E' },
  light: { bg: '#F5F5F7', card: '#FFFFFF', border: '#E5E5EA', text: '#1C1C1E', textSoft: '#636366', textMute: '#8E8E93', chipBorder: '#D1D1D6', chipActiveBg: '#1C1C1E', chipActiveText: '#F5F5F7', flare: '#D9481F', gold: '#B4790F', dashed: '#D1D1D6', overlay: 'rgba(0,0,0,0.4)', sheet: '#FFFFFF', inputBg: '#EDEDF0' },
};
export type Theme = typeof THEMES.dark;

// Couleur de pastille par sport (seul le football est couvert pour l'instant).
export const SPORTS = [
  { id: 'football', label: 'Football', color: '#F4B740' },
];
export const sportColor = (s: string) => SPORTS.find(x => x.id === s)?.color || '#F2F2F7';
export const sportInitial = (s: string) => ({ football: 'F', rugby: 'R', handball: 'H', basket: 'B' } as Record<string, string>)[s] || '?';

export const LEVELS = [
  { id: 'tous', label: 'Tous niveaux' },
  { id: 'r1', label: 'R1' },
  { id: 'r2', label: 'R2' },
  { id: 'r3', label: 'R3' },
  { id: 'd1', label: 'D1' },
  { id: 'd2', label: 'D2' },
  { id: 'd3', label: 'D3' },
  { id: 'd4', label: 'D4' },
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
