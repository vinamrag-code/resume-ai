// @vitest-environment node
// Runs only against the Firestore emulator. See README ("Testing the security rules").
import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const item = (over: Record<string, unknown> = {}) => ({ kind: 'resume', json: '{"id":"a"}', updatedAt: 1, deleted: false, ...over })

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('Firestore security rules', () => {
  let env: RulesTestEnvironment
  beforeAll(async () => {
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':')
    env = await initializeTestEnvironment({ projectId: 'demo-resume-ai', firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } })
  })
  afterAll(async () => env?.cleanup())
  beforeEach(async () => env.clearFirestore())

  const ada = () => env.authenticatedContext('ada', { email_verified: true }).firestore()
  const bob = () => env.authenticatedContext('bob', { email_verified: true }).firestore()
  const unverified = () => env.authenticatedContext('ada', { email_verified: false }).firestore()
  const anon = () => env.unauthenticatedContext().firestore()
  const path = (db: ReturnType<typeof ada>, uid = 'ada', id = 'abc123') => db.doc(`users/${uid}/items/${id}`)

  it('lets a user create, read, update and delete their own items', async () => {
    await assertSucceeds(path(ada()).set(item()))
    await assertSucceeds(path(ada()).get())
    await assertSucceeds(path(ada()).set(item({ json: '{"id":"a","name":"x"}', updatedAt: 2 })))
    await assertSucceeds(path(ada()).set(item({ json: '', deleted: true, updatedAt: 3 })))
    await assertSucceeds(ada().collection('users/ada/items').get())
    await assertSucceeds(path(ada()).delete())
  })

  it("blocks other users and signed-out visitors from someone else's data", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => void (await ctx.firestore().doc('users/ada/items/abc123').set(item())))
    await assertFails(path(bob(), 'ada').get())
    await assertFails(path(bob(), 'ada').set(item()))
    await assertFails(path(bob(), 'ada').delete())
    await assertFails(bob().collection('users/ada/items').get())
    await assertFails(path(anon(), 'ada').get())
    await assertFails(path(anon(), 'ada').set(item()))
    await assertFails(anon().collection('users/ada/items').get())
  })

  it('gives accounts with an unverified email no access at all', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/ada/items/abc123').set(item())
      await ctx.firestore().doc('admins/ada').set({ role: 'admin' })
    })
    await assertFails(path(unverified()).get())
    await assertFails(path(unverified()).set(item()))
    await assertFails(unverified().collection('users/ada/items').get())
    await assertFails(unverified().doc('admins/ada').get())
    await assertFails(unverified().doc('config/models').set({ groq: ['a'], openrouter: ['b'], defaults: {}, updatedAt: 1 })) // not even an admin
    await assertSucceeds(unverified().doc('config/models').get()) // the model list stays public
  })

  it('accepts all four item kinds and nothing else', async () => {
    for (const kind of ['resume', 'job', 'letter', 'chat']) await assertSucceeds(path(ada(), 'ada', `k-${kind}`).set(item({ kind })))
    await assertFails(path(ada(), 'ada', 'k-other').set(item({ kind: 'note' })))
  })

  it('rejects documents with the wrong shape', async () => {
    await assertFails(path(ada()).set(item({ extra: 1 })))
    await assertFails(path(ada()).set({ kind: 'resume', json: '{}', updatedAt: 1 })) // missing "deleted"
    await assertFails(path(ada()).set(item({ kind: 'admin' })))
    await assertFails(path(ada()).set(item({ json: { not: 'a string' } })))
    await assertFails(path(ada()).set(item({ updatedAt: 'yesterday' })))
    await assertFails(path(ada()).set(item({ deleted: 'no' })))
    await assertFails(path(ada()).set(item({ json: 'x'.repeat(700_001) })))
    await assertSucceeds(path(ada()).set(item({ json: 'x'.repeat(699_999) })))
  })

  it('rejects odd document ids', async () => {
    await assertFails(path(ada(), 'ada', 'bad id!').set(item()))
    await assertFails(path(ada(), 'ada', 'x'.repeat(65)).set(item()))
    await assertSucceeds(path(ada(), 'ada', 'a1_B-2').set(item()))
  })

  it('denies everything outside users/{uid}/items', async () => {
    await assertFails(ada().doc('users/ada').set({ a: 1 }))
    await assertFails(ada().doc('users/ada/other/x').set(item()))
    await assertFails(ada().doc('admin/config').get())
    await assertFails(anon().doc('anything/here').get())
  })

  describe('admins and the model config', () => {
    const models = (over: Record<string, unknown> = {}) => ({ groq: ['a/b'], openrouter: ['c/d:free'], defaults: { groq: 'a/b', openrouter: 'c/d:free' }, updatedAt: 1, ...over })
    const makeAdmin = (uid: string) => env.withSecurityRulesDisabled(async (ctx) => void (await ctx.firestore().doc(`admins/${uid}`).set({ role: 'admin' })))
    const cfg = (db: ReturnType<typeof ada>) => db.doc('config/models')

    it('lets only an admin change the models, and everyone read them', async () => {
      await makeAdmin('ada')
      await assertSucceeds(cfg(ada()).set(models()))
      await assertSucceeds(cfg(ada()).set(models({ groq: ['a/b', 'e/f'], updatedAt: 2 })))
      await assertFails(cfg(bob()).set(models()))
      await assertFails(cfg(anon()).set(models()))
      await assertSucceeds(cfg(bob()).get())
      await assertSucceeds(cfg(anon()).get())
      await assertFails(ada().collection('config').get())
      await assertFails(cfg(ada()).delete())
    })

    it('validates the config an admin writes', async () => {
      await makeAdmin('ada')
      await assertFails(cfg(ada()).set(models({ groq: [] })))
      await assertFails(cfg(ada()).set(models({ groq: 'a/b' })))
      await assertFails(cfg(ada()).set(models({ openrouter: Array.from({ length: 21 }, (_, i) => `m/${i}`) })))
      await assertFails(cfg(ada()).set(models({ defaults: 'x' })))
      await assertFails(cfg(ada()).set(models({ updatedAt: 'now' })))
      await assertFails(cfg(ada()).set(models({ extra: true })))
      await assertFails(ada().doc('config/other').set(models()))
    })

    it('does not let users make themselves admin or see other admins', async () => {
      await assertFails(ada().doc('admins/ada').set({ role: 'admin' }))
      await assertFails(anon().doc('admins/ada').set({ role: 'admin' }))
      await makeAdmin('ada')
      await assertSucceeds(ada().doc('admins/ada').get())
      await assertFails(bob().doc('admins/ada').get())
      await assertFails(anon().doc('admins/ada').get())
      await assertFails(ada().collection('admins').get())
      await assertFails(ada().doc('admins/ada').delete())
      // Being an admin gives no access to other users' resumes.
      await assertFails(ada().doc('users/bob/items/abc').get())
    })
  })

  it('has the shape the app writes (one resume document passes)', () => {
    expect(Object.keys(item()).sort()).toEqual(['deleted', 'json', 'kind', 'updatedAt'])
  })
})
