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

  const ada = () => env.authenticatedContext('ada').firestore()
  const bob = () => env.authenticatedContext('bob').firestore()
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

  it('has the shape the app writes (one resume document passes)', () => {
    expect(Object.keys(item()).sort()).toEqual(['deleted', 'json', 'kind', 'updatedAt'])
  })
})
