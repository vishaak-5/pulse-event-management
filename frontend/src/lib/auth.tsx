import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, clearApiCache, getToken, setToken, UNAUTHORIZED_EVENT } from './api'
import type { Role, User } from './types'

interface AuthState {
  user: User | null
  /** True until the stored token has been checked on first load. */
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (name: string, email: string, password: string, role: Role) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => getToken() !== null)

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    clearApiCache()
  }, [])

  useEffect(() => {
    if (!getToken()) return
    api.me().then(setUser).catch(logout).finally(() => setLoading(false))
  }, [logout])

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout)
  }, [logout])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password)
    setToken(res.token)
    setUser(res.user)
    return res.user
  }, [])

  const register = useCallback(async (name: string, email: string, password: string, role: Role) => {
    const res = await api.register(name, email, password, role)
    setToken(res.token)
    setUser(res.user)
    return res.user
  }, [])

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// eslint-disable-next-line react-refresh/only-export-components
export function homeFor(role: Role): string {
  return role === 'ADMIN' ? '/admin' : role === 'ORGANIZER' ? '/organizer' : '/tickets'
}
