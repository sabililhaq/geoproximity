export function cartoTileUrl(theme: string | undefined, apiKey = ""): string {
  const style = theme === "dark" ? "dark_all" : "light_all";
  const url = `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
  const key = apiKey.trim();
  return key ? `${url}?key=${encodeURIComponent(key)}` : url;
}

export function resolveCartoApiKey(explicit?: string): string {
  const fromOption = explicit?.trim() ?? "";
  if (fromOption) return fromOption;
  const fromEnv = import.meta.env.VITE_CARTO_API_KEY;
  return typeof fromEnv === "string" ? fromEnv.trim() : "";
}
