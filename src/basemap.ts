export function cartoTileUrl(theme: string | undefined, apiKey = ''): string {
  const style = theme === 'dark' ? 'dark_all' : 'light_all';
  // Keep tiles on one origin so HTTP/2 can reuse the preconnected socket.
  const url = `https://a.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
  const key = apiKey.trim();
  return key ? `${url}?key=${encodeURIComponent(key)}` : url;
}

export function resolveCartoApiKey(explicit?: string): string {
  const fromOption = explicit?.trim() ?? '';
  if (fromOption) return fromOption;
  const env =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & { env?: { VITE_CARTO_API_KEY?: unknown } }).env
      : undefined;
  const fromEnv = env?.VITE_CARTO_API_KEY;
  return typeof fromEnv === 'string' ? fromEnv.trim() : '';
}
