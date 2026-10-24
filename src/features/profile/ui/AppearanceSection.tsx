import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from '@/shared/lib/theme'

const OPTIONS = [
  'auto',
  'light',
  'dark',
] as const satisfies readonly ThemePreference[]

/** Light / dark / automatic choice; stored on this device only. */
export function AppearanceSection() {
  const { t } = useTranslation()
  const [preference, setPreference] = useState(readThemePreference)

  return (
    <fieldset className="min-w-0">
      <legend className="text-base font-semibold">
        {t('profile.settings.appearance.title')}
      </legend>
      <p className="mt-1 text-sm text-muted">
        {t('profile.settings.appearance.hint')}
      </p>
      <div
        className="mt-3 grid gap-2 sm:grid-cols-3"
        data-testid="appearance-options"
      >
        {OPTIONS.map((option) => (
          <label
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary/55"
            key={option}
          >
            <input
              checked={preference === option}
              className="size-5 shrink-0 accent-primary"
              name="theme-preference"
              type="radio"
              value={option}
              onChange={() => {
                setPreference(option)
                setThemePreference(option)
              }}
            />
            <span className="flex flex-col">
              {t(`profile.settings.appearance.${option}`)}
              {option === 'auto' ? (
                <span className="text-xs font-normal text-muted">
                  {t('profile.settings.appearance.autoHint')}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
