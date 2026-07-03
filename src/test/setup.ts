import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { Buffer } from 'node:buffer'

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  value: () => undefined,
})

// jsdom 29 routes FileReader through @exodus/bytes, which can throw an uncaught
// TypeError when blob internals are not a Node-realm Uint8Array. Use arrayBuffer()
// so preview-url and hook tests get stable async data URLs in CI.
FileReader.prototype.readAsDataURL = function readAsDataURL(
  this: FileReader,
  blob: Blob,
) {
  queueMicrotask(() => {
    void blob.arrayBuffer().then(
      (buffer) => {
        const base64 = Buffer.from(buffer).toString('base64')
        const type = blob.type || 'application/octet-stream'
        Object.defineProperty(this, 'result', {
          configurable: true,
          value: `data:${type};base64,${base64}`,
        })
        this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>)
      },
      () => {
        this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>)
      },
    )
  })
}
