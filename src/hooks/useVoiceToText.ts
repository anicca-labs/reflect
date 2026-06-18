import { useEffect, useRef, useState, useCallback } from 'react'
import { NativeModules } from 'react-native'
import Voice, { type SpeechResultsEvent, type SpeechErrorEvent } from '@react-native-voice/voice'

type VoiceState = 'idle' | 'listening' | 'error'

type UseVoiceToTextOptions = {
  onResult: (transcript: string) => void
  onError?: (error: string) => void
}

const RETRY_DELAY_MS = 600
const NOT_AVAILABLE_MESSAGE = 'Speech recognition is not available now'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const getLocale = (): string => {
  const deviceLocale =
    NativeModules.SettingsManager?.settings?.AppleLocale ??
    NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ??
    'en-US'
  return deviceLocale.replace('_', '-')
}

const useVoiceToText = ({ onResult, onError }: UseVoiceToTextOptions) => {
  const [state, setState] = useState<VoiceState>('idle')
  const onResultRef = useRef(onResult)
  const onErrorRef = useRef(onError)
  const retryRef = useRef(false)

  useEffect(() => { onResultRef.current = onResult }, [onResult])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  useEffect(() => {
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const transcript = e.value?.[0]
      if (transcript) onResultRef.current(transcript)
      setState('idle')
    }
    Voice.onSpeechError = async (e: SpeechErrorEvent) => {
      const message = e.error?.message ?? 'Speech recognition failed'
      // iOS fires "not available now" right after first permission grant while the
      // speech framework is still initialising — retry once after a short delay.
      if (message === NOT_AVAILABLE_MESSAGE && !retryRef.current) {
        retryRef.current = true
        await sleep(RETRY_DELAY_MS)
        try {
          await Voice.start(getLocale())
          setState('listening')
        } catch {
          retryRef.current = false
          onErrorRef.current?.(message)
          setState('error')
        }
        return
      }
      retryRef.current = false
      onErrorRef.current?.(message)
      setState('error')
    }
    Voice.onSpeechEnd = () => setState('idle')

    return () => {
      Voice.destroy().then(() => Voice.removeAllListeners())
    }
  }, [])

  const start = useCallback(async () => {
    retryRef.current = false
    try {
      await Voice.start(getLocale())
      setState('listening')
    } catch {
      setState('error')
    }
  }, [])

  const stop = useCallback(async () => {
    try {
      await Voice.stop()
    } catch {
      setState('idle')
    }
  }, [])

  const isListening = state === 'listening'

  return { isListening, start, stop }
}

export { useVoiceToText }
