'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { regionName } from '@baile-latino/types';
import { Button, Input } from '@/components/ui';

export interface MapPoint {
  lat: number;
  lng: number;
}

interface GeoResult {
  lat: string;
  lon: string;
  display_name: string;
}

/** Centro de Chile continental, para cuando no hay nada elegido. */
const CHILE_CENTER: MapPoint = { lat: -33.45, lng: -70.66 };

/**
 * Busca en Nominatim (OpenStreetMap), solo dentro de Chile. Uso liviano
 * (búsqueda a pedido o al cambiar de comuna), según su política de uso.
 */
async function geocode(q: string, limit = 5): Promise<GeoResult[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&countrycodes=cl&accept-language=es' +
    `&limit=${limit}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return (await res.json()) as GeoResult[];
}

/** Pin con el color de la marca (sin imágenes, que Leaflet no resuelve bien con bundlers). */
function pinIcon(L: typeof Leaflet) {
  return L.divIcon({
    className: '',
    html:
      '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);' +
      'background:var(--color-brand,#1a7a4e);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
}

/**
 * Mapa para marcar un punto: clic en el mapa (o arrastrar el pin) lo fija.
 * Se centra solo en la comuna/ciudad elegida si todavía no hay punto.
 */
export function MapPointPicker({
  value,
  onChange,
  region,
  city,
  commune,
}: {
  value: MapPoint | null;
  onChange: (p: MapPoint | null) => void;
  region: string;
  city: string;
  commune: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const marker = useRef<Leaflet.Marker | null>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Crea el mapa una vez (Leaflet usa `window`: se importa en el cliente).
  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !box.current || map.current) return;
      lib.current = L;
      const start = value ?? CHILE_CENTER;
      const m = L.map(box.current, { zoomControl: true }).setView(
        [start.lat, start.lng],
        value ? 16 : 5,
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      m.on('click', (e: Leaflet.LeafletMouseEvent) =>
        onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }),
      );
      map.current = m;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // Solo al montar: el punto inicial se aplica abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza el pin con el valor.
  useEffect(() => {
    const L = lib.current;
    const m = map.current;
    if (!ready || !L || !m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = L.marker([value.lat, value.lng], { draggable: true, icon: pinIcon(L) })
        .addTo(m)
        .on('dragend', () => {
          const p = marker.current!.getLatLng();
          onChangeRef.current({ lat: p.lat, lng: p.lng });
        });
    } else {
      marker.current.setLatLng([value.lat, value.lng]);
    }
  }, [ready, value]);

  // Sin punto: centra en la comuna (o ciudad, o región) elegida.
  useEffect(() => {
    if (!ready || value) return;
    const where = [commune || city, region && regionName(region)].filter(Boolean).join(', ');
    if (!where) return;
    let cancelled = false;
    void geocode(where, 1).then((r) => {
      if (cancelled || !r[0] || !map.current) return;
      map.current.setView([Number(r[0].lat), Number(r[0].lon)], commune || city ? 13 : 9);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, region, city, commune]);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const ctx = [commune || city, region && regionName(region)].filter(Boolean).join(', ');
      let r = await geocode(ctx ? `${q}, ${ctx}` : q);
      if (r.length === 0 && ctx) r = await geocode(q);
      setResults(r);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function pick(r: GeoResult) {
    const p = { lat: Number(r.lat), lng: Number(r.lon) };
    onChange(p);
    map.current?.setView([p.lat, p.lng], 17);
    setResults(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Buscar: Playa Reñaca, Parque Forestal…"
        />
        <Button type="button" variant="ghost" onClick={() => void search()} disabled={searching}>
          {searching ? '…' : 'Buscar'}
        </Button>
      </div>
      {results && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 text-sm">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-neutral-500">Sin resultados. Marca el punto a mano en el mapa.</div>
          ) : (
            results.map((r) => (
              <button
                key={`${r.lat},${r.lon}`}
                type="button"
                onClick={() => pick(r)}
                className="block w-full truncate px-3 py-2 text-left text-neutral-300 hover:bg-neutral-800"
                title={r.display_name}
              >
                {r.display_name}
              </button>
            ))
          )}
        </div>
      )}
      <div
        ref={box}
        className="relative z-0 h-64 w-full overflow-hidden rounded-lg border border-neutral-700"
      />
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          {value
            ? `📍 ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} · arrastra el pin para ajustar`
            : 'Toca el mapa para marcar el punto de encuentro.'}
        </span>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-neutral-400 hover:text-neutral-200">
            Quitar punto
          </button>
        )}
      </div>
    </div>
  );
}
