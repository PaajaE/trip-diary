import { Link } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  composeJourneyContent,
  getJourneyStageContentLabel,
} from '@/features/journeys/lib/compose-journey-content'
import type { JourneyFullDetail } from '@/features/journeys/model/journey-detail'
import { colors, spacing } from '@/foundation/theme'

interface JourneyContentSectionProps {
  journey: JourneyFullDetail
}

export function JourneyContentSection({ journey }: JourneyContentSectionProps) {
  const { i18n, t } = useTranslation()
  const content = composeJourneyContent(journey)

  if (content.stageContents.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>{t('journey.captureTitle')}</Text>
        <Text style={styles.emptyBody}>{t('journey.captureDescription')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {content.stageContents.map((stageContent) => {
        const label = getJourneyStageContentLabel(
          stageContent,
          t,
          i18n.language,
        )
        const stageId = stageContent.stage?.id

        return (
          <View
            key={`${label}-${stageId ?? stageContent.dayKey ?? 'misc'}`}
            style={styles.section}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{label}</Text>
              {stageId !== undefined ? (
                <Link
                  href={{
                    pathname: '/journey/[id]/stage/[stageId]',
                    params: { id: journey.id, stageId },
                  }}
                  asChild
                >
                  <Pressable
                    accessibilityRole="button"
                    style={styles.linkButton}
                  >
                    <Text style={styles.linkText}>
                      {t('journey.openStage')}
                    </Text>
                  </Pressable>
                </Link>
              ) : null}
            </View>

            {stageContent.moments.length === 0 ? (
              <Text style={styles.emptyStage}>{t('journey.noMomentsYet')}</Text>
            ) : (
              stageContent.moments.map((moment) => (
                <Link
                  href={{
                    pathname: '/journey/[id]/moment/[entryId]',
                    params: { entryId: moment.entry.id, id: journey.id },
                  }}
                  key={moment.entry.id}
                  asChild
                >
                  <Pressable
                    accessibilityLabel={
                      moment.entry.title?.trim().length
                        ? moment.entry.title
                        : t('dashboard.untitled')
                    }
                    accessibilityRole="button"
                    style={styles.momentCard}
                    testID={`moment-card-${moment.entry.id}`}
                  >
                    {moment.entry.coverPreviewUrl !== null ? (
                      <Image
                        accessibilityIgnoresInvertColors
                        source={{ uri: moment.entry.coverPreviewUrl }}
                        style={styles.momentCover}
                      />
                    ) : null}
                    <Text style={styles.momentTitle}>
                      {moment.entry.title?.trim().length
                        ? moment.entry.title
                        : t('dashboard.untitled')}
                    </Text>
                    {moment.entry.body.trim().length > 0 ? (
                      <Text numberOfLines={2} style={styles.momentBody}>
                        {moment.entry.body}
                      </Text>
                    ) : null}
                    {moment.location !== null ? (
                      <Text style={styles.momentMeta}>
                        {t('journey.momentHasLocation')}
                      </Text>
                    ) : null}
                  </Pressable>
                </Link>
              ))
            )}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  emptyStage: {
    color: colors.textMuted,
    fontSize: 14,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  linkButton: {
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  linkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  momentBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  momentCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: spacing.sm,
    minHeight: 44,
    overflow: 'hidden',
    padding: spacing.md,
  },
  momentCover: {
    backgroundColor: '#d9d9d9',
    borderRadius: 8,
    height: 140,
    marginBottom: spacing.sm,
    width: '100%',
  },
  momentMeta: {
    color: colors.primary,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  momentTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
})
