import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { useAuth } from '@/lib/auth/store'

// By default tests run as if sign-in is not required (the app is open); auth tests set their own state.
beforeEach(() => useAuth.setState({ loaded: true, required: false, user: null, isAdmin: false, error: null, busy: false }))

afterEach(() => {
  cleanup()
  if (typeof localStorage !== 'undefined') localStorage.clear()
})
