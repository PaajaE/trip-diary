import { ArrowRight, BookOpen } from 'lucide-react'
import type { PublicEntryViewModel } from '@/pages/public-space/model'

interface PublicEntryCardProps {
  entry: PublicEntryViewModel
  onOpen: (entryId: string) => void
}

export function PublicEntryCard({ entry, onOpen }: PublicEntryCardProps) {
  return (
    <button
      className="group flex w-full gap-4 rounded-md bg-surface p-4 text-left shadow-soft transition-colors hover:bg-white sm:p-5"
      onClick={() => {
        onOpen(entry.id)
      }}
      type="button"
    >
      {entry.imageUrl === undefined || entry.imageUrl === null ? (
        <span className="flex size-20 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary sm:size-24">
          <BookOpen aria-hidden="true" size={24} />
        </span>
      ) : (
        <img
          alt=""
          className="size-20 shrink-0 rounded-sm object-cover sm:size-24"
          loading="lazy"
          src={entry.imageUrl}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-wide text-accent">
          <span>{entry.typeLabel}</span>
          <span className="text-muted">{entry.dateLabel}</span>
        </span>
        <span className="mt-2 block text-lg font-semibold">{entry.title}</span>
        {entry.excerpt === undefined ||
        entry.excerpt === null ||
        entry.excerpt === '' ? null : (
          <span className="mt-2 line-clamp-2 block text-sm leading-6 text-muted">
            {entry.excerpt}
          </span>
        )}
        <span className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary">
          Otevřít
          <ArrowRight
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-1"
            size={15}
          />
        </span>
      </span>
    </button>
  )
}
