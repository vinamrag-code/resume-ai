export interface SignUpValues {
  name: string
  email: string
  password: string
  confirm: string
}
export type FieldErrors<T> = Partial<Record<keyof T, string>>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const isEmail = (v: string) => EMAIL.test(v.trim())

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Enter your email address.'
  if (!isEmail(email)) return 'Enter a valid email address, like name@example.com.'
}

export function validatePassword(password: string): string | undefined {
  if (!password) return 'Choose a password.'
  if (password.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.'
}

export function validateSignUp(v: SignUpValues): FieldErrors<SignUpValues> {
  const e: FieldErrors<SignUpValues> = {}
  const name = v.name.trim().replace(/\s+/g, ' ')
  if (!name) e.name = 'Enter your full name.'
  else if (name.length < 2) e.name = 'Your name looks too short.'
  else if (name.length > 80) e.name = 'Please use 80 characters or fewer.'
  const email = validateEmail(v.email)
  if (email) e.email = email
  const pw = validatePassword(v.password)
  if (pw) e.password = pw
  if (!v.confirm) e.confirm = 'Re-enter your password.'
  else if (v.confirm !== v.password) e.confirm = 'The passwords do not match.'
  return e
}

export function validateLogin(email: string, password: string): FieldErrors<{ email: string; password: string }> {
  const e: FieldErrors<{ email: string; password: string }> = {}
  const em = validateEmail(email)
  if (em) e.email = em
  if (!password) e.password = 'Enter your password.'
  return e
}

/** 0-4: a rough strength score to guide users (length, case mix, digits, symbols). */
export function passwordStrength(p: string): number {
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++
  return s
}
