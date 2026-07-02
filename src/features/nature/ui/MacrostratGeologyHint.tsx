import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchMacrostratGeologyHint } from '@/entities/nature/lib/macrostrat'
import { isBrowserOnline } from '@/shared/lib/network'

interface MacrostratGeologyHintProps {
  latitude?: number | null
  longitude?: number | null
  stratName: string
}

export function MacrostratGeologyHint({
  latitude = null,
  longitude = null,
  stratName,
}: MacrostratGeologyHintProps) {
  const { t } = useTranslation()
  const online = isBrowserOnline()

  const hintQuery = useQuery({
    enabled: online,
    queryFn: () =>
      fetchMacrostratGeologyHint({
        latitude,
        longitude,
        stratName,
      }),
    queryKey: ['macrostrat-geology', stratName, latitude, longitude],
    staleTime: 86_400_000,
  })

  if (!online || hintQuery.isPending || hintQuery.data == null) {
    return null
  }

  const hint = hintQuery.data

  return (
    <div className="mt-4 rounded-xl bg-background/70 px-4 py-3 text-sm text-muted">
      <p className="font-medium text-foreground">{hint.formationLabel}</p>
      {hint.ageRange === null ? null : <p className="mt-1">{hint.ageRange}</p>}
      <p className="mt-2 text-xs">{t('nature.macrostratAttribution')}</p>
    </div>
  )
}
