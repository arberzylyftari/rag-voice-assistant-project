import { useEffect, useState } from 'react'
import { MicButton } from './components/MicButton'
import { Notice } from './components/Notice'
import { useAudioRecorder } from './hooks/useAudioRecorder'
import { fetchHealth } from './lib/api'
import { formatDuration } from './lib/format'
import './App.css'

type ConnectionState = 'checking' | 'online' | 'offline'

/** Albanian status text shown next to the connection indicator. */
const CONNECTION_LABELS: Record<ConnectionState, string> = {
  checking: 'Duke u lidhur me serverin…',
  online: 'Lidhur me serverin',
  offline: 'Serveri nuk përgjigjet',
}

export default function App() {
  const [connection, setConnection] = useState<ConnectionState>('checking')
  const { status, message, elapsedMs, recording, toggle, dismissMessage, maxDurationMs } =
    useAudioRecorder()

  useEffect(() => {
    const controller = new AbortController()

    fetchHealth(controller.signal)
      .then(() => setConnection('online'))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        setConnection('offline')
      })

    return () => controller.abort()
  }, [])

  const isRecording = status === 'recording'

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">Asistenti Zanor</h1>
          <p className="app__subtitle">
            Pyet me zë për politikat dhe procedurat e brendshme të kompanisë
          </p>
        </div>
        <div className={`status status--${connection}`}>
          <span className="status__dot" aria-hidden="true" />
          <span>{CONNECTION_LABELS[connection]}</span>
        </div>
      </header>

      {message && (
        <Notice text={message.text} tone={message.tone} onDismiss={dismissMessage} />
      )}

      <main className="app__main">
        {recording ? (
          <div className="conversation">
            <div className="recording">
              <p className="recording__label">
                Pyetja juaj · {formatDuration(recording.durationMs)}
              </p>
              <audio className="recording__player" src={recording.url} controls />
            </div>
          </div>
        ) : (
          <div className="conversation conversation--empty">
            <p className="conversation__title">Ende nuk ka biseda</p>
            <p className="conversation__hint">
              Shtyp butonin e mikrofonit dhe bëj një pyetje, për shembull:{' '}
              <em>„Sa ditë pushimi vjetor kam?”</em>
            </p>
          </div>
        )}
      </main>

      <footer className="app__footer">
        <MicButton isRecording={isRecording} onToggle={toggle} />
        {isRecording && (
          <p className="app__timer" role="timer">
            {formatDuration(elapsedMs)} / {formatDuration(maxDurationMs)}
          </p>
        )}
      </footer>
    </div>
  )
}
