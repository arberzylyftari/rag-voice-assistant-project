import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'

import { Conversation } from '@/components/Conversation'
import { MicButton } from '@/components/MicButton'
import { Notice } from '@/components/Notice'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useConversation } from '@/hooks/useConversation'
import { fetchHealth } from '@/lib/api'
import { formatDuration } from '@/lib/format'

type ConnectionState = 'checking' | 'online' | 'offline'

/** Albanian status text shown next to the connection indicator. */
const CONNECTION_LABELS: Record<ConnectionState, string> = {
  checking: 'Duke u lidhur me serverin…',
  online: 'Lidhur me serverin',
  offline: 'Serveri nuk pergjigjet',
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
  const { exchanges, isBusy, reset } = useConversation(recording)

  useEffect(() => {
    const controller = new AbortController()

    fetchHealth(controller.signal)
      .then(() => setConnection('online'))
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return
        setConnection('offline')
      })

    return () => controller.abort()
  }, [])

  const isRecording = status === 'recording'
  const micState = isRecording ? 'recording' : isBusy ? 'processing' : 'idle'

  return (
    <div className="mx-auto flex h-svh max-w-3xl flex-col gap-6 px-5 pt-6 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Asistenti Zanor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pyet me ze per politikat dhe procedurat e brendshme te kompanise
          </p>
        </div>
        <div className="flex items-center gap-2">
          {exchanges.length > 0 && (
            <Button variant="ghost" size="sm" onClick={reset} disabled={isBusy}>
              <RotateCcw />
              Bisede e re
            </Button>
          )}
          <Badge variant="outline" className="gap-2 py-1.5">
            <span
              className={`size-2 rounded-full ${DOT_COLOURS[connection]}`}
              aria-hidden="true"
            />
            {CONNECTION_LABELS[connection]}
          </Badge>
        </div>
      </header>

      {message && (
        <Notice text={message.text} tone={message.tone} onDismiss={dismissMessage} />
      )}

      <main className="flex min-h-0 flex-1">
        <Card className="flex-1 overflow-hidden">
          <CardContent className="flex h-full flex-col">
            <Conversation exchanges={exchanges} />
          </CardContent>
        </Card>
      </main>

      <footer className="flex flex-col items-center gap-2">
        <MicButton state={micState} onToggle={toggle} />
        {isRecording && (
          <p className="font-mono text-sm text-muted-foreground" role="timer">
            {formatDuration(elapsedMs)} / {formatDuration(maxDurationMs)}
          </p>
        )}
      </footer>
    </div>
  )
}
