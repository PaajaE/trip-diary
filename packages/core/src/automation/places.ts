// Shared with the resolve-place edge function (Deno); tested here.
export {
  buildReverseUrl,
  featureFromNaturalResult,
  lookupGridKey,
  NOMINATIM_MIN_INTERVAL_MS,
  NOMINATIM_USER_AGENT,
  PLACE_GEOCODE_SOURCE,
  regionFallback,
  settlementFromAddressResult,
  type NominatimLayer,
  type NominatimResult,
  type PlaceCandidate,
  type ReverseQuery,
} from '../../../../supabase/functions/_shared/places/nominatim.ts'
