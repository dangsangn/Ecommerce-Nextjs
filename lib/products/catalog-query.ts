export const CATALOG_PAGE_SIZE = 12

// Map the storefront URL's `q` to the backend's `keySearch` param and clamp paging.
export function buildCatalogQuery({ q, page }: { q?: string; page?: number }): string {
  const p = Number.isFinite(page) && (page as number) >= 1 ? Math.floor(page as number) : 1
  let s = `?page=${p}&limit=${CATALOG_PAGE_SIZE}`
  const trimmed = (q ?? '').trim()
  if (trimmed) s += `&keySearch=${encodeURIComponent(trimmed)}`
  return s
}
