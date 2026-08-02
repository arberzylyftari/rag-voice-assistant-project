import { useState } from 'react'
import { MessageSquare, Plus, Trash2 } from 'lucide-react'

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
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { StoredConversation } from '@/lib/conversations'

interface ConversationSidebarProps {
  conversations: StoredConversation[]
  activeId: string
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onStartNew: () => void
  disabled?: boolean
}

const DAY_MS = 86_400_000

/**
 * Bucket a conversation by how long ago it was last used.
 *
 * Grouping by recency rather than showing a date on every row keeps the list
 * readable when a demo produces several conversations in one sitting, where
 * every date would be the same.
 */
function groupOf(updatedAt: number): string {
  const startOfToday = new Date().setHours(0, 0, 0, 0)

  if (updatedAt >= startOfToday) return 'Sot'
  if (updatedAt >= startOfToday - DAY_MS) return 'Dje'
  if (updatedAt >= startOfToday - 7 * DAY_MS) return '7 ditet e fundit'
  return 'Me pare'
}

function groupConversations(
  conversations: StoredConversation[],
): [string, StoredConversation[]][] {
  const groups = new Map<string, StoredConversation[]>()

  // `conversations` arrives newest first, so both the groups and the rows
  // inside them come out in that order without sorting again.
  for (const conversation of conversations) {
    const label = groupOf(conversation.updatedAt)
    const existing = groups.get(label)

    if (existing) {
      existing.push(conversation)
    } else {
      groups.set(label, [conversation])
    }
  }

  return [...groups]
}

/** The saved conversations, newest first, with the open one marked. */
export function ConversationSidebar({
  conversations,
  activeId,
  onOpen,
  onDelete,
  onStartNew,
  disabled = false,
}: ConversationSidebarProps) {
  const [pending, setPending] = useState<StoredConversation | null>(null)

  return (
    <>
      <Sidebar>
        <SidebarHeader className="gap-2 p-3">
          <p className="px-1 text-sm font-semibold">Bisedat</p>
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={onStartNew}
            disabled={disabled}
          >
            <Plus />
            Bisede e re
          </Button>
        </SidebarHeader>

        <SidebarContent>
          {conversations.length === 0 ? (
            <p className="px-4 py-2 text-sm text-muted-foreground">
              Bisedat e ruajtura shfaqen ketu.
            </p>
          ) : (
            groupConversations(conversations).map(([label, group]) => (
              <SidebarGroup key={label}>
                <SidebarGroupLabel>{label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.map((conversation) => (
                      <SidebarMenuItem key={conversation.id}>
                        <SidebarMenuButton
                          isActive={conversation.id === activeId}
                          onClick={() => onOpen(conversation.id)}
                          disabled={disabled}
                          tooltip={conversation.title}
                        >
                          <MessageSquare />
                          <span className="truncate">{conversation.title}</span>
                        </SidebarMenuButton>
                        <SidebarMenuAction
                          showOnHover
                          onClick={() => setPending(conversation)}
                          aria-label={`Fshij biseden "${conversation.title}"`}
                        >
                          <Trash2 />
                        </SidebarMenuAction>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))
          )}
        </SidebarContent>
      </Sidebar>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Te fshihet biseda?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pending?.title}" do te hiqet nga ky shfletues. Veprimi nuk kthehet mbrapsht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulo</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onDelete(pending.id)
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
