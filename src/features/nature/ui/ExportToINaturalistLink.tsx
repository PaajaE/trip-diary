import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { buildINaturalistObservationUrl } from '@/entities/nature/lib/inaturalist-export'
import { cn } from '@/shared/lib/cn'

interface ExportToINaturalistLinkProps {
  className?: string
  commonName: string
  latitude?: number | null
  longitude?: number | null
  scientificName?: string | null
}

export function ExportToINaturalistLink({
  className,
  commonName,
  latitude = null,
  longitude = null,
  scientificName = null,
}: ExportToINaturalistLinkProps) {
  const { t } = useTranslation()
  const href = buildINaturalistObservationUrl({
    commonName,
    latitude,
    longitude,
    scientificName,
  })

  return (
    <a
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline',
        className,
      )}
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {t('nature.exportInaturalist')}
      <ExternalLink aria-hidden="true" size={14} />
    </a>
  )
}
