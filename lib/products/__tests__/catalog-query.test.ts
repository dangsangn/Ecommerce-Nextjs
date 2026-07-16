import { describe, it, expect } from 'vitest'
import { buildCatalogQuery } from '@/lib/products/catalog-query'

describe('buildCatalogQuery', () => {
  it('omits keySearch when q is empty', () => {
    expect(buildCatalogQuery({ page: 1 })).toBe('?page=1&limit=12')
    expect(buildCatalogQuery({ q: '', page: 1 })).toBe('?page=1&limit=12')
  })
  it('includes url-encoded keySearch when q is present', () => {
    expect(buildCatalogQuery({ q: 'red shirt', page: 1 })).toBe('?page=1&limit=12&keySearch=red%20shirt')
  })
  it('clamps page to at least 1', () => {
    expect(buildCatalogQuery({ page: 0 })).toBe('?page=1&limit=12')
    expect(buildCatalogQuery({ page: -5 })).toBe('?page=1&limit=12')
  })
  it('defaults page to 1 when missing', () => {
    expect(buildCatalogQuery({})).toBe('?page=1&limit=12')
  })
})
