import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateAfterPhotoTagChange } from '@/entities/photo/api/invalidate-after-photo-mutation'
import {
  assignPhotoTag,
  removePhotoTag,
} from '@/entities/photo/api/photo-tag-mutation.repository'
import {
  SUGGESTED_PHOTO_TAG_SLUGS,
  type PhotoTagAssignment,
} from '@/entities/photo/model/photo-tag'
import { normalizePhotoTagSlug } from '@/entities/photo/lib/normalize-photo-tag'
import { cn } from '@/shared/lib/cn'

interface PhotoTagEditorProps {
  assignedTags: PhotoTagAssignment[]
  creatorId: string
  journeyId: string
  onChanged?: () => void
  photoId: string
}

export function PhotoTagEditor({
  assignedTags,
  creatorId,
  journeyId,
  onChanged,
  photoId,
}: PhotoTagEditorProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [customTag, setCustomTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const assignedSlugs = new Set(assignedTags.map((tag) => tag.slug))

  async function invalidate() {
    await invalidateAfterPhotoTagChange(queryClient, journeyId)
    onChanged?.()
  }

  async function toggleTag(slug: string, label: string) {
    setSaving(true)
    setSaveError(null)
    try {
      if (assignedSlugs.has(slug)) {
        await removePhotoTag({ creatorId, journeyId, photoId, slug })
      } else {
        await assignPhotoTag({ creatorId, journeyId, label, photoId })
      }
      await invalidate()
    } catch {
      setSaveError(t('photoTag.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function addCustomTag() {
    const trimmed = customTag.trim()
    if (trimmed === '') {
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await assignPhotoTag({
        creatorId,
        journeyId,
        label: trimmed,
        photoId,
      })
      setCustomTag('')
      await invalidate()
    } catch {
      setSaveError(t('photoTag.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {saveError === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {saveError}
        </p>
      )}
      <p className="text-sm font-semibold">{t('photoTag.editTitle')}</p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_PHOTO_TAG_SLUGS.map((slug) => {
          const active = assignedSlugs.has(slug)
          return (
            <button
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/15 text-white hover:bg-white/25',
              )}
              disabled={saving}
              key={slug}
              onClick={() => {
                void toggleTag(slug, t(`photoTag.suggested.${slug}`))
              }}
              type="button"
            >
              {t(`photoTag.suggested.${slug}`)}
            </button>
          )
        })}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void addCustomTag()
        }}
      >
        <input
          className="min-h-10 flex-1 rounded-md border border-white/20 bg-black/30 px-3 text-sm text-white placeholder:text-white/60"
          disabled={saving}
          onChange={(event) => {
            setCustomTag(event.target.value)
          }}
          placeholder={t('photoTag.customPlaceholder')}
          value={customTag}
        />
        <button
          className="rounded-md bg-white/15 px-3 text-sm font-semibold text-white hover:bg-white/25 disabled:opacity-60"
          disabled={saving || customTag.trim() === ''}
          type="submit"
        >
          {t('photoTag.add')}
        </button>
      </form>
      {assignedTags.length > 0 ? (
        <p className="text-xs text-white/70">
          {assignedTags
            .map((tag) => tag.label)
            .filter((label, index, labels) => labels.indexOf(label) === index)
            .join(' · ')}
        </p>
      ) : null}
      {customTag.trim() !== '' ? (
        <p className="text-xs text-white/50">
          {normalizePhotoTagSlug(customTag)}
        </p>
      ) : null}
    </div>
  )
}
