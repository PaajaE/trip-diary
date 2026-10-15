import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  releasePrerenderShell,
  releasePrerenderShellWhenReady,
} from '@/app/prerender-shell'

function mount(imageHtml: string) {
  document.body.innerHTML = `<div id="prerender-shell"></div><div id="root" hidden>${imageHtml}</div>`
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('prerender shell release', () => {
  it('removes the shell and reveals the root', () => {
    mount('')
    releasePrerenderShell()
    expect(document.getElementById('prerender-shell')).toBeNull()
    expect(document.getElementById('root')?.hidden).toBe(false)
  })

  it('waits for the rendered hero image to load', () => {
    mount('<img alt="" src="x.jpg" />')
    const image = document.querySelector('img')
    Object.defineProperty(image, 'complete', { value: false })
    releasePrerenderShellWhenReady()
    expect(document.getElementById('prerender-shell')).not.toBeNull()
    image?.dispatchEvent(new Event('load'))
    expect(document.getElementById('prerender-shell')).toBeNull()
    expect(document.getElementById('root')?.hidden).toBe(false)
  })

  it('gives up waiting after the timeout', () => {
    vi.useFakeTimers()
    mount('<img alt="" src="x.jpg" />')
    Object.defineProperty(document.querySelector('img'), 'complete', {
      value: false,
    })
    releasePrerenderShellWhenReady(document, 1000)
    vi.advanceTimersByTime(1000)
    expect(document.getElementById('prerender-shell')).toBeNull()
  })

  it('releases at once without an image', () => {
    mount('')
    releasePrerenderShellWhenReady()
    expect(document.getElementById('prerender-shell')).toBeNull()
  })
})
