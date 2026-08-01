import { useEffect, useState } from 'react'

import { LoaderCircle } from '@/components/animate-ui/icons/loader-circle'
import { MicButton } from '@/components/MicButton'
import { Notice } from '@/components/Notice'
import { QuestionBubble } from '@/components/QuestionBubble'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useTranscription } from '@/hooks/useTranscription'
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
  const { transcript, isTranscribing, error, dismissError } = useTranscription(recording)

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
  const micState = isRecording ? 'recording' : isTranscribing ? 'processing' : 'idle'

  // Recorder problems and transcription failures share one banner; only one
  // can be pending at a time, since a failed recording never gets uploaded.
  const notice = message ?? (error ? { text: error, tone: 'error' as const } : null)
  const dismissNotice = message ? dismissMessage : dismissError

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

      {notice && (
        <Notice text={notice.text} tone={notice.tone} onDismiss={dismissNotice} />
      )}

      <main className="flex flex-1">
        <Card className="flex-1">
          <CardContent className="flex h-full flex-col gap-4">
            {transcript ? (
              <QuestionBubble
                text={transcript.text}
                durationMs={transcript.durationMs}
                audioUrl={transcript.url}
              />
            ) : isTranscribing ? (
              <div
                className="flex flex-1 flex-col items-center justify-center gap-3"
                role="status"
              >
                <LoaderCircle animate loop size={24} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Duke transkriptuar pyetjen…</p>
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
