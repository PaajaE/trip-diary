export interface MacrostratGeologyHint {
  ageRange: string | null
  formationLabel: string
}

interface MacrostratUnitRow {
  Fm?: string
  b_age?: number
  t_age?: number
  unit_name?: string
}

interface MacrostratStratNameRow {
  b_period?: string
  strat_name_long?: string
  t_period?: string
}

function formatMaRange(bottom: number, top: number): string {
  return `${bottom.toFixed(1)}–${top.toFixed(1)} Ma`
}

function pickUnitLabel(unit: MacrostratUnitRow): string | null {
  if (unit.Fm !== undefined && unit.Fm.trim() !== '') {
    return unit.Fm.trim()
  }
  if (unit.unit_name !== undefined && unit.unit_name.trim() !== 'Unnamed') {
    return unit.unit_name.trim()
  }
  return null
}

export function parseMacrostratUnitsResponse(payload: {
  success?: { data?: MacrostratUnitRow[] }
}): MacrostratGeologyHint | null {
  for (const unit of payload.success?.data ?? []) {
    const formationLabel = pickUnitLabel(unit)
    if (formationLabel === null) {
      continue
    }

    const ageRange =
      unit.b_age !== undefined &&
      unit.t_age !== undefined &&
      Number.isFinite(unit.b_age) &&
      Number.isFinite(unit.t_age)
        ? formatMaRange(unit.b_age, unit.t_age)
        : null

    return { ageRange, formationLabel }
  }

  return null
}

export function parseMacrostratStratNamesResponse(payload: {
  success?: { data?: MacrostratStratNameRow[] }
}): MacrostratGeologyHint | null {
  const row = payload.success?.data?.[0]
  if (row?.strat_name_long === undefined || row.strat_name_long.trim() === '') {
    return null
  }

  const ageRange =
    row.b_period !== undefined &&
    row.t_period !== undefined &&
    row.b_period !== '' &&
    row.t_period !== ''
      ? `${row.b_period} – ${row.t_period}`
      : null

  return {
    ageRange,
    formationLabel: row.strat_name_long.trim(),
  }
}

export async function fetchMacrostratGeologyHint(input: {
  latitude?: number | null
  longitude?: number | null
  stratName?: string | null
}): Promise<MacrostratGeologyHint | null> {
  if (
    input.latitude != null &&
    input.longitude != null &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    const params = new URLSearchParams({
      format: 'json',
      lat: String(input.latitude),
      lng: String(input.longitude),
    })
    const response = await fetch(
      `https://macrostrat.org/api/v2/units?${params.toString()}`,
    )
    if (response.ok) {
      const fromPoint = parseMacrostratUnitsResponse(
        (await response.json()) as {
          success?: { data?: MacrostratUnitRow[] }
        },
      )
      if (fromPoint !== null) {
        return fromPoint
      }
    }
  }

  const stratName = input.stratName?.trim()
  if (stratName === undefined || stratName.length === 0) {
    return null
  }

  const params = new URLSearchParams({
    format: 'json',
    strat_name: stratName,
  })
  const response = await fetch(
    `https://macrostrat.org/api/v2/defs/strat_names?${params.toString()}`,
  )
  if (!response.ok) {
    return null
  }

  return parseMacrostratStratNamesResponse(
    (await response.json()) as {
      success?: { data?: MacrostratStratNameRow[] }
    },
  )
}
