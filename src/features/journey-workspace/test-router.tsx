import type { ComponentProps } from 'react'

/** Router `Link` stand-in for tests without a router: a plain anchor. */
export function MockLink({
  children,
  params = {},
  to,
  ...rest
}: ComponentProps<'a'> & { params?: Record<string, string>; to: string }) {
  const href = Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`$${key}`, value),
    to,
  )
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}
