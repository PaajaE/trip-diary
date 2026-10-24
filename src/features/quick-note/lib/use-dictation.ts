import { Capacitor } from '@capacitor/core'
import { useCallback, useEffect, useRef, useState } from 'react'

interface RecognitionAlternative {
  transcript: string
}
interface RecognitionResult {
  [index: number]: RecognitionAlternative | undefined
  readonly isFinal: boolean
  readonly length: number
}
interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>
}
interface RecognitionErrorEvent {
  error: string
}
interface Recognition {
  abort: () => void
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onresult: ((event: RecognitionEvent) => void) | null
  processLocally?: boolean
  start: () => void
  stop: () => void
}
type RecognitionConstructor = new () => Recognition

export type DictationProblem = 'denied' | 'failed'

/**
 * The browser's speech recognizer, or null. Audio must never leave the device
 * (plan v2, decision 4): on native iOS the recognizer is Apple's; on the web it
 * is accepted only when it can be forced to run locally (`processLocally`).
 */
export function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const host = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  const ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition
  if (ctor === undefined) return null
  if (Capacitor.isNativePlatform()) return ctor
  return 'processLocally' in ctor.prototype ? ctor : null
}

export function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Joins the text before dictation with what was recognised since. */
export function joinDictated(base: string, spoken: string): string {
  const addition = spoken.trim()
  if (addition === '') return base
  if (base === '' || /\s$/.test(base)) return base + addition
  return `${base} ${addition}`
}

/**
 * On-device dictation. `onText` receives the whole text (the text at the start
 * of dictation plus interim and final speech) on every recognizer update.
 */
export function useDictation({
  getBase,
  lang,
  onText,
}: {
  getBase: () => string
  lang: string
  onText: (text: string) => void
}) {
  const [supported] = useState(() => getRecognitionConstructor() !== null)
  const [listening, setListening] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [problem, setProblem] = useState<DictationProblem | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const baseRef = useRef('')
  const onTextRef = useRef(onText)
  const getBaseRef = useRef(getBase)
  useEffect(() => {
    onTextRef.current = onText
    getBaseRef.current = getBase
  })

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (recognitionRef.current !== null) return
    const Ctor = getRecognitionConstructor()
    if (Ctor === null) return
    setProblem(null)
    setSeconds(0)
    try {
      const recognition = new Ctor()
      recognition.lang = lang
      recognition.continuous = true
      recognition.interimResults = true
      if ('processLocally' in recognition) recognition.processLocally = true
      baseRef.current = getBaseRef.current()
      recognition.onresult = (event) => {
        let spoken = ''
        for (const result of Array.from(event.results)) {
          spoken += result[0]?.transcript ?? ''
        }
        onTextRef.current(joinDictated(baseRef.current, spoken))
      }
      recognition.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return
        setProblem(
          event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? 'denied'
            : 'failed',
        )
      }
      recognition.onend = () => {
        recognitionRef.current = null
        setListening(false)
      }
      recognitionRef.current = recognition
      setListening(true)
      recognition.start()
    } catch {
      recognitionRef.current = null
      setListening(false)
      setProblem('failed')
    }
  }, [lang])

  useEffect(() => {
    if (!listening) return
    const timer = setInterval(() => {
      setSeconds((value) => value + 1)
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [listening])

  // Never keep the microphone open after leaving the page.
  useEffect(
    () => () => {
      const recognition = recognitionRef.current
      if (recognition === null) return
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.abort()
      recognitionRef.current = null
    },
    [],
  )

  return { listening, problem, seconds, start, stop, supported }
}
