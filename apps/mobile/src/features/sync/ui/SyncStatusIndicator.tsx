import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import type { SyncUserStatusViewModel } from '@/features/sync/lib/resolve-sync-user-status'
import { colors } from '@/foundation/theme'

const INDICATOR_SIZE = 10

function indicatorColor(viewModel: SyncUserStatusViewModel): string {
  switch (viewModel.status) {
    case 'failed':
      return colors.error
    case 'processing':
      return colors.primary
    case 'waiting_for_network':
    case 'pending':
      return '#b8860b'
    case 'waiting_for_session':
      return colors.textMuted
    case 'synchronized':
      return colors.primary
  }
}

export function SyncStatusIndicator({
  isProcessing,
  viewModel,
}: {
  isProcessing: boolean
  viewModel: SyncUserStatusViewModel
}) {
  if (isProcessing || viewModel.status === 'processing') {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.primary} size="small" />
      </View>
    )
  }

  const showBadge =
    viewModel.failedCount > 0 ||
    viewModel.pendingCount > 0 ||
    viewModel.status === 'waiting_for_network'

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.dot,
          { backgroundColor: indicatorColor(viewModel) },
          viewModel.status === 'synchronized' ? styles.dotMuted : null,
        ]}
      />
      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {viewModel.failedCount > 0
              ? '!'
              : viewModel.pendingCount > 9
                ? '9+'
                : String(viewModel.pendingCount || '•')}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    backgroundColor: colors.error,
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 3,
    position: 'absolute',
    right: 4,
    top: 6,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  container: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  dot: {
    borderRadius: INDICATOR_SIZE / 2,
    height: INDICATOR_SIZE,
    width: INDICATOR_SIZE,
  },
  dotMuted: {
    opacity: 0.45,
  },
})
