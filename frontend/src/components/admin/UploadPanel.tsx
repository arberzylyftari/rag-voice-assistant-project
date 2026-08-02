import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'

import { LoaderCircle } from '@/components/animate-ui/icons/loader-circle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const ACCEPTED = '.pdf,.docx,.txt,.md'

interface UploadPanelProps {
  onUpload: (file: File) => void | Promise<void>
  disabled?: boolean
}

/** Drop zone and file picker for adding a document. */
export function UploadPanel({ onUpload, disabled = false }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const accept = (files: FileList | null) => {
    const file = files?.[0]
    if (file && !disabled) void onUpload(file)
  }

  return (
    <Card
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        accept(event.dataTransfer.files)
      }}
      className={`border-dashed transition-colors ${dragging ? 'border-primary bg-accent' : ''}`}
    >
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        {disabled ? (
          <LoaderCircle animate loop size={24} className="text-muted-foreground" />
        ) : (
          <Upload className="size-6 text-muted-foreground" />
        )}

        <div>
          <p className="font-medium">
            {disabled ? 'Duke perpunuar dokumentin…' : 'Shto nje dokument'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Terhiqe ketu ose zgjidhe nga kompjuteri — PDF, DOCX, TXT ose MD, deri ne 10 MB
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(event) => {
            accept(event.target.files)
            // Cleared so re-picking the same file fires change again.
            event.target.value = ''
          }}
        />

        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={disabled}>
          Zgjidh skedarin
        </Button>
      </CardContent>
    </Card>
  )
}
