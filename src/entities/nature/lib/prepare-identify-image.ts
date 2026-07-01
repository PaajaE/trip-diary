export async function prepareIdentifyImage(
  blob: Blob,
  maxEdge = 1024,
): Promise<{ imageBase64: string; mimeType: 'image/jpeg' }> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) {
    bitmap.close()
    throw new Error('Canvas is unavailable')
  }

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const output = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (nextBlob === null) {
          reject(new Error('Image encoding failed'))
          return
        }
        resolve(nextBlob)
      },
      'image/jpeg',
      0.82,
    )
  })

  const buffer = await output.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return {
    imageBase64: btoa(binary),
    mimeType: 'image/jpeg',
  }
}
