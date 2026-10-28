// Styles de carte proposés, tous gratuits et sans clé.
// « vector » = carte vectorielle (OpenFreeMap, rendu net façon Plans) ; « raster » = images.
export interface MapStyle {
  id: string;
  label: string;
  kind: 'vector' | 'raster';
  light: string;
  dark: string;
  darkFilter?: boolean; // raster sans version sombre : on l'assombrit par filtre CSS
  attribution: string;
}

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const OFM = `<a href="https://openfreemap.org">OpenFreeMap</a> ${OSM}`;

export const MAP_STYLES: MapStyle[] = [
  { id: 'plans', label: 'Plans', kind: 'vector', light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/dark', attribution: OFM },
  { id: 'epure', label: 'Épuré', kind: 'vector', light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/fiord', attribution: OFM },
  { id: 'vif', label: 'Vif', kind: 'vector', light: 'https://tiles.openfreemap.org/styles/bright', dark: 'https://tiles.openfreemap.org/styles/dark', attribution: OFM },
  { id: 'osmfr', label: 'OSM France', kind: 'raster', light: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', dark: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', darkFilter: true, attribution: `${OSM} France` },
  { id: 'classique', label: 'Classique', kind: 'raster', light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', dark: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', darkFilter: true, attribution: OSM },
];
export const DEFAULT_MAP_STYLE = 'plans';
export const mapStyleById = (id: string) => MAP_STYLES.find(s => s.id === id) || MAP_STYLES[0];
