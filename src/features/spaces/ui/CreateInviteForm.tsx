import { Check, Copy, Link as LinkIcon } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import type { CreateInviteValues } from '@/features/spaces/model/spaces'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface CreateInviteFormProps {
  onCopyInviteLink: (link: string) => Promise<void> | void
  onCreateInvite: (values: CreateInviteValues) => Promise<string>
}

export function CreateInviteForm({
  onCopyInviteLink,
  onCreateInvite,
}: CreateInviteFormProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<CreateInviteValues['role']>('member')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setInviteLink(null)
    setCopied(false)
    setError(null)

    try {
      setInviteLink(await onCreateInvite({ email: email.trim(), role }))
    } catch {
      setError('Pozvánku se nepodařilo vytvořit. Zkuste to znovu.')
    } finally {
      setSubmitting(false)
    }
  }

  async function copyInviteLink() {
    if (inviteLink === null) {
      return
    }
    await onCopyInviteLink(inviteLink)
    setCopied(true)
  }

  return (
    <div className="space-y-5">
      <form
        className="grid gap-5 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <Input
          autoComplete="email"
          label="E-mail člena"
          onChange={(event) => {
            setEmail(event.target.value)
          }}
          placeholder="rodina@example.cz"
          required
          type="email"
          value={email}
        />
        <label className="block text-sm font-medium">
          Role
          <select
            className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base font-normal"
            onChange={(event) => {
              setRole(event.target.value as CreateInviteValues['role'])
            }}
            value={role}
          >
            <option value="member">Člen</option>
            <option value="editor">Editor</option>
          </select>
        </label>
        <Button className="w-full" disabled={submitting} type="submit">
          <LinkIcon aria-hidden="true" size={17} />
          {submitting ? 'Vytvářím…' : 'Vytvořit pozvánku'}
        </Button>
      </form>

      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {inviteLink === null ? null : (
        <div
          aria-live="polite"
          className="rounded-md border border-border bg-background p-4"
        >
          <p className="text-sm font-semibold">Pozvánka je připravená</p>
          <p className="mt-2 break-all text-sm text-muted">{inviteLink}</p>
          <Button
            className="mt-4 w-full sm:w-auto"
            onClick={() => void copyInviteLink()}
            variant="secondary"
          >
            {copied ? (
              <Check aria-hidden="true" size={17} />
            ) : (
              <Copy aria-hidden="true" size={17} />
            )}
            {copied ? 'Odkaz zkopírován' : 'Kopírovat odkaz'}
          </Button>
        </div>
      )}
    </div>
  )
}
