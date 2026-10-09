import { useId } from 'react'

interface Pin {
  x: number
  y: number
}

const ROUTE_PATH =
  'M70 330 C 110 300, 120 250, 170 245 S 250 270, 285 215 S 330 120, 385 100 S 430 70, 420 40'

const PINS: readonly Pin[] = [
  { x: 70, y: 330 },
  { x: 170, y: 245 },
  { x: 285, y: 215 },
  { x: 385, y: 100 },
  { x: 420, y: 40 },
]

/** Decorative, language-free route sketch. Not real geography, on purpose. */
export function RouteIllustration({
  className,
  numbered = false,
  title,
}: {
  className?: string
  numbered?: boolean
  title: string
}) {
  const titleId = useId()

  return (
    <svg
      aria-labelledby={titleId}
      className={className}
      focusable="false"
      role="img"
      viewBox="0 0 480 380"
    >
      <title id={titleId}>{title}</title>
      <rect
        className="fill-surface stroke-border"
        height="378"
        rx="28"
        width="478"
        x="1"
        y="1"
      />
      <g className="fill-none stroke-border" strokeWidth="1.5">
        <path d="M20 90 C 120 60, 200 130, 300 90 S 440 60, 462 110" />
        <path d="M20 130 C 130 100, 210 170, 310 130 S 440 110, 462 150" />
        <path d="M20 170 C 140 140, 220 210, 320 170 S 440 160, 462 190" />
        <path d="M20 300 C 120 280, 200 340, 300 310 S 420 290, 462 320" />
        <path d="M20 340 C 120 320, 220 370, 320 345 S 420 330, 462 355" />
      </g>
      <path
        className="fill-primary/10"
        d="M300 270 C 330 250, 380 255, 400 285 C 415 315, 380 345, 340 340 C 305 335, 280 295, 300 270 Z"
      />
      <path
        className="fill-primary/10"
        d="M40 60 C 70 40, 120 50, 130 80 C 135 105, 95 120, 65 110 C 40 100, 30 75, 40 60 Z"
      />
      <path
        className="fill-none stroke-primary/25"
        d={ROUTE_PATH}
        strokeLinecap="round"
        strokeWidth="9"
      />
      <path
        className="fill-none stroke-primary"
        d={ROUTE_PATH}
        strokeDasharray="2 9"
        strokeLinecap="round"
        strokeWidth="3.5"
      />
      {PINS.map((pin, index) => {
        const labelled = numbered && index < 3
        return (
          <g key={`${String(pin.x)}-${String(pin.y)}`}>
            <circle
              className="fill-accent/20"
              cx={pin.x}
              cy={pin.y}
              r={labelled ? 22 : 17}
            />
            <circle
              className="fill-accent stroke-surface"
              cx={pin.x}
              cy={pin.y}
              r={labelled ? 13 : 8}
              strokeWidth="3"
            />
            {labelled ? (
              <text
                className="fill-white text-[13px] font-semibold"
                dominantBaseline="central"
                textAnchor="middle"
                x={pin.x}
                y={pin.y}
              >
                {index + 1}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
