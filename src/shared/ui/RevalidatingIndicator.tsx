interface RevalidatingIndicatorProps {
  label: string
  visible: boolean
}

export function RevalidatingIndicator({
  label,
  visible,
}: RevalidatingIndicatorProps) {
  if (!visible) {
    return null
  }

  return (
    <p className="text-xs font-medium text-muted" role="status">
      {label}
    </p>
  )
}
