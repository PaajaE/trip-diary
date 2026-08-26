import { Play } from 'lucide-react'

export function VideoPlayOverlay() {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="rounded-full bg-black/45 p-1.5 text-white shadow-sm">
        <Play aria-hidden className="ml-0.5" fill="currentColor" size={18} />
      </span>
    </span>
  )
}
