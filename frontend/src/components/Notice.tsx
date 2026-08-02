import { AlertCircle, Info, X } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface NoticeProps {
  text: string
  tone: 'error' | 'info'
  onDismiss: () => void
}

/** Inline banner for recoverable problems and status notes. */
export function Notice({ text, tone, onDismiss }: NoticeProps) {
  const isError = tone === 'error'
  const Icon = isError ? AlertCircle : Info

  return (
    <Alert
      variant={isError ? 'destructive' : 'default'}
      // Errors interrupt a screen reader; informational notes do not.
      role={isError ? 'alert' : 'status'}
      className="flex items-start gap-3"
    >
      <Icon className="size-4 shrink-0" />
      <AlertDescription className="flex-1">{text}</AlertDescription>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onDismiss}
        aria-label="Mbyll njoftimin"
        className="-my-1 shrink-0"
      >
        <X />
      </Button>
    </Alert>
  )
}
