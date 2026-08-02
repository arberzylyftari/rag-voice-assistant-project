import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/useTheme'

/** Switches between light and dark, behind the wipe transition. */
export function ThemeToggle() {
  const { theme, toggleTheme, isTransitioning } = useTheme()
  const label = theme === 'dark' ? 'Kalo ne temen e ndritshme' : 'Kalo ne temen e erret'

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      disabled={isTransitioning}
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
