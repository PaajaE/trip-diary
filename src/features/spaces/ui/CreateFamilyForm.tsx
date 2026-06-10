import { useState, type SyntheticEvent } from 'react'
import {
  normalizeSpaceHandle,
  validateSpaceHandle,
  type CreateFamilyValues,
} from '@/features/spaces/model/spaces'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface CreateFamilyFormProps {
  initialHandle?: string
  onCancel?: () => void
  onCreate: (values: CreateFamilyValues) => Promise<void>
}

export function CreateFamilyForm({
  initialHandle = '',
  onCancel,
  onCreate,
}: CreateFamilyFormProps) {
  const [name, setName] = useState('')
  const [handle, setHandle] = useState(initialHandle)
  const [handleTouched, setHandleTouched] = useState(initialHandle !== '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const normalizedHandle = normalizeSpaceHandle(handle)
  const handleError =
    handleTouched && !validateSpaceHandle(normalizedHandle)
      ? 'Použijte 3 až 40 malých písmen, číslic nebo pomlček.'
      : undefined

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    setHandleTouched(true)
    setError(null)

    if (name.trim().length < 2 || !validateSpaceHandle(normalizedHandle)) {
      return
    }

    setSubmitting(true)
    try {
      await onCreate({ handle: normalizedHandle, name: name.trim() })
    } catch {
      setError('Rodinný prostor se nepodařilo vytvořit. Zkuste to znovu.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
      <Input
        autoComplete="organization"
        label="Název rodiny nebo skupiny"
        minLength={2}
        onChange={(event) => {
          const nextName = event.target.value
          setName(nextName)
          if (!handleTouched) {
            setHandle(normalizeSpaceHandle(nextName))
          }
        }}
        placeholder="Ečerovi"
        required
        value={name}
      />
      <Input
        aria-describedby="family-handle-hint"
        autoCapitalize="none"
        autoComplete="off"
        error={handleError}
        label="Veřejná adresa"
        onChange={(event) => {
          setHandle(event.target.value)
          setHandleTouched(true)
        }}
        placeholder="ecerovi2016"
        required
        value={handle}
      />
      <p className="-mt-4 text-sm text-muted" id="family-handle-hint">
        cestovni-denik.cz/{normalizedHandle || 'vas-handle'}
      </p>
      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onCancel === undefined ? null : (
          <Button
            className="w-full sm:w-auto"
            onClick={onCancel}
            variant="secondary"
          >
            Zrušit
          </Button>
        )}
        <Button
          className="w-full sm:w-auto"
          disabled={submitting}
          type="submit"
        >
          {submitting ? 'Vytvářím…' : 'Vytvořit rodinný prostor'}
        </Button>
      </div>
    </form>
  )
}
