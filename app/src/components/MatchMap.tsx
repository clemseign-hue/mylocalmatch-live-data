import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import type { MatchEvent, Place } from '../types';
import { sportColor, sportInitial, type Theme } from '../theme';
import { Icon } from './Icon';
import { MAP_STYLES, mapStyleById } from '../mapStyles';

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
  fitKey?: string | null; // quand il change, la carte se cadre sur tous les matchs affichés
  styleId: string;
  onStyleChange: (id: string) => void;
  height?: number;
}

export function MatchMap({ t, dark, events, center, selectedId, onSelect, fitKey, styleId, onStyleChange, height = 340 }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.Layer | null>(null);
  const [showStyles, setShowStyles] = useState(false);
  const style = mapStyleById(styleId);
  const filtered = dark && !!style.darkFilter;
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

  // Fond de carte (le moteur vectoriel n'est chargé que si un style vectoriel est choisi)
  useEffect(() => {
    const map = mapRef.current!;
    let cancelled = false;
    const url = dark ? style.dark : style.light;
    const setBase = (layer: L.Layer) => {
      if (cancelled) return;
      baseRef.current?.remove();
      baseRef.current = layer.addTo(map);
    };
    if (style.kind === 'raster') {
      setBase(L.tileLayer(url, { attribution: style.attribution, maxZoom: 19, subdomains: 'abc' }));
    } else {
      // Le « worker » de MapLibre (fichier qui prépare les tuiles) doit être livré à part et déclaré,
      // sinon la carte n'affiche que sa couleur de fond.
      Promise.all([
        import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
        import('@maplibre/maplibre-gl-leaflet'), import('maplibre-gl/dist/maplibre-gl.css'),
      ])
        .then(([maplibre, worker, plugin]) => {
          maplibre.setWorkerUrl(worker.default);
          setBase(plugin.maplibreGL({ style: url }));
        })
        .catch(() => setBase(L.tileLayer(mapStyleById('classique').light, { attribution: style.attribution, maxZoom: 19 })));
    }
    return () => { cancelled = true; };
  }, [style, dark]);

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

  // Cadrage sur les matchs d'un club choisi
  useEffect(() => {
    if (!fitKey || !events.length) return;
    const bounds = L.latLngBounds(events.map(e => [e.lat, e.lng] as [number, number]));
    mapRef.current!.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, events.length]);

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
    <div className={`relative w-full overflow-hidden rounded-xl border${filtered ? ' mlm-dark-map' : ''}`} style={{ height, borderColor: t.border,
      ['--map-bg' as string]: t.inputBg, ['--pin-border' as string]: t.sheet, ['--pin-selected' as string]: t.text,
      ['--cluster-bg' as string]: t.flare, ['--cluster-text' as string]: '#FFFFFF', ['--cluster-ring' as string]: t.flare + '55' }}>
      <div ref={elRef} className="absolute inset-0" />
      <div className="absolute right-3 top-3 z-[510] flex flex-col items-end gap-1.5">
        <button onClick={() => setShowStyles(v => !v)} className={btn} style={btnStyle} aria-label="Style de carte"><Icon name="layers" /></button>
        {showStyles && (
          <div className="overflow-hidden rounded-lg border shadow-md" style={{ background: t.sheet, borderColor: t.chipBorder }}>
            {MAP_STYLES.map(s => (
              <button key={s.id} onClick={() => { onStyleChange(s.id); setShowStyles(false); }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-semibold"
                style={{ color: s.id === style.id ? t.flare : t.text }}>
                {s.label} {s.id === style.id && <Icon name="check" size={12} />}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="absolute bottom-6 right-3 z-[500] flex flex-col gap-1.5">
        <button onClick={() => zoom(1)} className={btn} style={btnStyle} aria-label="Zoomer"><Icon name="plus" /></button>
        <button onClick={() => zoom(-1)} className={btn} style={btnStyle} aria-label="Dézoomer"><Icon name="minus" /></button>
        <button onClick={recenter} className={btn} style={{ ...btnStyle, color: t.gold }} aria-label="Recentrer"><Icon name="locate" /></button>
      </div>
    </div>
  );
}
