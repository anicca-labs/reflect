import { useEffect, useRef, useState, useCallback } from 'react'
import Voice, { type SpeechResultsEvent, type SpeechErrorEvent } from '@react-native-voice/voice'

type VoiceState = 'idle' | 'listening' | 'error'

type UseVoiceToTextOptions = {
  onResult: (transcript: string) => void
  onError?: (error: string) => void
}

const useVoiceToText = ({ onResult, onError }: UseVoiceToTextOptions) => {
  const [state, setState] = useState<VoiceState>('idle')
  const onResultRef = useRef(onResult)
  const onErrorRef = useRef(onError)

  useEffect(() => { onResultRef.current = onResult }, [onResult])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  useEffect(() => {
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const transcript = e.value?.[0]
      if (transcript) onResultRef.current(transcript)
      setState('idle')
    }
    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      const message = e.error?.message ?? 'Speech recognition failed'
      onErrorRef.current?.(message)
      setState('error')
    }
    Voice.onSpeechEnd = () => setState('idle')

    return () => {
      Voice.destroy().then(() => Voice.removeAllListeners())
    }
  }, [])

  const start = useCallback(async () => {
    try {
      await Voice.start('en-US')
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
