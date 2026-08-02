import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, KeyRound, LogOut } from 'lucide-react'

import { ThemeToggle } from '@/components/ThemeToggle'

import { LoaderCircle } from '@/components/animate-ui/icons/loader-circle'
import { DocumentTable } from '@/components/admin/DocumentTable'
import { UploadPanel } from '@/components/admin/UploadPanel'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminToken } from '@/hooks/useAdminToken'
import { ApiError, deleteDocument, listDocuments, uploadDocument } from '@/lib/api'
import type { KnowledgeDocument } from '@/lib/api'

type Notification = { text: string; tone: 'error' | 'info' } | null

function describe(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback
}

/** Document management, deliberately kept off the conversation page. */
export default function AdminPage() {
  const { token, save, clear } = useAdminToken()
  const [draftToken, setDraftToken] = useState('')
  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(null)
  const [notice, setNotice] = useState<Notification>(null)
  const [busy, setBusy] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (!token) return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    try {
      setDocuments(await listDocuments(token, controller.signal))
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return
      setDocuments([])
      setNotice({ text: describe(cause, 'Lista e dokumenteve nuk u mor.'), tone: 'error' })
      // A rejected token is worth clearing, so the form comes back rather
      // than leaving the page stuck on an error it cannot recover from.
      if (cause instanceof ApiError && cause.status === 401) clear()
    }
  }, [token, clear])

  useEffect(() => {
    void refresh()
    return () => controllerRef.current?.abort()
  }, [refresh])

  const handleUpload = useCallback(
    async (file: File) => {
      setBusy(true)
      setNotice(null)

      try {
        const document = await uploadDocument(token, file)
        setNotice({
          text: `"${document.title}" u shtua me ${document.chunk_count} seksione dhe eshte gati per pyetje.`,
          tone: 'info',
        })
        await refresh()
      } catch (cause) {
        setNotice({ text: describe(cause, 'Ngarkimi deshtoi.'), tone: 'error' })
      } finally {
        setBusy(false)
      }
    },
    [token, refresh],
  )

  const handleDelete = useCallback(
    async (document: KnowledgeDocument) => {
      setBusy(true)
      setNotice(null)

      try {
        await deleteDocument(token, document.id)
        setNotice({ text: `"${document.title}" u fshi.`, tone: 'info' })
        await refresh()
      } catch (cause) {
        setNotice({ text: describe(cause, 'Fshirja deshtoi.'), tone: 'error' })
      } finally {
        setBusy(false)
      }
    },
    [token, refresh],
  )

  if (!token) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paneli i administrimit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vendos token-in e administrimit per te vazhduar.
          </p>
        </div>

        {notice && (
          <Notice text={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />
        )}

        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-token">Token</Label>
              <Input
                id="admin-token"
                type="password"
                autoComplete="off"
                value={draftToken}
                onChange={(event) => setDraftToken(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && draftToken.trim()) save(draftToken)
                }}
                placeholder="X-Admin-Token"
              />
            </div>
            <Button onClick={() => save(draftToken)} disabled={!draftToken.trim()}>
              <KeyRound />
              Hyr
            </Button>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft />
            Kthehu te biseda
          </Link>
        </Button>
        <ThemeToggle />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[1600px] flex-col gap-6 px-6 pt-6 pb-8 sm:px-10 lg:px-16">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paneli i administrimit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dokumentet qe perdor asistenti per t'iu pergjigjur pyetjeve
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft />
              Biseda
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={clear}>
            <LogOut />
            Dil
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {notice && (
        <Notice text={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />
      )}

      <UploadPanel onUpload={handleUpload} disabled={busy} />

      {documents === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle animate loop size={16} />
          Duke ngarkuar dokumentet…
        </p>
      ) : (
        <DocumentTable documents={documents} onDelete={handleDelete} disabled={busy} />
      )}
    </div>
  )
}
