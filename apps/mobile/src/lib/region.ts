import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { CHILE_REGIONS, type ChileRegion } from '@baile-latino/types';
import { useAuth } from './auth';

/** Capitales regionales: si el nombre que da el GPS no calza, gana la más cercana. */
const CAPITALS: Record<ChileRegion, [number, number]> = {
  ARICA_PARINACOTA: [-18.48, -70.31],
  TARAPACA: [-20.21, -70.15],
  ANTOFAGASTA: [-23.65, -70.4],
  ATACAMA: [-27.37, -70.33],
  COQUIMBO: [-29.9, -71.25],
  VALPARAISO: [-33.04, -71.6],
  METROPOLITANA: [-33.45, -70.66],
  OHIGGINS: [-34.17, -70.74],
  MAULE: [-35.43, -71.66],
  NUBLE: [-36.61, -72.1],
  BIOBIO: [-36.83, -73.05],
  ARAUCANIA: [-38.74, -72.6],
  LOS_RIOS: [-39.82, -73.25],
  LOS_LAGOS: [-41.47, -72.94],
  AYSEN: [-45.57, -72.07],
  MAGALLANES: [-53.16, -70.92],
};

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/region (de |del )?/g, '')
    .replace(/[^a-z ]/g, ' ')
    .trim();

/** "Región Metropolitana de Santiago", "Valparaíso", "Biobío"… → código. */
function fromName(name: string | null | undefined): ChileRegion | null {
  if (!name) return null;
  const n = norm(name);
  if (n.includes('metropolitana') || n === 'santiago') return 'METROPOLITANA';
  if (n.includes('higgins') || n.includes('libertador')) return 'OHIGGINS';
  if (n.includes('aysen') || n.includes('aisen')) return 'AYSEN';
  if (n.includes('magallanes')) return 'MAGALLANES';
  if (n.includes('arica')) return 'ARICA_PARINACOTA';
  const hit = CHILE_REGIONS.find((r) => n.includes(norm(r.name)) || norm(r.name).includes(n));
  return hit?.code ?? null;
}

function nearest(lat: number, lng: number): ChileRegion {
  let best: ChileRegion = 'METROPOLITANA';
  let bestD = Infinity;
  for (const [code, [la, ln]] of Object.entries(CAPITALS) as [ChileRegion, [number, number]][]) {
    const d = (la - lat) ** 2 + ((ln - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = code;
    }
  }
  return best;
}

/** Región por GPS (pide permiso una vez). null si no hay permiso o está fuera de Chile. */
async function detectRegion(): Promise<ChileRegion | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return null;
  const pos =
    (await Location.getLastKnownPositionAsync({ maxAge: 60 * 60_000 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
  const { latitude, longitude } = pos.coords;
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (place?.isoCountryCode && place.isoCountryCode !== 'CL') return null;
    const byName = fromName(place?.region) ?? fromName(place?.subregion);
    if (byName) return byName;
  } catch {
    // sin red para geocodificar: se decide por la capital más cercana
  }
  // Chile continental aprox.: fuera de esto no se adivina.
  if (latitude > -17 || latitude < -56 || longitude > -66 || longitude < -76) return null;
  return nearest(latitude, longitude);
}

/** Mi región: la del GPS; si no hay permiso, la del perfil. Se calcula una vez por sesión. */
export function useMyRegion(): { region: ChileRegion | null; ready: boolean } {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['my-region'],
    queryFn: () => detectRegion().catch(() => null),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  return { region: q.data ?? user?.region ?? null, ready: !q.isPending };
}

/**
 * Filtro de región de una pantalla: arranca en "mi región" apenas se conoce; si la
 * persona elige otra (o "Todas"), se respeta.
 */
export function useRegionFilter(): {
  region: ChileRegion | null;
  setRegion: (r: ChileRegion | null) => void;
  mine: ChileRegion | null;
  /** Opciones para <Chips>, con mi región primero. */
  options: { value: ChileRegion; label: string }[];
} {
  const { region: mine, ready } = useMyRegion();
  const [picked, setPicked] = useState<{ v: ChileRegion | null } | null>(null);
  const [auto, setAuto] = useState<ChileRegion | null>(null);
  useEffect(() => {
    if (ready && mine) setAuto(mine);
  }, [ready, mine]);
  const options = [...CHILE_REGIONS]
    .sort((a, b) => Number(b.code === mine) - Number(a.code === mine))
    .map((r) => ({ value: r.code, label: r.code === mine ? `📍 ${r.name}` : r.name }));
  return {
    region: picked ? picked.v : auto,
    setRegion: (v) => setPicked({ v }),
    mine,
    options,
  };
}
