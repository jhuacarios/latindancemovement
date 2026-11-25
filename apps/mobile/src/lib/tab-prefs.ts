import * as SecureStore from 'expo-secure-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Href } from 'expo-router';

/**
 * Pestañas de la app: el usuario elige cuáles 4 van en la barra (y en qué orden);
 * el resto queda en "Más". Se guarda en el teléfono.
 */
export const TAB_NAMES = ['socials', 'events', 'academies', 'messages', 'profile'] as const;
export type TabName = (typeof TAB_NAMES)[number];

/** Pestañas elegibles en la barra (la quinta siempre es "Más"; Android e iOS muestran 5 como máximo). */
export const MAIN_TABS = 4;
export const DEFAULT_TABS: TabName[] = ['socials', 'events', 'academies', 'messages'];

export const TAB_INFO: Record<TabName, { label: string; emoji: string; path: Href }> = {
  socials: { label: 'Sociales', emoji: '💃', path: '/socials' },
  events: { label: 'Eventos', emoji: '📅', path: '/events' },
  academies: { label: 'Academias', emoji: '🎓', path: '/academies' },
  messages: { label: 'Mensajes', emoji: '💬', path: '/messages' },
  profile: { label: 'Perfil', emoji: '👤', path: '/profile' },
};

const KEY = 'tab-prefs-v1';
const QUERY_KEY = ['tab-prefs'];

const isTab = (v: unknown): v is TabName => typeof v === 'string' && (TAB_NAMES as readonly string[]).includes(v);

async function load(): Promise<TabName[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (
      Array.isArray(parsed) &&
      parsed.length === MAIN_TABS &&
      parsed.every(isTab) &&
      new Set(parsed).size === MAIN_TABS
    ) {
      return parsed;
    }
  } catch {
    // dato dañado: se usan las de siempre
  }
  return DEFAULT_TABS;
}

/** Las pestañas principales elegidas (undefined mientras se leen del teléfono). */
export function useMainTabs(): TabName[] | undefined {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: load,
    staleTime: Infinity,
    gcTime: Infinity,
  }).data;
}

export function useSaveMainTabs() {
  const qc = useQueryClient();
  return async (tabs: TabName[]) => {
    await SecureStore.setItemAsync(KEY, JSON.stringify(tabs));
    qc.setQueryData(QUERY_KEY, tabs);
  };
}
