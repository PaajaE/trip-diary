import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  addJourneyStageRemote,
  deleteJourneyStageRemote,
  deleteJourneyRemote,
  updateJourneyRemote,
  updateJourneyStageRemote,
} from '@/features/journeys/api/journey-mutations.repository'
import type {
  JourneyFullDetail,
  JourneyStage,
} from '@/features/journeys/model/journey-detail'
import { colors, spacing } from '@/foundation/theme'

interface JourneyManagePanelProps {
  journey: JourneyFullDetail
  onChanged: () => void
  onDeleted: () => void | Promise<void>
}

export function JourneyManagePanel({
  journey,
  onChanged,
  onDeleted,
}: JourneyManagePanelProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(journey.title)
  const [summary, setSummary] = useState(journey.summary)
  const [newStageTitle, setNewStageTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runMutation(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : t('journey.addError'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {error !== null ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('journey.editTrip')}</Text>
        <Text style={styles.label}>{t('journey.itemTitle')}</Text>
        <TextInput
          editable={!busy}
          onChangeText={setTitle}
          style={styles.input}
          value={title}
        />
        <Text style={styles.label}>{t('journey.summary')}</Text>
        <TextInput
          editable={!busy}
          multiline
          onChangeText={setSummary}
          style={[styles.input, styles.textArea]}
          value={summary}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy || title.trim().length === 0}
          onPress={() => {
            void runMutation(async () => {
              await updateJourneyRemote(journey.id, {
                summary: summary.trim(),
                title: title.trim(),
              })
            })
          }}
          style={[styles.primaryButton, busy ? styles.buttonDisabled : null]}
        >
          <Text style={styles.primaryButtonText}>{t('journey.saveTrip')}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('journey.addStage')}</Text>
        <Text style={styles.helper}>{t('journey.stageDescription')}</Text>
        <Text style={styles.label}>{t('journey.stageTitle')}</Text>
        <TextInput
          editable={!busy}
          onChangeText={setNewStageTitle}
          style={styles.input}
          value={newStageTitle}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy || newStageTitle.trim().length === 0}
          onPress={() => {
            void runMutation(async () => {
              await addJourneyStageRemote(journey.id, newStageTitle.trim(), '')
              setNewStageTitle('')
            })
          }}
          style={[styles.primaryButton, busy ? styles.buttonDisabled : null]}
        >
          <Text style={styles.primaryButtonText}>
            {t('journey.addStageAction')}
          </Text>
        </Pressable>
      </View>

      {journey.stages.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('journey.manageStages')}</Text>
          {journey.stages.map((stage) => (
            <StageEditor
              busy={busy}
              key={stage.id}
              onDelete={() => {
                Alert.alert(
                  t('journey.deleteStageAction'),
                  t('journey.deleteStageConfirm'),
                  [
                    { style: 'cancel', text: t('common.cancel') },
                    {
                      style: 'destructive',
                      text: t('journey.deleteStageAction'),
                      onPress: () => {
                        void runMutation(async () => {
                          await deleteJourneyStageRemote(stage.id)
                        })
                      },
                    },
                  ],
                )
              }}
              onSave={(input) => {
                void runMutation(async () => {
                  await updateJourneyStageRemote(stage.id, input)
                })
              }}
              stage={stage}
            />
          ))}
        </View>
      ) : null}

      <View style={[styles.card, styles.dangerCard]}>
        <Text style={styles.dangerTitle}>{t('journey.deleteTrip')}</Text>
        <Text style={styles.helper}>{t('journey.deleteTripDescription')}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            Alert.alert(
              t('journey.deleteTripAction'),
              t('journey.deleteTripConfirm'),
              [
                { style: 'cancel', text: t('common.cancel') },
                {
                  style: 'destructive',
                  text: t('journey.deleteTripAction'),
                  onPress: () => {
                    void (async () => {
                      setBusy(true)
                      setError(null)
                      try {
                        await deleteJourneyRemote(journey.id)
                        await onDeleted()
                      } catch (mutationError) {
                        setError(
                          mutationError instanceof Error
                            ? mutationError.message
                            : t('journey.addError'),
                        )
                      } finally {
                        setBusy(false)
                      }
                    })()
                  },
                },
              ],
            )
          }}
          style={[styles.secondaryButton, busy ? styles.buttonDisabled : null]}
        >
          <Text style={styles.secondaryButtonText}>
            {t('journey.deleteTripAction')}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

function StageEditor({
  busy,
  onDelete,
  onSave,
  stage,
}: {
  busy: boolean
  onDelete: () => void
  onSave: (input: { summary: string; title: string }) => void
  stage: JourneyStage
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(stage.title)
  const [summary, setSummary] = useState(stage.summary)

  return (
    <View style={styles.stageCard}>
      <Text style={styles.label}>{t('journey.stageTitle')}</Text>
      <TextInput
        editable={!busy}
        onChangeText={setTitle}
        style={styles.input}
        value={title}
      />
      <Text style={styles.label}>{t('journey.stageSummary')}</Text>
      <TextInput
        editable={!busy}
        multiline
        onChangeText={setSummary}
        style={[styles.input, styles.textAreaSmall]}
        value={summary}
      />
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          disabled={busy || title.trim().length === 0}
          onPress={() => {
            onSave({ summary: summary.trim(), title: title.trim() })
          }}
          style={[
            styles.primaryButton,
            styles.flexButton,
            busy ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.primaryButtonText}>{t('journey.saveStage')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onDelete}
          style={[
            styles.secondaryButton,
            styles.flexButton,
            busy ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.secondaryButtonText}>
            {t('journey.deleteStageAction')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.6,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  dangerCard: {
    borderColor: '#efb4b4',
  },
  dangerTitle: {
    color: colors.error,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  error: {
    color: colors.error,
    marginBottom: spacing.md,
  },
  flexButton: {
    flex: 1,
  },
  helper: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    marginBottom: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  stageCard: {
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  textAreaSmall: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
})
