export type NetworkStatus = 'offline' | 'online' | 'unknown'

export interface NetworkState {
  isConnected: boolean
  isInternetReachable: boolean | null
  status: NetworkStatus
}

export interface NetInfoLikeState {
  isConnected: boolean | null
  isInternetReachable: boolean | null
}

/**
 * Maps native NetInfo values to product semantics.
 *
 * Online requires a confirmed connection AND confirmed internet reachability.
 * Connected with null reachability stays `unknown` (conservative — no sync).
 * Connected with explicit false reachability is offline.
 */
export function mapNetInfoToNetworkState(
  state: NetInfoLikeState,
): NetworkState {
  const isConnected = state.isConnected === true
  const isInternetReachable = state.isInternetReachable

  if (!isConnected || isInternetReachable === false) {
    return {
      isConnected,
      isInternetReachable,
      status: 'offline',
    }
  }

  if (isInternetReachable === true) {
    return {
      isConnected,
      isInternetReachable,
      status: 'online',
    }
  }

  return {
    isConnected,
    isInternetReachable,
    status: 'unknown',
  }
}

export function isNetworkOnline(state: NetworkState): boolean {
  return state.status === 'online'
}
