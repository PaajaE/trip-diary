import { useEffect } from 'react'

interface DocumentMeta {
  description?: string
  imageUrl?: string
  title: string
}

function setMetaTag(attribute: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attribute}="${key}"]`
  let element = document.head.querySelector(selector)
  if (element === null) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

export function useDocumentMeta(meta: DocumentMeta | null) {
  useEffect(() => {
    if (meta === null) {
      return
    }

    const previousTitle = document.title
    document.title = meta.title

    if (meta.description !== undefined) {
      setMetaTag('name', 'description', meta.description)
      setMetaTag('property', 'og:description', meta.description)
    }
    setMetaTag('property', 'og:title', meta.title)
    setMetaTag('property', 'og:type', 'website')
    if (typeof window !== 'undefined') {
      setMetaTag('property', 'og:url', window.location.href)
    }
    if (meta.imageUrl !== undefined) {
      setMetaTag('property', 'og:image', meta.imageUrl)
    }

    return () => {
      document.title = previousTitle
    }
  }, [meta])
}
