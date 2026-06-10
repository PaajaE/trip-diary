import { useState, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addJourneyGuide,
  addJourneyStage,
  addJourneyStop,
} from '@/entities/journey/api/journey.repository'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface JourneyComposerProps {
  journey: JourneyDetail
  onChanged: () => void
}

export function JourneyComposer({ journey, onChanged }: JourneyComposerProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(
    event: SyntheticEvent<HTMLFormElement>,
    action: (form: FormData) => Promise<void>,
  ) {
    event.preventDefault()
    const formElement = event.currentTarget
    setFailed(false)
    setBusy(true)
    try {
      await action(new FormData(formElement))
      formElement.reset()
      onChanged()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-t border-border py-12">
      <h2 className="text-2xl font-semibold">{t('journey.addContent')}</h2>
      {failed ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {t('journey.addError')}
        </p>
      ) : null}
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <form
          className="space-y-4 rounded-lg bg-surface p-5"
          onSubmit={(event) =>
            void submit(event, async (form) => {
              await addJourneyStage(journey.id, getText(form, 'title'))
            })
          }
        >
          <h3 className="font-semibold">{t('journey.addStage')}</h3>
          <Input label={t('journey.itemTitle')} name="title" required />
          <Button disabled={busy} type="submit" variant="secondary">
            {t('journey.add')}
          </Button>
        </form>

        {journey.stages.length === 0 ? null : (
          <form
            className="space-y-4 rounded-lg bg-surface p-5"
            onSubmit={(event) =>
              void submit(event, async (form) => {
                await addJourneyStop(
                  journey.id,
                  getText(form, 'stageId'),
                  getText(form, 'title'),
                )
              })
            }
          >
            <h3 className="font-semibold">{t('journey.addStop')}</h3>
            <Input label={t('journey.itemTitle')} name="title" required />
            <label className="block text-sm font-medium">
              {t('journey.stage')}
              <select
                className="mt-2 min-h-11 w-full rounded-md border border-border bg-background px-3"
                name="stageId"
              >
                {journey.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.title}
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={busy} type="submit" variant="secondary">
              {t('journey.add')}
            </Button>
          </form>
        )}

        <form
          className="space-y-4 rounded-lg bg-surface p-5 sm:col-span-2"
          onSubmit={(event) =>
            void submit(event, async (form) => {
              await addJourneyGuide(
                journey.id,
                getText(form, 'title'),
                getText(form, 'body'),
              )
            })
          }
        >
          <h3 className="font-semibold">{t('journey.addGuide')}</h3>
          <Input label={t('journey.itemTitle')} name="title" required />
          <label className="block text-sm font-medium">
            {t('journey.guideBody')}
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-border bg-background px-3 py-3 font-normal"
              name="body"
            />
          </label>
          <Button disabled={busy} type="submit" variant="secondary">
            {t('journey.add')}
          </Button>
        </form>
      </div>
    </section>
  )
}

function getText(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}
