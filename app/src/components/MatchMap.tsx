import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import type { MatchEvent, Place } from '../types';
import { sportColor, sportInitial, type Theme } from '../theme';
import { Icon } from './Icon';

// Fonds de carte CARTO (données OpenStreetMap), en version claire et sombre.
const TILES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
};
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const pinIcon = (e: MatchEvent, selected: boolean) => L.divIcon({
  className: '',
  html: `<span class="mlm-pin${selected ? ' is-selected' : ''}" style="width:24px;height:24px;background:${sportColor(e.sport)}">${sportInitial(e.sport)}</span>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const clusterIcon = (cluster: L.MarkerCluster) => {
  const n = cluster.getChildCount();
  const size = n < 10 ? 32 : n < 100 ? 38 : 46;
  return L.divIcon({ className: '', html: `<span class="mlm-cluster" style="width:${size}px;height:${size}px">${n}</span>`, iconSize: [size, size] });
};

interface Props {
  t: Theme;
  dark: boolean;
  events: MatchEvent[];
  center: Place;
  selectedId: string | null;
  onSelect: (id: string) => void;
  height?: number;
}

export function MatchMap({ t, dark, events, center, selectedId, onSelect, height = 340 }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const meRef = useRef<L.Marker | null>(null);
  const markersRef = useRef(new Map<string, { marker: L.Marker; event: MatchEvent }>());
  const selectedRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Création de la carte (une seule fois)
  useEffect(() => {
    const map = L.map(elRef.current!, { zoomControl: false, attributionControl: true, minZoom: 6, maxZoom: 19 }).setView([center.lat, center.lng], 10);
    const cluster = L.markerClusterGroup({ iconCreateFunction: clusterIcon, showCoverageOnHover: false, maxClusterRadius: 45, chunkedLoading: true, spiderfyOnMaxZoom: true });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fond clair / sombre
  useEffect(() => {
    const map = mapRef.current!;
    tilesRef.current?.remove();
    tilesRef.current = L.tileLayer(dark ? TILES.dark : TILES.light, { attribution: ATTRIBUTION, maxZoom: 19, subdomains: 'abcd' }).addTo(map);
    tilesRef.current.bringToBack();
  }, [dark]);

  // Marqueurs des matchs
  useEffect(() => {
    const cluster = clusterRef.current!;
    cluster.clearLayers();
    markersRef.current.clear();
    const markers = events.map(e => {
      const marker = L.marker([e.lat, e.lng], { icon: pinIcon(e, e.id === selectedRef.current), title: `${e.home} vs ${e.away}`, riseOnHover: true });
      marker.on('click', () => onSelectRef.current(e.id));
      markersRef.current.set(e.id, { marker, event: e });
      return marker;
    });
    cluster.addLayers(markers);
  }, [events]);

  // Mise en avant du match sélectionné
  useEffect(() => {
    const prev = selectedRef.current && markersRef.current.get(selectedRef.current);
    if (prev) prev.marker.setIcon(pinIcon(prev.event, false));
    selectedRef.current = selectedId;
    const cur = selectedId && markersRef.current.get(selectedId);
    if (cur) {
      cur.marker.setIcon(pinIcon(cur.event, true));
      cur.marker.setZIndexOffset(1000);
      clusterRef.current!.zoomToShowLayer(cur.marker, () => mapRef.current!.panTo(cur.marker.getLatLng()));
    }
  }, [selectedId]);

  // Point de référence (ma position / ville choisie)
  useEffect(() => {
    const map = mapRef.current!;
    meRef.current?.remove();
    meRef.current = L.marker([center.lat, center.lng], { icon: L.divIcon({ className: '', html: '<span class="mlm-me" style="display:block"></span>', iconSize: [16, 16] }), interactive: false, zIndexOffset: -100 }).addTo(map);
    map.setView([center.lat, center.lng], Math.max(map.getZoom(), 10));
  }, [center.lat, center.lng]);

  const zoom = (d: number) => mapRef.current?.setZoom(mapRef.current.getZoom() + d);
  const recenter = () => mapRef.current?.flyTo([center.lat, center.lng], 11, { duration: 0.6 });

  const btn = 'flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm';
  const btnStyle = { background: t.sheet, borderColor: t.chipBorder, color: t.text };
  return (
    <div className="relative w-full overflow-hidden rounded-xl border" style={{ height, borderColor: t.border,
      ['--map-bg' as string]: t.inputBg, ['--pin-border' as string]: t.sheet, ['--pin-selected' as string]: t.text,
      ['--cluster-bg' as string]: t.flare, ['--cluster-text' as string]: '#FFFFFF', ['--cluster-ring' as string]: t.flare + '55' }}>
      <div ref={elRef} className="absolute inset-0" />
      <div className="absolute bottom-6 right-3 z-[500] flex flex-col gap-1.5">
        <button onClick={() => zoom(1)} className={btn} style={btnStyle} aria-label="Zoomer"><Icon name="plus" /></button>
        <button onClick={() => zoom(-1)} className={btn} style={btnStyle} aria-label="Dézoomer"><Icon name="minus" /></button>
        <button onClick={recenter} className={btn} style={{ ...btnStyle, color: t.gold }} aria-label="Recentrer"><Icon name="locate" /></button>
      </div>
    </div>
  );
}
