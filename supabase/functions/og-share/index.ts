import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

const BOT_PATTERN =
  /facebookexternalhit|whatsapp|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|googlebot|bingpreview|facebot|ia_archiver/i

interface OgMeta {
  canonicalUrl: string
  description: string
  imageUrl: string | null
  title: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderOgHtml(meta: OgMeta): string {
  const imageTag =
    meta.imageUrl === null
      ? ''
      : `<meta property="og:image" content="${escapeHtml(meta.imageUrl)}" />`

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}" />
    ${imageTag}
    <meta name="twitter:card" content="${meta.imageUrl === null ? 'summary' : 'summary_large_image'}" />
  </head>
  <body>
    <p><a href="${escapeHtml(meta.canonicalUrl)}">${escapeHtml(meta.title)}</a></p>
  </body>
</html>`
}

function parsePublicPath(pathname: string) {
  const segments = pathname.split('/').filter((segment) => segment !== '')
  if (segments.length === 0) {
    return null
  }

  const [spaceHandle, second, third] = segments
  if (spaceHandle === undefined) {
    return null
  }

  if (second === undefined) {
    return { kind: 'space' as const, spaceHandle }
  }

  if (second === 'tipy' && third !== undefined) {
    return { entrySlug: third, kind: 'entry' as const, spaceHandle }
  }

  if (third === undefined) {
    return { journeySlug: second, kind: 'journey' as const, spaceHandle }
  }

  return {
    entrySlug: third,
    journeySlug: second,
    kind: 'moment' as const,
    spaceHandle,
  }
}

async function getSpaceId(
  supabase: ReturnType<typeof createClient>,
  handle: string,
) {
  const { data, error } = await supabase
    .from('spaces')
    .select('id')
    .eq('handle', handle)
    .maybeSingle()
  if (error !== null) {
    throw error
  }
  return data?.id ?? null
}

async function resolveFirstPhotoSignedUrl(
  supabase: ReturnType<typeof createClient>,
  entryIds: string[],
): Promise<string | null> {
  if (entryIds.length === 0) {
    return null
  }

  const { data: entryPhotos, error: entryPhotosError } = await supabase
    .from('entry_photos')
    .select('photo_id, entry_id, position')
    .in('entry_id', entryIds)
    .order('position')

  if (entryPhotosError !== null) {
    throw entryPhotosError
  }
  if (entryPhotos === null || entryPhotos.length === 0) {
    return null
  }

  const photoId = entryPhotos[0]?.photo_id
  if (photoId === undefined) {
    return null
  }

  const { data: variant, error: variantError } = await supabase
    .from('photo_variants')
    .select('storage_path, variant')
    .eq('photo_id', photoId)
    .in('variant', ['full', 'preview', 'medium', 'large', 'small', 'thumb'])
    .order('variant', { ascending: true })
    .limit(20)

  if (variantError !== null) {
    throw variantError
  }
  if (variant === null || variant.length === 0) {
    return null
  }

  const preference = ['full', 'preview', 'medium', 'large', 'small', 'thumb'] as const
  const byKind = new Map(variant.map((row) => [row.variant, row.storage_path]))
  let storagePath: string | null = null
  for (const kind of preference) {
    const path = byKind.get(kind)
    if (typeof path === 'string' && path.length > 0) {
      storagePath = path
      break
    }
  }
  if (storagePath === null) {
    return null
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from('photos')
    .createSignedUrl(storagePath, 60 * 60 * 24)

  if (signedError !== null) {
    return null
  }

  return signed?.signedUrl ?? null
}

async function resolveOgMeta(
  supabase: ReturnType<typeof createClient>,
  siteUrl: string,
  pathname: string,
): Promise<OgMeta | null> {
  const parsed = parsePublicPath(pathname)
  if (parsed === null) {
    return null
  }

  const canonicalUrl = new URL(pathname, siteUrl).href

  if (parsed.kind === 'space') {
    const { data: space, error } = await supabase
      .from('spaces')
      .select('name, description, avatar_url')
      .eq('handle', parsed.spaceHandle)
      .maybeSingle()
    if (error !== null) {
      throw error
    }
    if (space === null) {
      return null
    }

    return {
      canonicalUrl,
      description:
        space.description?.trim() || `Cestovní deník rodiny ${space.name}`,
      imageUrl: space.avatar_url,
      title: space.name,
    }
  }

  const spaceId = await getSpaceId(supabase, parsed.spaceHandle)
  if (spaceId === null) {
    return null
  }

  if (parsed.kind === 'journey') {
    const { data: journey, error } = await supabase
      .from('journeys')
      .select('id, title, summary')
      .eq('space_id', spaceId)
      .eq('slug', parsed.journeySlug)
      .eq('visibility', 'public')
      .maybeSingle()
    if (error !== null) {
      throw error
    }
    if (journey === null) {
      return null
    }

    const { data: links, error: linksError } = await supabase
      .from('entry_journey_links')
      .select('entry_id')
      .eq('journey_id', journey.id)
    if (linksError !== null) {
      throw linksError
    }

    const entryIds = (links ?? []).map((link) => link.entry_id)
    let publicEntryIds: string[] = []
    if (entryIds.length > 0) {
      const { data: entries, error: entriesError } = await supabase
        .from('entries')
        .select('id')
        .in('id', entryIds)
        .eq('status', 'published')
        .eq('visibility', 'public')
      if (entriesError !== null) {
        throw entriesError
      }
      publicEntryIds = (entries ?? []).map((entry) => entry.id)
    }

    const imageUrl = await resolveFirstPhotoSignedUrl(supabase, publicEntryIds)

    return {
      canonicalUrl,
      description:
        journey.summary.trim() || `Sledujte naši cestu: ${journey.title}`,
      imageUrl,
      title: journey.title,
    }
  }

  const entrySlug =
    parsed.kind === 'moment' ? parsed.entrySlug : parsed.entrySlug
  const { data: entry, error: entryError } = await supabase
    .from('entries')
    .select('id, title, body')
    .eq('space_id', spaceId)
    .eq('slug', entrySlug)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .maybeSingle()
  if (entryError !== null) {
    throw entryError
  }
  if (entry === null) {
    return null
  }

  if (parsed.kind === 'moment') {
    const { data: journey, error: journeyError } = await supabase
      .from('journeys')
      .select('id')
      .eq('space_id', spaceId)
      .eq('slug', parsed.journeySlug)
      .eq('visibility', 'public')
      .maybeSingle()
    if (journeyError !== null) {
      throw journeyError
    }
    if (journey === null) {
      return null
    }

    const { data: link, error: linkError } = await supabase
      .from('entry_journey_links')
      .select('entry_id')
      .eq('journey_id', journey.id)
      .eq('entry_id', entry.id)
      .maybeSingle()
    if (linkError !== null) {
      throw linkError
    }
    if (link === null) {
      return null
    }
  }

  const imageUrl = await resolveFirstPhotoSignedUrl(supabase, [entry.id])
  const description = entry.body.trim().slice(0, 160) || entry.title || ''

  return {
    canonicalUrl,
    description,
    imageUrl,
    title: entry.title ?? 'Trip Diary',
  }
}

Deno.serve(async (request) => {
  const url = new URL(request.url)
  const rawPath = url.searchParams.get('path') ?? '/'
  const pathname = rawPath.startsWith('/') ? rawPath : `/${rawPath}`

  const siteUrl = (
    Deno.env.get('SITE_URL') ?? 'https://cestovni-denik.cz'
  ).replace(/\/$/, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (supabaseUrl === undefined || serviceRoleKey === undefined) {
    return new Response('OG preview is not configured', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const meta = await resolveOgMeta(supabase, siteUrl, pathname)
    if (meta === null) {
      return new Response('Not found', { status: 404 })
    }

    const userAgent = request.headers.get('user-agent') ?? ''
    const isBot = BOT_PATTERN.test(userAgent)

    if (!isBot) {
      return Response.redirect(meta.canonicalUrl, 302)
    }

    return new Response(renderOgHtml(meta), {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (error) {
    console.error('[og-share]', error)
    return new Response('Failed to build preview', { status: 500 })
  }
})
