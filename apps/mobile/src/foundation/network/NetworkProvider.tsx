import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  createManualNetworkStateProvider,
  createNetInfoNetworkStateProvider,
  type NetworkStateProvider,
} from '@/foundation/network/netinfo-provider'
import type { NetworkState } from '@/foundation/network/network-status'

const INITIAL_UNKNOWN_STATE: NetworkState = {
  isConnected: false,
  isInternetReachable: null,
  status: 'unknown',
}

const NetworkContext = createContext<NetworkState>(INITIAL_UNKNOWN_STATE)

let sharedProvider: NetworkStateProvider | null = null

function getSharedNetworkProvider(): NetworkStateProvider {
  if (sharedProvider === null) {
    sharedProvider = createNetInfoNetworkStateProvider()
  }

  return sharedProvider
}

export function NetworkProvider({
  children,
  provider,
}: {
  children: ReactNode
  provider?: NetworkStateProvider
}) {
  const networkProvider = provider ?? getSharedNetworkProvider()
  const [networkState, setNetworkState] = useState<NetworkState>(
    INITIAL_UNKNOWN_STATE,
  )

  useEffect(() => {
    let isMounted = true

    void networkProvider.getCurrentState().then((state) => {
      if (isMounted) {
        setNetworkState(state)
      }
    })

    const unsubscribe = networkProvider.subscribe((state) => {
      if (isMounted) {
        setNetworkState(state)
      }
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [networkProvider])

  return (
    <NetworkContext.Provider value={networkState}>
      {children}
    </NetworkContext.Provider>
  )
}

export function useNetworkState(): NetworkState {
  return useContext(NetworkContext)
}

export function createTestNetworkProvider(
  initialState: NetworkState = INITIAL_UNKNOWN_STATE,
) {
  return createManualNetworkStateProvider(initialState)
}

export function resetSharedNetworkProviderForTests(): void {
  sharedProvider = null
}

export { INITIAL_UNKNOWN_STATE }
