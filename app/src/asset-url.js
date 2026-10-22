// Vite's relative base keeps bundled assets and public files working both at
// localhost and below a GitHub Pages repository path.
export function publicAssetUrl(path, {
  base = import.meta.env?.BASE_URL ?? '/',
  pageUrl = globalThis.location?.href ?? 'http://localhost/',
} = {}) {
  return new URL(`${base}${String(path).replace(/^\/+/, '')}`, pageUrl).href;
}
