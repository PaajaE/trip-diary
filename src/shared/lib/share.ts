export async function shareUrl(url: string, title: string) {
  const webNavigator = navigator as {
    clipboard?: Clipboard
    share?: (data?: ShareData) => Promise<void>
  }
  const share = webNavigator.share
  if (share !== undefined) {
    await share({ title, url })
    return
  }
  if (webNavigator.clipboard === undefined) {
    throw new Error('Sharing is not available')
  }
  await webNavigator.clipboard.writeText(url)
}

export function openWhatsAppShare(text: string) {
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function copyText(text: string) {
  const webNavigator = navigator as { clipboard?: Clipboard }
  if (webNavigator.clipboard === undefined) {
    throw new Error('Clipboard is not available')
  }
  await webNavigator.clipboard.writeText(text)
}
