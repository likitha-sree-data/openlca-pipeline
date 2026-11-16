/** Only http(s) links are ever rendered as clickable. Anything else (javascript:, data:, file:) becomes null. */
export function safeHref(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
