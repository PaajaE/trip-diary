const TEMPLATE_KEYWORDS: { keywords: string[]; slug: string }[] = [
  {
    keywords: ['saxon switzerland', 'bohemian switzerland', 'svycarsk'],
    slug: 'ceske-svycarsko',
  },
  {
    keywords: [
      'krkonose',
      'krkonos',
      'giant mountains',
      'riesengebirge',
      'snezka',
    ],
    slug: 'krkonose',
  },
  {
    keywords: ['sumav', 'bohemian forest', 'bayerischer wald', 'modrava'],
    slug: 'sumava',
  },
]

function normalizeForMatch(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

export function suggestChecklistTemplateFromTitle(
  title: string,
): string | null {
  const normalized = normalizeForMatch(title).trim()
  if (normalized.length === 0) {
    return null
  }

  for (const entry of TEMPLATE_KEYWORDS) {
    if (
      entry.keywords.some((keyword) =>
        normalized.includes(normalizeForMatch(keyword)),
      )
    ) {
      return entry.slug
    }
  }

  return null
}
