import { useTranslation } from 'react-i18next'

export function SoonBadge() {
  const { t } = useTranslation()

  return (
    <span className="inline-flex items-center rounded-full border border-accent-strong/30 bg-accent/10 px-2.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap text-accent-strong">
      {t('home.soon')}
    </span>
  )
}
