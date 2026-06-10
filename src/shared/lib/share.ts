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
