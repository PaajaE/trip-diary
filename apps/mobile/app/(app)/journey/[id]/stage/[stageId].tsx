import { Link, Stack, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useJourneyFullDetailQuery } from '@/features/journeys/use-journey-full-detail-query'
import {
  composeJourneyContent,
  getJourneyStageContentLabel,
} from '@/features/journeys/lib/compose-journey-content'
import { colors, spacing } from '@/foundation/theme'

export default function JourneyStageScreen() {
  const { id, stageId } = useLocalSearchParams<{
    id: string
    stageId: string
  }>()
  const { i18n, t } = useTranslation()
  const { data, isLoading } = useJourneyFullDetailQuery(id)

  if (isLoading || data === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  const stage = data.detail.stages.find((item) => item.id === stageId)
  if (stage === undefined) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{t('journey.notFound')}</Text>
      </View>
    )
  }

  const content = composeJourneyContent(data.detail)
  const stageContent = content.stageContents.find(
    (item) => item.stage?.id === stageId,
  )
  const moments = stageContent?.moments ?? []

  return (
    <>
      <Stack.Screen options={{ title: stage.title }} />
      <ScrollView contentContainerStyle={styles.container}>
        {stage.summary.trim().length > 0 ? (
          <Text style={styles.summary}>{stage.summary}</Text>
        ) : null}

        <Link
          href={{
            pathname: '/journey/[id]/moment/new',
            params: { id, stageId },
          }}
          asChild
        >
          <Pressable accessibilityRole="button" style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>
              {t('journey.addMoment')}
            </Text>
          </Pressable>
        </Link>

        <Text style={styles.sectionTitle}>
          {getJourneyStageContentLabel(
            { dayKey: null, moments, plannedStops: [], stage },
            t,
            i18n.language,
          )}
        </Text>

        {moments.length === 0 ? (
          <Text style={styles.empty}>{t('journey.noMomentsYet')}</Text>
        ) : (
          moments.map((moment) => (
            <Link
              href={{
                pathname: '/journey/[id]/moment/[entryId]',
                params: { entryId: moment.entry.id, id },
              }}
              key={moment.entry.id}
              asChild
            >
              <Pressable accessibilityRole="button" style={styles.momentCard}>
                <Text style={styles.momentTitle}>
                  {moment.entry.title?.trim().length
                    ? moment.entry.title
                    : t('dashboard.untitled')}
                </Text>
              </Pressable>
            </Link>
          ))
        )}
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 15,
  },
  error: {
    color: colors.error,
    fontSize: 16,
  },
  momentCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: spacing.sm,
    minHeight: 44,
    padding: spacing.md,
  },
  momentTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    marginBottom: spacing.lg,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  summary: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
})
