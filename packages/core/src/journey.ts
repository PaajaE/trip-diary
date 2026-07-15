import { z } from 'zod'

export const journeyStatusSchema = z.enum(['planning', 'active', 'completed'])
export const journeyStopStatusSchema = z.enum(['planned', 'visited'])

export const optionalJourneyDateSchema = z.iso.date().nullable()
export const journeyDateTimeSchema = z.iso.datetime({ offset: true })

export const journeyListItemSchema = z.object({
  endsAt: optionalJourneyDateSchema,
  id: z.uuid(),
  startsAt: optionalJourneyDateSchema,
  status: journeyStatusSchema,
  summary: z
    .string()
    .max(5000)
    .nullish()
    .transform((value) => value ?? null),
  title: z.string().min(1).max(160),
  updatedAt: journeyDateTimeSchema,
})

export const journeyHeaderSchema = z.object({
  endsAt: optionalJourneyDateSchema,
  id: z.uuid(),
  startsAt: optionalJourneyDateSchema,
  status: journeyStatusSchema,
  summary: z.string().max(5000),
  title: z.string().min(1).max(160),
})

export const journeyStopSchema = z.object({
  id: z.uuid(),
  mapLatitude: z.number().min(-90).max(90).nullable(),
  mapLongitude: z.number().min(-180).max(180).nullable(),
  notes: z.string().max(10_000).default(''),
  position: z.number().int().nonnegative().optional(),
  stageId: z.uuid().nullable(),
  status: journeyStopStatusSchema,
  title: z.string(),
})

export type JourneyStatus = z.infer<typeof journeyStatusSchema>
export type JourneyStopStatus = z.infer<typeof journeyStopStatusSchema>
export type JourneyListItem = z.infer<typeof journeyListItemSchema>
export type JourneyHeader = z.infer<typeof journeyHeaderSchema>
export type JourneyStop = z.infer<typeof journeyStopSchema>

function readRecordField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): unknown {
  return record[camelKey] ?? record[snakeKey]
}

export function normalizeJourneyListItemInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return {
    endsAt: readRecordField(input, 'endsAt', 'ends_at') ?? null,
    id: input.id,
    startsAt: readRecordField(input, 'startsAt', 'starts_at') ?? null,
    status: input.status,
    summary: readRecordField(input, 'summary', 'summary') ?? null,
    title: input.title,
    updatedAt: readRecordField(input, 'updatedAt', 'updated_at'),
  }
}

export function normalizeJourneyHeaderInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const summary = readRecordField(input, 'summary', 'summary')

  return {
    endsAt: readRecordField(input, 'endsAt', 'ends_at') ?? null,
    id: input.id,
    startsAt: readRecordField(input, 'startsAt', 'starts_at') ?? null,
    status: input.status,
    summary: typeof summary === 'string' ? summary : '',
    title: input.title,
  }
}

export function normalizeJourneyStopInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const notes = readRecordField(input, 'notes', 'notes')
  const position = readRecordField(input, 'position', 'position')

  return {
    id: input.id,
    mapLatitude:
      readRecordField(input, 'mapLatitude', 'map_latitude') ??
      readRecordField(input, 'latitude', 'latitude') ??
      null,
    mapLongitude:
      readRecordField(input, 'mapLongitude', 'map_longitude') ??
      readRecordField(input, 'longitude', 'longitude') ??
      null,
    notes: typeof notes === 'string' ? notes : '',
    position: typeof position === 'number' ? position : undefined,
    stageId: readRecordField(input, 'stageId', 'stage_id') ?? null,
    status: input.status,
    title: input.title,
  }
}

export function parseJourneyListItemFromRemoteRecord(
  record: Record<string, unknown>,
): JourneyListItem {
  return journeyListItemSchema.parse(normalizeJourneyListItemInput(record))
}

export function safeParseJourneyListItemPayload(
  payload: unknown,
): JourneyListItem | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  const result = journeyListItemSchema.safeParse(
    normalizeJourneyListItemInput(payload as Record<string, unknown>),
  )

  return result.success ? result.data : null
}

export function parseJourneyHeaderFromRemoteRecord(
  record: Record<string, unknown>,
): JourneyHeader {
  return journeyHeaderSchema.parse(normalizeJourneyHeaderInput(record))
}

export function safeParseJourneyHeaderPayload(
  payload: unknown,
): JourneyHeader | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  const result = journeyHeaderSchema.safeParse(
    normalizeJourneyHeaderInput(payload as Record<string, unknown>),
  )

  return result.success ? result.data : null
}

export function parseJourneyStopFromRemoteRecord(
  record: Record<string, unknown>,
): JourneyStop {
  return journeyStopSchema.parse(normalizeJourneyStopInput(record))
}

export function safeParseJourneyStopPayload(
  payload: unknown,
): JourneyStop | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  const result = journeyStopSchema.safeParse(
    normalizeJourneyStopInput(payload as Record<string, unknown>),
  )

  return result.success ? result.data : null
}

export function serializeJourneyListItemToLegacyCachePayload(
  item: JourneyListItem,
): Record<string, unknown> {
  return {
    ends_at: item.endsAt,
    id: item.id,
    starts_at: item.startsAt,
    status: item.status,
    summary: item.summary,
    title: item.title,
    updated_at: item.updatedAt,
  }
}

export function serializeJourneyHeaderToLegacyCachePayload(
  item: JourneyHeader,
): Record<string, unknown> {
  return {
    ends_at: item.endsAt,
    id: item.id,
    starts_at: item.startsAt,
    status: item.status,
    summary: item.summary,
    title: item.title,
  }
}
