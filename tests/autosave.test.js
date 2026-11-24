import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createAutosaveController } from '../src/services/autosaveController.js'
import { createManualScheduler, deferred, settle } from './sessionHelpers.js'

// A controller whose saves the test completes by hand.
function setup(options = {}) {
  const scheduler = createManualScheduler()
  const saves = []
  const statuses = []
  const controller = createAutosaveController({
    save: () => {
      const entry = deferred()
      saves.push(entry)
      return entry.promise
    },
    scheduler,
    delayMs: 800,
    maxWaitMs: 5000,
    retryDelaysMs: [2000, 5000],
    ...options,
  })
  controller.subscribe((state) => statuses.push(state.status))
  return { controller, scheduler, saves, statuses }
}

describe('autosave states', () => {
  test('starts as saved with nothing to do', () => {
    const { controller, scheduler, saves } = setup()
    assert.equal(controller.getState().status, 'saved')
    scheduler.advance(10_000)
    assert.equal(saves.length, 0)
  })

  test('a change is "unsaved" until the delay passes, then "saving", and "saved" only after the storage acknowledges', async () => {
    const { controller, scheduler, saves, statuses } = setup()
    controller.markDirty()
    assert.equal(controller.getState().status, 'unsaved')
    assert.equal(saves.length, 0)

    scheduler.advance(799)
    assert.equal(saves.length, 0)
    scheduler.advance(1)
    await settle()
    assert.equal(saves.length, 1)
    assert.equal(controller.getState().status, 'saving')

    // The save was requested but not acknowledged: it must NOT read "saved".
    await settle()
    assert.equal(controller.getState().status, 'saving')
    assert.ok(!statuses.includes('saved'))

    saves[0].resolve()
    await settle()
    assert.equal(controller.getState().status, 'saved')
    assert.deepEqual(statuses, ['unsaved', 'saving', 'saved'])
  })

  test('several quick changes cause a single save', async () => {
    const { controller, scheduler, saves } = setup()
    for (let index = 0; index < 20; index += 1) {
      controller.markDirty()
      scheduler.advance(100)
    }
    scheduler.advance(800)
    await settle()
    assert.equal(saves.length, 1)
  })

  test('constant editing still saves within the maximum wait', async () => {
    const { controller, scheduler, saves } = setup()
    for (let elapsed = 0; elapsed < 5000; elapsed += 500) {
      controller.markDirty()
      scheduler.advance(500)
    }
    await settle()
    assert.ok(saves.length >= 1)
  })

  test('a failed save is shown as "failed" and never as saved', async () => {
    const { controller, scheduler, saves, statuses } = setup()
    controller.markDirty()
    scheduler.advance(800)
    await settle()
    const error = new Error('quota')
    saves[0].reject(error)
    await settle()
    assert.equal(controller.getState().status, 'failed')
    assert.equal(controller.getState().error, error)
    assert.ok(!statuses.includes('saved'))
  })

  test('it retries after a failure and recovers when the storage works again', async () => {
    const { controller, scheduler, saves } = setup()
    controller.markDirty()
    scheduler.advance(800)
    await settle()
    saves[0].reject(new Error('down'))
    await settle()
    assert.equal(controller.getState().status, 'failed')

    scheduler.advance(2000)
    await settle()
    assert.equal(saves.length, 2)
    assert.equal(controller.getState().status, 'saving')
    saves[1].resolve()
    await settle()
    assert.equal(controller.getState().status, 'saved')
    assert.equal(controller.getState().error, null)
  })

  test('retry() tries again immediately, but only after a failure', async () => {
    const { controller, scheduler, saves } = setup({ retryDelaysMs: [] })
    await controller.retry()
    assert.equal(saves.length, 0)

    controller.markDirty()
    scheduler.advance(800)
    await settle()
    saves[0].reject(new Error('x'))
    await settle()
    const retried = controller.retry()
    await settle()
    assert.equal(saves.length, 2)
    saves[1].resolve()
    await retried
    assert.equal(controller.getState().status, 'saved')
  })

  test('changes made while saving keep the status honest and are saved next', async () => {
    const { controller, scheduler, saves } = setup()
    controller.markDirty()
    scheduler.advance(800)
    await settle()
    assert.equal(controller.getState().status, 'saving')

    controller.markDirty() // arrives while the first save is in flight
    assert.equal(controller.getState().status, 'saving')
    saves[0].resolve()
    await settle()
    // The first save is done, but the newer change is NOT saved.
    assert.equal(controller.getState().status, 'unsaved')

    scheduler.advance(800)
    await settle()
    assert.equal(saves.length, 2)
    saves[1].resolve()
    await settle()
    assert.equal(controller.getState().status, 'saved')
  })

  test('flush() saves pending changes now and resolves once acknowledged', async () => {
    const { controller, saves } = setup()
    controller.markDirty()
    let done = false
    const flushed = controller.flush().then((state) => {
      done = true
      return state
    })
    await settle()
    assert.equal(saves.length, 1)
    assert.equal(done, false)
    saves[0].resolve()
    const state = await flushed
    assert.equal(state.status, 'saved')
  })

  test('flush() with nothing pending resolves at once, and reports a failure', async () => {
    const clean = setup()
    assert.equal((await clean.controller.flush()).status, 'saved')

    const failing = setup({ retryDelaysMs: [] })
    failing.controller.markDirty()
    const flushed = failing.controller.flush()
    await settle()
    failing.saves[0].reject(new Error('x'))
    assert.equal((await flushed).status, 'failed')
  })

  test('after dispose() nothing is saved or reported', async () => {
    const { controller, scheduler, saves, statuses } = setup()
    controller.markDirty()
    controller.dispose()
    scheduler.advance(10_000)
    await settle()
    assert.equal(saves.length, 0)
    assert.deepEqual(statuses, ['unsaved'])
  })

  test('save() is required', () => {
    assert.throws(() => createAutosaveController({}), TypeError)
  })
})
