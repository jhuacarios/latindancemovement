/**
 * Normaliza un texto de búsqueda: minúsculas y sin acentos/diacríticos. Debe
 * coincidir con lo que guarda el trigger `track_search_text` en `searchText`
 * (lower + translate de acentos), para que "mientele" encuentre "Miéntele".
 */
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
