import { useEffect, useState } from 'react'

import { MicButton } from '@/components/MicButton'
import { Notice } from '@/components/Notice'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { fetchHealth } from '@/lib/api'
import { formatDuration } from '@/lib/format'

type ConnectionState = 'checking' | 'online' | 'offline'

/** Albanian status text shown next to the connection indicator. */
const CONNECTION_LABELS: Record<ConnectionState, string> = {
  checking: 'Duke u lidhur me serverin…',
  online: 'Lidhur me serverin',
  offline: 'Serveri nuk përgjigjet',
}

const DOT_COLOURS: Record<ConnectionState, string> = {
  checking: 'bg-muted-foreground',
  online: 'bg-emerald-500',
  offline: 'bg-destructive',
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
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 px-5 pt-6 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Asistenti Zanor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pyet me zë për politikat dhe procedurat e brendshme të kompanisë
          </p>
        </div>
        <Badge variant="outline" className="gap-2 py-1.5">
          <span
            className={`size-2 rounded-full ${DOT_COLOURS[connection]}`}
            aria-hidden="true"
          />
          {CONNECTION_LABELS[connection]}
        </Badge>
      </header>

      {message && (
        <Notice text={message.text} tone={message.tone} onDismiss={dismissMessage} />
      )}

      <main className="flex flex-1">
        <Card className="flex-1">
          <CardContent className="flex h-full flex-col">
            {recording ? (
              <div className="ml-auto flex flex-col items-end gap-2">
                <p className="text-sm text-muted-foreground">
                  Pyetja juaj · {formatDuration(recording.durationMs)}
                </p>
                <audio className="h-9 w-[min(22rem,100%)]" src={recording.url} controls />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <p className="font-medium">Ende nuk ka biseda</p>
                <p className="max-w-lg text-sm text-muted-foreground">
                  Shtyp butonin e mikrofonit dhe bëj një pyetje, për shembull:{' '}
                  <em>„Sa ditë pushimi vjetor kam?”</em>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="flex flex-col items-center gap-2">
        <MicButton state={isRecording ? 'recording' : 'idle'} onToggle={toggle} />
        {isRecording && (
          <p className="font-mono text-sm text-muted-foreground" role="timer">
            {formatDuration(elapsedMs)} / {formatDuration(maxDurationMs)}
          </p>
        )}
      </footer>
    </div>
  )
}
