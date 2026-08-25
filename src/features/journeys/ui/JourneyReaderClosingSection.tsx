import { Link } from '@tanstack/react-router'
import { Lock, MapPinned, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/session'
import { storeAuthReturnPath } from '@/features/auth/session/auth-return'
import { buttonVariants } from '@/shared/ui/button-variants'
import { SectionHeader } from '@/shared/ui/SectionHeader'
import { cn } from '@/shared/lib/cn'

interface JourneyReaderClosingSectionProps {
  shareUrl: string
  spaceHandle: string
  title: string
}

export function JourneyReaderClosingSection({
  spaceHandle,
}: JourneyReaderClosingSectionProps) {
  const { t } = useTranslation()
  const { user } = useSession()

  return (
    <section
      aria-labelledby="reader-closing-heading"
      className="scroll-mt-24 py-10 sm:py-14"
    >
      <div className="reader-closing-band px-5 py-8 sm:px-8 sm:py-10">
        <SectionHeader
          description={t('reader.closingDescription')}
          eyebrow={t('reader.closingEyebrow')}
          headingId="reader-closing-heading"
          title={t('reader.closingTitle')}
        />

        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <li className="inline-flex min-h-11 items-center gap-2">
            <WifiOff aria-hidden="true" size={16} />
            {t('reader.closingFeatureOffline')}
          </li>
          <li className="inline-flex min-h-11 items-center gap-2">
            <MapPinned aria-hidden="true" size={16} />
            {t('reader.closingFeatureMaps')}
          </li>
          <li className="inline-flex min-h-11 items-center gap-2">
            <Lock aria-hidden="true" size={16} />
            {t('reader.closingFeaturePrivacy')}
          </li>
        </ul>

        <div className="mt-6 flex flex-wrap gap-3">
          {user === null ? (
            <Link
              className={buttonVariants({ variant: 'primary' })}
              onClick={() => {
                storeAuthReturnPath(
                  `${window.location.pathname}${window.location.search}`,
                )
              }}
              to="/sign-up"
            >
              {t('reader.closingCreateAccount')}
            </Link>
          ) : null}
          <Link
            className={cn(
              buttonVariants({
                variant: user === null ? 'secondary' : 'primary',
              }),
            )}
            params={{ spaceHandle }}
            to="/$spaceHandle"
          >
            {t('reader.closingVisitSpace', { handle: spaceHandle })}
          </Link>
        </div>
      </div>
    </section>
  )
}
