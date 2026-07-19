import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { createJourneyRemote } from '@/features/journeys/api/journey-mutations.repository'
import { resolveDefaultSpaceId } from '@/features/spaces/api/spaces.repository'
import { colors, spacing } from '@/foundation/theme'
import { isNetworkOnline, useNetworkState } from '@/foundation/network'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_TITLE_LENGTH = 160
const MAX_SUMMARY_LENGTH = 5000

export interface CreatedJourneyMeta {
  endsAt: string | null
  spaceId: string
  startsAt: string | null
  summary: string
  title: string
}

interface CreateJourneyFormProps {
  creatorId: string
  onCreated: (
    journeyId: string,
    meta: CreatedJourneyMeta,
  ) => void | Promise<void>
}

function parseOptionalIsoDate(
  value: string,
): { ok: true; value: string | null } | { ok: false } {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return { ok: true, value: null }
  }
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    return { ok: false }
  }
  const parsed = Date.parse(`${trimmed}T00:00:00Z`)
  if (Number.isNaN(parsed)) {
    return { ok: false }
  }
  return { ok: true, value: trimmed }
}

export function CreateJourneyForm({
  creatorId,
  onCreated,
}: CreateJourneyFormProps) {
  const { t } = useTranslation()
  const networkState = useNetworkState()
  const isOnline = isNetworkOnline(networkState)
  const submittingRef = useRef(false)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(): Promise<void> {
    if (submittingRef.current) {
      return
    }

    const trimmedTitle = title.trim()
    if (trimmedTitle.length === 0 || trimmedTitle.length > MAX_TITLE_LENGTH) {
      setError(t('journey.createError'))
      return
    }

    const trimmedSummary = summary.trim()
    if (trimmedSummary.length > MAX_SUMMARY_LENGTH) {
      setError(t('journey.createError'))
      return
    }

    const startsAtResult = parseOptionalIsoDate(startsAt)
    const endsAtResult = parseOptionalIsoDate(endsAt)
    if (!startsAtResult.ok || !endsAtResult.ok) {
      setError(t('journey.createError'))
      return
    }

    const normalizedStarts = startsAtResult.value
    const normalizedEnds = endsAtResult.value

    if (
      normalizedStarts !== null &&
      normalizedEnds !== null &&
      normalizedEnds < normalizedStarts
    ) {
      setError(t('journey.createError'))
      return
    }

    if (!isOnline) {
      setError(t('journey.createError'))
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setError(null)

    try {
      const spaceId = await resolveDefaultSpaceId(creatorId)
      const journeyId = await createJourneyRemote({
        creatorId,
        endsAt: normalizedEnds,
        spaceId,
        startsAt: normalizedStarts,
        summary: trimmedSummary,
        title: trimmedTitle,
      })
      await onCreated(journeyId, {
        endsAt: normalizedEnds,
        spaceId,
        startsAt: normalizedStarts,
        summary: trimmedSummary,
        title: trimmedTitle,
      })
    } catch {
      setError(t('journey.createError'))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>{t('journey.title')}</Text>
      <TextInput
        accessibilityLabel={t('journey.title')}
        autoCapitalize="sentences"
        maxLength={MAX_TITLE_LENGTH}
        onChangeText={setTitle}
        placeholder={t('journey.title')}
        placeholderTextColor={colors.textSubtle}
        style={styles.input}
        value={title}
      />

      <Text style={styles.label}>{t('journey.summary')}</Text>
      <TextInput
        accessibilityLabel={t('journey.summary')}
        autoCapitalize="sentences"
        maxLength={MAX_SUMMARY_LENGTH}
        multiline
        onChangeText={setSummary}
        placeholder={t('journey.summary')}
        placeholderTextColor={colors.textSubtle}
        style={[styles.input, styles.summaryInput]}
        value={summary}
      />

      <View style={styles.dateRow}>
        <View style={styles.dateField}>
          <Text style={styles.label}>{t('journey.startsAt')}</Text>
          <TextInput
            accessibilityLabel={t('journey.startsAt')}
            autoCapitalize="none"
            onChangeText={setStartsAt}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
            value={startsAt}
          />
        </View>
        <View style={styles.dateField}>
          <Text style={styles.label}>{t('journey.endsAt')}</Text>
          <TextInput
            accessibilityLabel={t('journey.endsAt')}
            autoCapitalize="none"
            onChangeText={setEndsAt}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
            value={endsAt}
          />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={submitting || !isOnline}
        onPress={() => void handleSubmit()}
        style={[
          styles.submitButton,
          submitting || !isOnline ? styles.submitDisabled : null,
        ]}
        testID="create-journey-submit"
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.submitText}>{t('journey.create')}</Text>
        )}
      </Pressable>

      {error !== null ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  dateField: {
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  form: {
    gap: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    marginBottom: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  submitDisabled: {
    opacity: 0.55,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  summaryInput: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
})
