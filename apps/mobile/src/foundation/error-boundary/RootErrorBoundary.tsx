import { Component, type ErrorInfo, type ReactNode } from 'react'
import { en } from '@trip-diary/i18n'
import { logger } from '@/foundation/logging'
import { ErrorFallback } from './ErrorFallback'

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
  state: RootErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('Unhandled render error', {
      componentStack: info.componentStack,
      message: error.message,
    })
  }

  private handleRetry = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state

    if (error !== null) {
      return (
        <ErrorFallback
          error={error}
          onRetry={this.handleRetry}
          retryLabel={en.app.errorBoundary.reload}
          title={en.app.errorBoundary.title}
        />
      )
    }

    return this.props.children
  }
}
