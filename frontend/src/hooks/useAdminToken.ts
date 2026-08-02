import { useCallback, useState } from 'react'

const STORAGE_KEY = 'admin-token'

/**
 * Holds the admin token for the tab's lifetime.
 *
 * sessionStorage rather than localStorage: the token is a shared secret, and
 * closing the tab should end access rather than leaving it on disk for the
 * next person at the machine.
 */
export function useAdminToken() {
  const [token, setToken] = useState<string>(
    () => sessionStorage.getItem(STORAGE_KEY) ?? '',
  )

  const save = useCallback((value: string) => {
    const trimmed = value.trim()
    sessionStorage.setItem(STORAGE_KEY, trimmed)
    setToken(trimmed)
  }, [])

  const clear = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY)
    setToken('')
  }, [])

  return { token, save, clear }
}
