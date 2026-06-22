import { Capacitor } from '@capacitor/core'

// Keep data URLs small — large originals can fail or exhaust memory in mobile WebViews.
const NATIVE_DATA_URL_MAX_BYTES = 1_500_000

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Preview data URL could not be created'))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('Preview read failed'))
    }
    reader.readAsDataURL(blob)
  })
}

export async function createPreviewUrl(blob: Blob): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    return URL.createObjectURL(blob)
  }

  if (blob.size > NATIVE_DATA_URL_MAX_BYTES) {
    throw new Error(
      `Preview blob too large for native display (${String(blob.size)} bytes)`,
    )
  }

  try {
    return await blobToDataUrl(blob)
  } catch {
    // iOS WKWebView can display small blob URLs; Android WebView often cannot.
    return URL.createObjectURL(blob)
  }
}

export function revokePreviewUrl(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

export function schedulePreviewUrlRevoke(
  pendingRevocations: Map<string, number>,
  url: string,
): void {
  if (!url.startsWith('blob:')) {
    return
  }

  pendingRevocations.set(
    url,
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
      pendingRevocations.delete(url)
    }),
  )
}

export function shouldWaitForProcessedVariantsOnNative(): boolean {
  return Capacitor.isNativePlatform()
}
