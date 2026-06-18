/** Mini util para concatenar clases (evita una dependencia extra). */
export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
