import type { NetworkState } from './network-status'
import type { NetworkStateListener, NetworkStateProvider } from './netinfo-provider'

const INITIAL_UNKNOWN_STATE: NetworkState = {
  isConnected: false,
  isInternetReachable: null,
  status: 'unknown',
}

function networkStatesEqual(left: NetworkState, right: NetworkState): boolean {
  return (
    left.status === right.status &&
    left.isConnected === right.isConnected &&
    left.isInternetReachable === right.isInternetReachable
  )
}

function notifyListeners(
  listeners: Set<NetworkStateListener>,
  state: NetworkState,
): void {
  for (const listener of listeners) {
    listener(state)
  }
}

export function createManualNetworkStateProvider(
  initialState: NetworkState = INITIAL_UNKNOWN_STATE,
): NetworkStateProvider & {
  __setState: (state: NetworkState) => void
} {
  let currentState = initialState
  const listeners = new Set<NetworkStateListener>()

  return {
    async getCurrentState() {
      return currentState
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(currentState)

      return () => {
        listeners.delete(listener)
      }
    },
    __setState(state) {
      if (!networkStatesEqual(currentState, state)) {
        currentState = state
        notifyListeners(listeners, currentState)
      }
    },
  }
}
