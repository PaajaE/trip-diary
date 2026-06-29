import { publicEnv } from '@/shared/config/env'

export function getSiteOrigin(): string {
  const configured = publicEnv.VITE_SITE_URL
  if (configured !== undefined && configured !== '') {
    return configured.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}

export function buildAppAbsoluteUrl(path: string): string {
  const origin = getSiteOrigin()
  if (origin === '') {
    return path
  }
  return new URL(path, origin).href
}

export function buildSharePreviewUrl(path: string): string {
  const supabaseUrl = publicEnv.VITE_SUPABASE_URL
  if (supabaseUrl === undefined || supabaseUrl === '') {
    return buildAppAbsoluteUrl(path)
  }

  const params = new URLSearchParams({ path })
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/og-share?${params.toString()}`
}
