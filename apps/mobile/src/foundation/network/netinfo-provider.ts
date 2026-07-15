import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import {
  mapNetInfoToNetworkState,
  type NetworkState,
  type NetworkStatus,
} from './network-status'

export interface NetworkStateListener {
  (state: NetworkState): void
}

export interface NetworkStateProvider {
  getCurrentState(): Promise<NetworkState>
  subscribe(listener: NetworkStateListener): () => void
}

const INITIAL_UNKNOWN_STATE: NetworkState = {
  isConnected: false,
  isInternetReachable: null,
  status: 'unknown',
}

export function mapNetInfoState(state: NetInfoState): NetworkState {
  return mapNetInfoToNetworkState({
    isConnected: state.isConnected,
    isInternetReachable: state.isInternetReachable,
  })
}

export function createNetInfoNetworkStateProvider(): NetworkStateProvider {
  let currentState = INITIAL_UNKNOWN_STATE
  const listeners = new Set<NetworkStateListener>()

  void NetInfo.fetch().then((state) => {
    currentState = mapNetInfoState(state)
    notifyListeners(listeners, currentState)
  })

  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const nextState = mapNetInfoState(state)
    if (!networkStatesEqual(currentState, nextState)) {
      currentState = nextState
      notifyListeners(listeners, currentState)
    }
  })

  return {
    async getCurrentState() {
      const state = await NetInfo.fetch()
      currentState = mapNetInfoState(state)
      return currentState
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(currentState)

      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          // NetInfo listener stays active for the app lifetime.
        }
      }
    },
    dispose() {
      unsubscribeNetInfo()
    },
  } as NetworkStateProvider & { dispose?: () => void }
}

function notifyListeners(
  listeners: Set<NetworkStateListener>,
  state: NetworkState,
): void {
  for (const listener of listeners) {
    listener(state)
  }
}

function networkStatesEqual(left: NetworkState, right: NetworkState): boolean {
  return (
    left.status === right.status &&
    left.isConnected === right.isConnected &&
    left.isInternetReachable === right.isInternetReachable
  )
}

export { createManualNetworkStateProvider } from './manual-network-provider'

export type { NetworkStatus }
