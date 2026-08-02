import { useState } from 'react'
import { Trash2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { KnowledgeDocument } from '@/lib/api'

interface DocumentTableProps {
  documents: KnowledgeDocument[]
  onDelete: (document: KnowledgeDocument) => void | Promise<void>
  disabled?: boolean
}

/** The Knowledge Base, with deletion behind a confirmation. */
export function DocumentTable({ documents, onDelete, disabled = false }: DocumentTableProps) {
  const [pending, setPending] = useState<KnowledgeDocument | null>(null)

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">Nuk ka asnje dokument</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Shto nje dokument me siper qe asistenti te kete cfare te pergjigjet.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="overflow-hidden py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dokumenti</TableHead>
                <TableHead className="hidden sm:table-cell">Pronari</TableHead>
                <TableHead className="text-right">Seksione</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((document) => (
                <TableRow key={document.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{document.title}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {document.filename}
                        {document.version && <span>v{document.version}</span>}
                        {/* Stored but not embedded is a real state, and one
                            the panel should not paper over. */}
                        {!document.indexed && (
                          <Badge variant="destructive">Pa indeksuar</Badge>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {document.owner ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {document.chunk_count}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPending(document)}
                      disabled={disabled}
                      aria-label={`Fshij ${document.title}`}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Te fshihet dokumenti?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pending?.title}" do te hiqet nga baza e njohurive. Asistenti nuk do t'u
              pergjigjet me pyetjeve qe mbeshteten te ky dokument. Veprimi nuk kthehet mbrapsht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulo</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) void onDelete(pending)
                setPending(null)
              }}
            >
              Fshij
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
