import { describe, expect, it } from 'vitest'
import { createManualNetworkStateProvider } from '@/foundation/network/manual-network-provider'
import {
  isNetworkOnline,
  mapNetInfoToNetworkState,
} from '@/foundation/network/network-status'

describe('network status mapping', () => {
  it('starts unknown when reachability has not resolved', () => {
    expect(
      mapNetInfoToNetworkState({
        isConnected: true,
        isInternetReachable: null,
      }),
    ).toEqual({
      isConnected: true,
      isInternetReachable: null,
      status: 'unknown',
    })
    expect(
      isNetworkOnline({
        isConnected: true,
        isInternetReachable: null,
        status: 'unknown',
      }),
    ).toBe(false)
  })

  it('treats confirmed internet reachability as online', () => {
    const state = mapNetInfoToNetworkState({
      isConnected: true,
      isInternetReachable: true,
    })

    expect(state.status).toBe('online')
    expect(isNetworkOnline(state)).toBe(true)
  })

  it('treats disconnected devices as offline', () => {
    const state = mapNetInfoToNetworkState({
      isConnected: false,
      isInternetReachable: false,
    })

    expect(state.status).toBe('offline')
    expect(isNetworkOnline(state)).toBe(false)
  })

  it('treats connected but unreachable networks as offline', () => {
    const state = mapNetInfoToNetworkState({
      isConnected: true,
      isInternetReachable: false,
    })

    expect(state.status).toBe('offline')
    expect(isNetworkOnline(state)).toBe(false)
  })
})

describe('manual network provider', () => {
  it('notifies subscribers and supports cleanup', () => {
    const provider = createManualNetworkStateProvider()
    const seen: string[] = []

    const unsubscribe = provider.subscribe((state) => {
      seen.push(state.status)
    })

    provider.__setState({
      isConnected: true,
      isInternetReachable: true,
      status: 'online',
    })
    provider.__setState({
      isConnected: true,
      isInternetReachable: true,
      status: 'online',
    })

    unsubscribe()
    provider.__setState({
      isConnected: false,
      isInternetReachable: false,
      status: 'offline',
    })

    expect(seen).toEqual(['unknown', 'online'])
  })
})
