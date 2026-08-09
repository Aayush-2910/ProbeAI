/**
 * useVoice — microphone capture, transcription, and spoken replies.
 *
 * Turn-based rather than full-duplex: the candidate records an answer, it is
 * transcribed, the normal interview request runs, and the reply is spoken back.
 * That keeps every backend agent in the loop instead of handing the
 * conversation to a hosted voice agent with its own model.
 *
 * Two things this hook is careful about, because both bite in practice:
 *   - every object URL from speakText() is revoked, or each spoken question
 *     leaks a blob for the lifetime of the page;
 *   - the MediaStream tracks are stopped after recording, or the browser's
 *     recording indicator stays lit and the mic stays hot.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchVoiceStatus, speakText, transcribeAudio } from '../utils/api'

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? ''
}

function extensionFor(mimeType) {
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

export function useVoice() {
  const [available, setAvailable] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState('')

  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const audioRef = useRef(null)
  const urlRef = useRef(null)
  const spokenRef = useRef(new Set())

  // Does the backend actually have a key? If not, the mic never appears —
  // better than a button that fails the moment it is pressed.
  useEffect(() => {
    let active = true
    fetchVoiceStatus().then((status) => {
      if (!active) return
      const ok = Boolean(status?.voice_configured) && typeof MediaRecorder !== 'undefined'
      setAvailable(ok)
    })
    return () => {
      active = false
    }
  }, [])

  const releaseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    setIsSpeaking(false)
  }, [])

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(
    () => () => {
      releaseAudio()
      stopTracks()
    },
    [releaseAudio, stopTracks],
  )

  /** Speak one piece of text. Any currently playing audio is cut off first. */
  const speak = useCallback(
    async (text, { force = false } = {}) => {
      if (!text?.trim()) return
      if (!available && !force) return

      releaseAudio()
      setError('')
      try {
        const url = await speakText(text)
        urlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => releaseAudio()
        audio.onerror = () => releaseAudio()
        setIsSpeaking(true)
        await audio.play()
      } catch (err) {
        releaseAudio()
        setError(err?.message || 'Could not play the reply.')
      }
    },
    [available, releaseAudio],
  )

  const stopSpeaking = useCallback(() => releaseAudio(), [releaseAudio])

  /**
   * Speak a message once and only once. The transcript re-renders on every
   * state change, so without this guard an auto-played question restarts
   * whenever anything else updates.
   */
  const speakOnce = useCallback(
    (id, text) => {
      if (!id || spokenRef.current.has(id)) return
      spokenRef.current.add(id)
      speak(text)
    },
    [speak],
  )

  const startRecording = useCallback(async () => {
    setError('')
    releaseAudio() // never record the interviewer's own voice back in

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream

      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunksRef.current.push(event.data)
      }
      recorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch (err) {
      stopTracks()
      setError(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow access and try again.'
          : 'Could not start recording.',
      )
    }
  }, [releaseAudio, stopTracks])

  /** Stop, upload, transcribe. Resolves to the transcript, or '' if unusable. */
  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false)
      return ''
    }

    const blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      }
      recorder.stop()
    })

    setIsRecording(false)
    stopTracks()
    recorderRef.current = null

    // A tap rather than a hold produces a few hundred bytes of silence, which
    // Scribe bills for and returns nothing useful from.
    if (blob.size < 1200) {
      setError('That recording was too short — hold the button while you speak.')
      return ''
    }

    setIsTranscribing(true)
    try {
      const result = await transcribeAudio(blob, `answer.${extensionFor(blob.type)}`)
      const text = (result?.text || '').trim()
      if (!text) setError('Nothing was picked up. Try again, a little closer to the mic.')
      return text
    } catch (err) {
      setError(err?.message || 'Could not transcribe that recording.')
      return ''
    } finally {
      setIsTranscribing(false)
    }
  }, [stopTracks])

  const toggleVoiceMode = useCallback(() => {
    setVoiceMode((on) => {
      if (on) releaseAudio()
      return !on
    })
  }, [releaseAudio])

  return {
    available,
    voiceMode,
    toggleVoiceMode,
    isRecording,
    isTranscribing,
    isSpeaking,
    error,
    clearError: () => setError(''),
    startRecording,
    stopRecording,
    speak,
    speakOnce,
    stopSpeaking,
  }
}
