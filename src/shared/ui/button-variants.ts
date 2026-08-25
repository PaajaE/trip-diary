import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
        secondary:
          'border border-border/80 bg-surface text-foreground hover:bg-white active:bg-background',
        ghost: 'text-foreground hover:bg-surface/80 hover:text-foreground',
        destructive:
          'text-destructive hover:bg-destructive/10 active:bg-destructive/15',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
)
