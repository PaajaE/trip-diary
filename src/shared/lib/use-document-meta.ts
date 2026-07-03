import { useEffect } from 'react'

interface DocumentMeta {
  description?: string
  imageUrl?: string
  title: string
}

const DEFAULT_DOCUMENT_TITLE = 'Trip Diary'

function setMetaTag(
  attribute: 'name' | 'property',
  key: string,
  content: string,
) {
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
  const title = meta?.title
  const description = meta?.description
  const imageUrl = meta?.imageUrl

  useEffect(() => {
    if (title === undefined) {
      return
    }

    document.title = title

    if (description !== undefined) {
      setMetaTag('name', 'description', description)
      setMetaTag('property', 'og:description', description)
    }
    setMetaTag('property', 'og:title', title)
    setMetaTag('property', 'og:type', 'website')
    if (typeof window !== 'undefined') {
      setMetaTag('property', 'og:url', window.location.href)
    }
    if (imageUrl !== undefined) {
      setMetaTag('property', 'og:image', imageUrl)
    }
  }, [description, imageUrl, title])

  useEffect(() => {
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE
    }
  }, [])
}
