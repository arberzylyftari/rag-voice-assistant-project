import { Link } from 'react-router-dom'
import { RotateCcw, Settings } from 'lucide-react'

import { Conversation } from '@/components/Conversation'
import { MicButton } from '@/components/MicButton'
import { Notice } from '@/components/Notice'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useConversation } from '@/hooks/useConversation'
import { formatDuration } from '@/lib/format'

export default function ChatPage() {
  const { status, message, elapsedMs, recording, toggle, dismissMessage, maxDurationMs } =
    useAudioRecorder()
  const { exchanges, isBusy, startNew } = useConversation(recording)

  const isRecording = status === 'recording'
  const micState = isRecording ? 'recording' : isBusy ? 'processing' : 'idle'

  return (
    <div className="mx-auto flex h-svh w-full max-w-[1600px] flex-col gap-6 px-6 pt-6 pb-8 sm:px-10 lg:px-16">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Asistenti Zanor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pyet me ze per politikat dhe procedurat e brendshme te kompanise
          </p>
        </div>
        <div className="flex items-center gap-2">
          {exchanges.length > 0 && (
            <Button variant="ghost" size="sm" onClick={startNew} disabled={isBusy}>
              <RotateCcw />
              Bisede e re
            </Button>
          )}
          <ThemeToggle />
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/admin" aria-label="Paneli i administrimit">
              <Settings />
            </Link>
          </Button>
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
