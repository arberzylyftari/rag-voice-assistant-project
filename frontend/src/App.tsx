import { useEffect, useState } from 'react'
import { MicButton } from './components/MicButton'
import { fetchHealth } from './lib/api'
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
  const [isRecording, setIsRecording] = useState(false)

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

      <main className="app__main">
        <div className="conversation">
          <p className="conversation__title">Ende nuk ka biseda</p>
          <p className="conversation__hint">
            Shtyp butonin e mikrofonit dhe bëj një pyetje, për shembull:{' '}
            <em>„Sa ditë pushimi vjetor kam?”</em>
          </p>
        </div>
      </main>

      <footer className="app__footer">
        <MicButton
          isRecording={isRecording}
          onToggle={() => setIsRecording((recording) => !recording)}
        />
      </footer>
    </div>
  )
}
