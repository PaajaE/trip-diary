export interface WikidataEntry {
  description: string | null
  id: string
  label: string
}

function wikidataLanguage(language: string): string {
  return language.startsWith('cs') ? 'cs' : 'en'
}

export function parseWikidataSearchResponse(payload: {
  search?: {
    description?: string
    id?: string
    label?: string
  }[]
}): WikidataEntry | null {
  const hit = payload.search?.[0]
  if (hit?.id === undefined || hit.label === undefined) {
    return null
  }

  return {
    description: hit.description ?? null,
    id: hit.id,
    label: hit.label,
  }
}

export async function fetchWikidataEntry(
  search: string,
  language = 'en',
): Promise<WikidataEntry | null> {
  const term = search.trim()
  if (term.length === 0) {
    return null
  }

  const params = new URLSearchParams({
    action: 'wbsearchentities',
    format: 'json',
    language: wikidataLanguage(language),
    limit: '1',
    search: term,
    type: 'item',
  })

  const response = await fetch(
    `https://www.wikidata.org/w/api.php?${params.toString()}`,
  )
  if (!response.ok) {
    return null
  }

  return parseWikidataSearchResponse(
    (await response.json()) as {
      search?: { description?: string; id?: string; label?: string }[]
    },
  )
}
