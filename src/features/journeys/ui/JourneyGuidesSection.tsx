import { Lightbulb, Plus } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addJourneyGuide,
  deleteJourneyGuide,
  updateJourneyGuide,
} from '@/entities/journey/api/journey.repository'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface JourneyGuidesSectionProps {
  canEdit: boolean
  creatorId: string
  journey: JourneyDetail
  onChanged: () => void
  showAddForm?: boolean
}

export function JourneyGuidesSection({
  canEdit,
  creatorId,
  journey,
  onChanged,
  showAddForm = false,
}: JourneyGuidesSectionProps) {
  const { t } = useTranslation()
  const [formOpenLocal, setFormOpenLocal] = useState(false)
  const [editingGuideId, setEditingGuideId] = useState<string | null>(null)
  const formOpen = showAddForm || formOpenLocal

  return (
    <section className="py-8 sm:py-10" id="guides">
      <div>
        <p className="text-sm font-medium text-accent">
          {t('journey.guidesEyebrow')}
        </p>
        <h2 className="mt-3 text-2xl font-semibold">{t('journey.guides')}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
          {t('journey.guidesDescription')}
        </p>
      </div>

      {journey.guides.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-6 text-muted">
          {t('journey.guidesEmpty')}
        </p>
      ) : (
        <div className="mt-8 space-y-4">
          {journey.guides.map((guide) =>
            editingGuideId === guide.id ? (
              <EditGuideForm
                creatorId={creatorId}
                guide={guide}
                journeyId={journey.id}
                key={guide.id}
                onCancel={() => {
                  setEditingGuideId(null)
                }}
                onSaved={() => {
                  setEditingGuideId(null)
                  onChanged()
                }}
              />
            ) : (
              <article
                className="rounded-2xl border border-border bg-surface p-5 shadow-soft"
                key={guide.id}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <Lightbulb aria-hidden="true" size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-semibold">{guide.title}</h3>
                      {canEdit ? (
                        <div className="flex shrink-0 gap-3">
                          <button
                            className="text-sm font-semibold text-primary"
                            onClick={() => {
                              setEditingGuideId(guide.id)
                            }}
                            type="button"
                          >
                            {t('journey.editGuideAction')}
                          </button>
                          <button
                            className="text-sm font-semibold text-destructive"
                            onClick={() => {
                              if (
                                !window.confirm(t('journey.deleteGuideConfirm'))
                              ) {
                                return
                              }
                              void deleteJourneyGuide(
                                creatorId,
                                journey.id,
                                guide.id,
                              ).then(onChanged)
                            }}
                            type="button"
                          >
                            {t('journey.deleteGuideAction')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-3 whitespace-pre-wrap leading-7 text-muted">
                      {guide.body}
                    </p>
                  </div>
                </div>
              </article>
            ),
          )}
        </div>
      )}

      {canEdit ? (
        <div className="mt-8">
          {formOpen ? (
            <AddGuideForm
              creatorId={creatorId}
              journeyId={journey.id}
              onCancel={() => {
                setFormOpenLocal(false)
              }}
              onSaved={() => {
                setFormOpenLocal(false)
                onChanged()
              }}
            />
          ) : (
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setFormOpenLocal(true)
              }}
              type="button"
              variant="secondary"
            >
              <Plus aria-hidden="true" size={16} />
              {t('journey.addGuide')}
            </Button>
          )}
        </div>
      ) : null}
    </section>
  )
}

interface AddGuideFormProps {
  creatorId: string
  journeyId: string
  onCancel: () => void
  onSaved: () => void
}

function AddGuideForm({
  creatorId,
  journeyId,
  onCancel,
  onSaved,
}: AddGuideFormProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = getText(form, 'title')
    const body = getText(form, 'body')
    setFailed(false)
    setBusy(true)
    try {
      await addJourneyGuide(creatorId, journeyId, title, body)
      event.currentTarget.reset()
      onSaved()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="rounded-2xl border border-border bg-surface p-5 shadow-soft"
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
    >
      <h3 className="text-lg font-semibold">{t('journey.addGuide')}</h3>
      <div className="mt-5 space-y-4">
        <Input label={t('journey.guideTitle')} name="title" required />
        <label className="block text-sm font-medium">
          {t('journey.guideBody')}
          <textarea
            className="mt-2 min-h-40 w-full rounded-md border border-border bg-background px-3 py-3 text-base outline-none focus:border-primary"
            name="body"
            required
          />
        </label>
        {failed ? (
          <p className="text-sm text-destructive" role="alert">
            {t('journey.addError')}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button className="w-full sm:flex-1" disabled={busy} type="submit">
            {t('journey.saveGuide')}
          </Button>
          <Button
            className="w-full sm:flex-1"
            disabled={busy}
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            {t('journey.cancelGuide')}
          </Button>
        </div>
      </div>
    </form>
  )
}

interface EditGuideFormProps {
  creatorId: string
  guide: JourneyDetail['guides'][number]
  journeyId: string
  onCancel: () => void
  onSaved: () => void
}

function EditGuideForm({
  creatorId,
  guide,
  journeyId,
  onCancel,
  onSaved,
}: EditGuideFormProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setFailed(false)
    setBusy(true)
    try {
      await updateJourneyGuide(creatorId, journeyId, guide.id, {
        body: getText(form, 'body'),
        title: getText(form, 'title'),
      })
      onSaved()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="rounded-2xl border border-border bg-surface p-5 shadow-soft"
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
    >
      <h3 className="text-lg font-semibold">{t('journey.editGuide')}</h3>
      <div className="mt-5 space-y-4">
        <Input
          defaultValue={guide.title}
          label={t('journey.guideTitle')}
          name="title"
          required
        />
        <label className="block text-sm font-medium">
          {t('journey.guideBody')}
          <textarea
            className="mt-2 min-h-40 w-full rounded-md border border-border bg-background px-3 py-3 text-base outline-none focus:border-primary"
            defaultValue={guide.body}
            name="body"
            required
          />
        </label>
        {failed ? (
          <p className="text-sm text-destructive" role="alert">
            {t('journey.addError')}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button className="w-full sm:flex-1" disabled={busy} type="submit">
            {t('journey.saveGuide')}
          </Button>
          <Button
            className="w-full sm:flex-1"
            disabled={busy}
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            {t('journey.cancelGuide')}
          </Button>
        </div>
      </div>
    </form>
  )
}

function getText(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}
