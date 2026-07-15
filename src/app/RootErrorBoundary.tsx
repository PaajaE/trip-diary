import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AppErrorFallback } from '@/app/AppErrorFallback'

interface RootErrorBoundaryProps {
  children: ReactNode
}

interface RootErrorBoundaryState {
  error: Error | null
}

export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  override state: RootErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('Unhandled render error', {
        componentStack: info.componentStack,
        message: error.message,
      })
    } else {
      console.error('Unhandled render error', { message: error.message })
    }
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  override render(): ReactNode {
    const { error } = this.state

    if (error !== null) {
      return <AppErrorFallback error={error} onReload={this.handleReload} />
    }

    return this.props.children
  }
}
