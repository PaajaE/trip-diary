import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createConsoleLogger } from './logger'

describe('createConsoleLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('logs structured messages at each level', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const logger = createConsoleLogger('test')

    logger.debug('debug message', { id: 1 })
    logger.info('info message')
    logger.warn('warn message')
    logger.error('error message', { reason: 'boom' })

    expect(debug).toHaveBeenCalledWith('[DEBUG] test:debug message {"id":1}')
    expect(info).toHaveBeenCalledWith('[INFO] test:info message')
    expect(warn).toHaveBeenCalledWith('[WARN] test:warn message')
    expect(error).toHaveBeenCalledWith(
      '[ERROR] test:error message {"reason":"boom"}',
    )
  })
})
