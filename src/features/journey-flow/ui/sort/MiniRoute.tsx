import { useTranslation } from 'react-i18next'
import type { GeoPoint } from '@trip-diary/core/automation'

const W = 320
const H = 120
const PAD = 14

/**
 * A small schematic route of the day (Konec dne): the stops with a known
 * position in time order, projected into a box. No map tiles, no network.
 * Nothing is drawn with fewer than two positions.
 */
export function MiniRoute({
  className,
  points,
}: {
  className?: string
  points: readonly GeoPoint[]
}) {
  const { t } = useTranslation()
  if (points.length < 2) return null
  const lats = points.map((p) => p.latitude)
  const lngs = points.map((p) => p.longitude)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  // Longitude shrinks with latitude; keep the shape roughly true.
  const mid = ((minLat + maxLat) / 2) * (Math.PI / 180)
  const spanX = Math.max((maxLng - minLng) * Math.cos(mid), 1e-6)
  const spanY = Math.max(maxLat - minLat, 1e-6)
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY)
  const offX = (W - spanX * scale) / 2
  const offY = (H - spanY * scale) / 2
  const xy = points.map((p) => ({
    x: offX + (p.longitude - minLng) * Math.cos(mid) * scale,
    y: offY + (maxLat - p.latitude) * scale,
  }))
  const path = xy
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
  return (
    <svg
      aria-label={t('flow.dayEnd.routeLabel')}
      className={className}
      role="img"
      viewBox={`0 0 ${String(W)} ${String(H)}`}
    >
      <path
        className="stroke-primary"
        d={path}
        fill="none"
        strokeDasharray="4 4"
        strokeLinecap="round"
        strokeWidth={2.5}
      />
      {xy.map((p, i) => (
        <circle
          className={
            i === 0 || i === xy.length - 1
              ? 'fill-primary'
              : 'fill-background stroke-primary'
          }
          cx={p.x}
          cy={p.y}
          key={`${String(i)}-${p.x.toFixed(1)}`}
          r={i === 0 || i === xy.length - 1 ? 6 : 4.5}
          strokeWidth={2}
        />
      ))}
    </svg>
  )
}
