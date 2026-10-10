import { describe, expect, it } from 'vitest'
import { isEmail, passwordStrength, validateEmail, validateLogin, validatePassword, validateSignUp } from './validate'

const good = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'Analytical1', confirm: 'Analytical1' }

describe('sign-up validation', () => {
  it('accepts valid input', () => {
    expect(validateSignUp(good)).toEqual({})
  })
  it('requires every field', () => {
    const e = validateSignUp({ name: '', email: '', password: '', confirm: '' })
    expect(Object.keys(e).sort()).toEqual(['confirm', 'email', 'name', 'password'])
  })
  it('checks name length and ignores surrounding spaces', () => {
    expect(validateSignUp({ ...good, name: ' A ' }).name).toMatch(/too short/)
    expect(validateSignUp({ ...good, name: 'x'.repeat(81) }).name).toMatch(/80/)
    expect(validateSignUp({ ...good, name: '  Ada   Lovelace ' }).name).toBeUndefined()
  })
  it('checks the email format', () => {
    for (const bad of ['plain', 'a@b', 'a b@c.com', '@c.com', 'a@.com']) expect(validateEmail(bad), bad).toBeDefined()
    expect(isEmail(' ada@example.com ')).toBe(true)
  })
  it('enforces password rules and a matching confirmation', () => {
    expect(validatePassword('short1')).toMatch(/8 characters/)
    expect(validatePassword('allletters')).toMatch(/letter and one number/)
    expect(validatePassword('12345678')).toMatch(/letter and one number/)
    expect(validatePassword('Analytical1')).toBeUndefined()
    expect(validateSignUp({ ...good, confirm: 'Different1' }).confirm).toMatch(/do not match/)
    expect(validateSignUp({ ...good, confirm: '' }).confirm).toMatch(/Re-enter/)
  })
})

describe('login validation and password strength', () => {
  it('requires an email and a password', () => {
    expect(validateLogin('', '')).toEqual({ email: expect.any(String), password: expect.any(String) })
    expect(validateLogin('ada@example.com', 'x')).toEqual({})
  })
  it('scores stronger passwords higher', () => {
    expect(passwordStrength('abc')).toBe(0)
    expect(passwordStrength('abcdefg1')).toBe(1)
    expect(passwordStrength('Abcdefg1xyz!')).toBeGreaterThanOrEqual(3)
    expect(passwordStrength('Abcdefghijk1!')).toBe(4)
  })
})
