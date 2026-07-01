import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { applyChecklistTemplate } from '@/entities/checklist/api/checklist-mutation.repository'
import { CHECKLIST_TEMPLATES } from '@/entities/checklist/data/templates'
import { suggestChecklistTemplateFromTitle } from '@/entities/checklist/lib/suggest-template'
import { createJourney } from '@/entities/journey/api/journey.repository'
import {
  createJourneySchema,
  type CreateJourneyInput,
} from '@/entities/journey/model/journey'
import { NatureTemplateCards } from '@/features/nature/ui/NatureTemplateCards'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface CreateJourneyFormProps {
  creatorId: string
  onCreated: (journeyId: string) => void
  spaceId: string
}

export function CreateJourneyForm({
  creatorId,
  onCreated,
  spaceId,
}: CreateJourneyFormProps) {
  const { t } = useTranslation()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [natureOpen, setNatureOpen] = useState(false)
  const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<
    string | null
  >(null)
  const [templateManual, setTemplateManual] = useState(false)
  const form = useForm<CreateJourneyInput>({
    defaultValues: { endsAt: null, startsAt: null, summary: '', title: '' },
    resolver: zodResolver(createJourneySchema),
  })
  const title = form.watch('title')
  const suggestedSlug = suggestChecklistTemplateFromTitle(title)
  const selectedTemplate = CHECKLIST_TEMPLATES.find(
    (template) => template.slug === selectedTemplateSlug,
  )

  useEffect(() => {
    if (templateManual) {
      return
    }
    setSelectedTemplateSlug(suggestedSlug)
  }, [suggestedSlug, templateManual])

  async function handleSubmit(input: CreateJourneyInput) {
    setSubmitError(null)
    try {
      const journeyId = await createJourney(creatorId, spaceId, input)
      if (selectedTemplateSlug !== null) {
        await applyChecklistTemplate({
          creatorId,
          journeyId,
          templateSlug: selectedTemplateSlug,
          translate: t,
        })
      }
      onCreated(journeyId)
    } catch {
      setSubmitError(t('journey.createError'))
    }
  }

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => void form.handleSubmit(handleSubmit)(event)}
    >
      <Input
        error={form.formState.errors.title?.message}
        label={t('journey.title')}
        {...form.register('title')}
      />
      <label className="block text-sm font-medium">
        {t('journey.summary')}
        <textarea
          className="mt-2 min-h-32 w-full rounded-md border border-border bg-surface px-3 py-3 text-base font-normal outline-none focus:border-primary"
          {...form.register('summary')}
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label={t('journey.startsAt')}
          type="date"
          {...form.register('startsAt', {
            setValueAs: (value: string) => value || null,
          })}
        />
        <Input
          error={form.formState.errors.endsAt?.message}
          label={t('journey.endsAt')}
          type="date"
          {...form.register('endsAt', {
            setValueAs: (value: string) => value || null,
          })}
        />
      </div>

      <section className="rounded-2xl border border-border/80 bg-background/40">
        <button
          className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left"
          onClick={() => {
            setNatureOpen((current) => !current)
          }}
          type="button"
        >
          <div>
            <p className="text-sm font-medium">{t('nature.create.title')}</p>
            <p className="mt-1 text-sm text-muted">
              {selectedTemplate === undefined
                ? t('nature.create.description')
                : t(selectedTemplate.titleKey)}
            </p>
            {suggestedSlug !== null &&
            selectedTemplateSlug === suggestedSlug &&
            !templateManual ? (
              <p className="mt-1 text-xs text-primary">
                {t('nature.create.suggestedFromTitle')}
              </p>
            ) : null}
          </div>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'mt-0.5 size-5 shrink-0 text-muted transition-transform',
              natureOpen ? 'rotate-180' : '',
            )}
          />
        </button>
        {natureOpen ? (
          <div className="border-t border-border/60 px-4 pb-4 pt-3">
            <p className="text-sm text-muted">
              {t('nature.create.description')}
            </p>
            <div className="mt-3">
              <NatureTemplateCards
                applyingSlug={null}
                onSelect={(slug) => {
                  setTemplateManual(true)
                  setSelectedTemplateSlug((current) =>
                    current === slug ? null : slug,
                  )
                }}
                selectedSlug={selectedTemplateSlug}
                templates={CHECKLIST_TEMPLATES}
              />
            </div>
            {selectedTemplateSlug !== null ? (
              <button
                className="mt-3 text-sm text-muted hover:text-foreground"
                onClick={() => {
                  setTemplateManual(true)
                  setSelectedTemplateSlug(null)
                }}
                type="button"
              >
                {t('nature.create.clearSelection')}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <Button
        className="w-full"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {t('journey.create')}
      </Button>
      {submitError === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      )}
    </form>
  )
}
