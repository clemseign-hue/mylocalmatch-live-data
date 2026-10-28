// Styles de carte proposés, tous gratuits et sans clé.
// « vector » = carte vectorielle (OpenFreeMap, rendu net façon Plans) ; « raster » = images.
// La carte garde le même rendu clair en mode sombre et en mode clair.
export interface MapStyle {
  id: string;
  label: string;
  kind: 'vector' | 'raster';
  url: string;
  attribution: string;
}

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const OFM = `<a href="https://openfreemap.org">OpenFreeMap</a> ${OSM}`;

export const MAP_STYLES: MapStyle[] = [
  { id: 'plans', label: 'Plans', kind: 'vector', url: 'https://tiles.openfreemap.org/styles/liberty', attribution: OFM },
  { id: 'epure', label: 'Épuré', kind: 'vector', url: 'https://tiles.openfreemap.org/styles/positron', attribution: OFM },
  { id: 'vif', label: 'Vif', kind: 'vector', url: 'https://tiles.openfreemap.org/styles/bright', attribution: OFM },
  { id: 'osmfr', label: 'OSM France', kind: 'raster', url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', attribution: `${OSM} France` },
  { id: 'classique', label: 'Classique', kind: 'raster', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: OSM },
];
export const DEFAULT_MAP_STYLE = 'plans';
export const mapStyleById = (id: string) => MAP_STYLES.find(s => s.id === id) || MAP_STYLES[0];
