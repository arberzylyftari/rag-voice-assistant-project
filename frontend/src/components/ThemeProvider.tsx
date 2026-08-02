import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { animate } from 'motion'

import {
  applyTheme,
  prefersReducedMotion,
  resolveInitialTheme,
  storeTheme,
} from '@/lib/theme'
import type { Theme } from '@/lib/theme'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  /** True while the wipe is running; the toggle disables itself on it. */
  isTransitioning: boolean
}

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Half the wipe: cover, then uncover. Total lands inside 600–900ms. */
const PHASE_MS = 380

/** Slight ease-out on the way in, ease-in on the way out, so it reads as one sweep. */
const COVER_EASE = [0.32, 0.72, 0, 1] as const
const REVEAL_EASE = [0.65, 0, 0.35, 1] as const

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The inline script in index.html has already applied a theme by the time
  // React mounts, so reading it back here cannot flash the wrong one.
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme())
  const [isTransitioning, setIsTransitioning] = useState(false)

  const overlayRef = useRef<HTMLDivElement>(null)
  const runningRef = useRef(false)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    // A second click mid-sweep would leave the overlay stranded on screen.
    if (runningRef.current) return

    const next: Theme = theme === 'dark' ? 'light' : 'dark'

    const commit = () => {
      setTheme(next)
      storeTheme(next)
    }

    const overlay = overlayRef.current

    if (!overlay || prefersReducedMotion()) {
      commit()
      return
    }

    runningRef.current = true
    setIsTransitioning(true)

    // Going dark sweeps left to right behind a black panel; coming back to
    // light sweeps the other way behind a white one, so the two directions
    // read as undo rather than repetition.
    const goingDark = next === 'dark'
    const from = goingDark ? '-100%' : '100%'
    const to = goingDark ? '100%' : '-100%'

    overlay.style.background = goingDark ? '#000' : '#fff'
    overlay.style.visibility = 'visible'

    void (async () => {
      try {
        await animate(
          overlay,
          { transform: [`translateX(${from})`, 'translateX(0%)'] },
          { duration: PHASE_MS / 1000, ease: COVER_EASE },
        ).finished

        // Swapped only once the panel covers everything, so the change itself
        // is never visible.
        commit()

        await animate(
          overlay,
          { transform: ['translateX(0%)', `translateX(${to})`] },
          { duration: PHASE_MS / 1000, ease: REVEAL_EASE },
        ).finished
      } finally {
        overlay.style.visibility = 'hidden'
        runningRef.current = false
        setIsTransitioning(false)
      }
    })()
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isTransitioning }}>
      {children}
      <div
        ref={overlayRef}
        aria-hidden="true"
        // pointer-events-none at all times: the panel is decoration and must
        // never intercept a click, including the frame it is fading out on.
        className="pointer-events-none fixed inset-0 z-[9999]"
        style={{ visibility: 'hidden', transform: 'translateX(-100%)' }}
      />
    </ThemeContext.Provider>
  )
}
