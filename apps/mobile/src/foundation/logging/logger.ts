export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
}

function formatMessage(
  level: LogLevel,
  message: string,
  context?: LogContext,
): string {
  const payload =
    context === undefined ? message : `${message} ${JSON.stringify(context)}`
  return `[${level.toUpperCase()}] ${payload}`
}

/** Console-backed logger. Native crash reporting is not wired yet. */
export function createConsoleLogger(scope = 'mobile'): Logger {
  const prefix = scope.length > 0 ? `${scope}:` : ''

  return {
    debug(message, context) {
      console.debug(formatMessage('debug', `${prefix}${message}`, context))
    },
    info(message, context) {
      console.info(formatMessage('info', `${prefix}${message}`, context))
    },
    warn(message, context) {
      console.warn(formatMessage('warn', `${prefix}${message}`, context))
    },
    error(message, context) {
      console.error(formatMessage('error', `${prefix}${message}`, context))
    },
  }
}

export const logger = createConsoleLogger('trip-diary')
