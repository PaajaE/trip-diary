import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchMacrostratGeologyHint } from '@/entities/nature/lib/macrostrat'
import { natureQueryKeys } from '@/entities/nature/api/nature-query-keys'
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
    enabled: online && latitude !== null && longitude !== null,
    queryFn: () =>
      fetchMacrostratGeologyHint({
        latitude,
        longitude,
        stratName,
      }),
    queryKey: natureQueryKeys.macrostratGeology(stratName, latitude, longitude),
    staleTime: 86_400_000,
  })

  if (!online || hintQuery.isPending || hintQuery.data == null) {
    return null
  }

  const hint = hintQuery.data

  return (
    <div className="mt-4 rounded-xl border border-border/80 bg-background/70 px-4 py-3 text-sm">
      <p className="font-medium text-foreground">{hint.formationLabel}</p>
      {hint.ageRange === null ? null : (
        <p className="mt-1 text-muted">{hint.ageRange}</p>
      )}
      <p className="mt-2 text-xs text-muted">
        {t('nature.macrostratAttribution')}
      </p>
    </div>
  )
}
