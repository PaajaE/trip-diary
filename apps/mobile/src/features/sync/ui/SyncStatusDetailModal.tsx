import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  getSyncFailureGuidanceKey,
  mapSafeSyncErrorMessage,
} from '@/features/sync/lib/resolve-sync-user-status'
import { useSyncStatusPresentation } from '@/features/sync/use-sync-status-presentation'
import { colors, spacing } from '@/foundation/theme'

export function SyncStatusDetailModal({
  onClose,
  open,
}: {
  onClose: () => void
  open: boolean
}) {
  const { t } = useTranslation()
  const presentation = useSyncStatusPresentation()

  async function handleRetry(): Promise<void> {
    await presentation.retry()
  }

  const guidanceKey = getSyncFailureGuidanceKey(
    presentation.viewModel,
    presentation.lastError,
  )

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={open}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel={t('journey.addSheetClose')}
          onPress={onClose}
          style={styles.scrim}
        />
        <View accessibilityRole="summary" style={styles.sheet}>
          <Text style={styles.title}>{t('sync.panel.title')}</Text>
          <Text style={styles.status}>{presentation.statusLabel}</Text>
          <Text style={styles.nextStep}>{presentation.nextStepLabel}</Text>

          {presentation.lastSyncLabel !== null ? (
            <Text style={styles.meta}>{presentation.lastSyncLabel}</Text>
          ) : null}

          {presentation.viewModel.pendingCount > 0 ? (
            <Text style={styles.meta}>
              {t('sync.mobile.pendingCount', {
                count: presentation.viewModel.pendingCount,
              })}
            </Text>
          ) : null}

          {presentation.viewModel.failedCount > 0 ? (
            <Text style={styles.meta}>
              {t('sync.mobile.failedCount', {
                count: presentation.viewModel.failedCount,
              })}
            </Text>
          ) : null}

          {presentation.viewModel.status === 'failed' ? (
            <Text style={styles.error}>
              {t(mapSafeSyncErrorMessage(presentation.lastError))}
            </Text>
          ) : null}

          {guidanceKey !== null ? (
            <Text style={styles.guidance}>{t(guidanceKey)}</Text>
          ) : null}

          {presentation.viewModel.canRetry ? (
            <Pressable
              accessibilityLabel={t('common.tryAgain')}
              accessibilityRole="button"
              disabled={presentation.isProcessing}
              onPress={() => void handleRetry()}
              style={[
                styles.retryButton,
                presentation.isProcessing ? styles.retryButtonDisabled : null,
              ]}
            >
              {presentation.isProcessing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.retryText}>{t('common.tryAgain')}</Text>
              )}
            </Pressable>
          ) : null}

          {presentation.viewModel.failedCount > 0 &&
          !presentation.viewModel.canRetry ? (
            <Text style={styles.guidance}>
              {t('sync.mobile.retryUnavailable')}
            </Text>
          ) : null}

          {__DEV__ && presentation.lastError !== null ? (
            <Text style={styles.devError}>{presentation.lastError}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.closeButton}
          >
            <Text style={styles.closeText}>{t('journey.addSheetClose')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  closeButton: {
    alignItems: 'center',
    marginTop: spacing.md,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  closeText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  devError: {
    color: colors.textSubtle,
    fontFamily: 'monospace',
    fontSize: 11,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  guidance: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  nextStep: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    marginTop: spacing.md,
    minHeight: 48,
    paddingVertical: 14,
  },
  retryButtonDisabled: {
    opacity: 0.7,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrim: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  status: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  title: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
})
