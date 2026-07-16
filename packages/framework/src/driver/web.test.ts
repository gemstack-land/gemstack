import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { ROUTINE_BETA_HEADER, WebDriver, type FetchInit, type FetchLike, type FetchResponse } from './web.js'
import type { DriverEvent } from './types.js'

// SPIKE (#610). Transport is exercised through an injected `fetch`; no network, no real token.

function jsonResponse(status: number, body: unknown): FetchResponse {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(JSON.stringify(body)) }
}

/** Capture the one request the driver makes, and reply with `res`. */
function stubFetch(res: FetchResponse): { fetch: FetchLike; calls: Array<{ url: string; init: FetchInit }> } {
  const calls: Array<{ url: string; init: FetchInit }> = []
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init })
      return Promise.resolve(res)
    },
  }
}

const OK = { type: 'routine_fire', claude_code_session_id: 'session_01ABC', claude_code_session_url: 'https://claude.ai/code/session_01ABC' }

test('WebDriver fires the routine and returns the session handle as the turn', async () => {
  const { fetch, calls } = stubFetch(jsonResponse(200, OK))
  const driver = new WebDriver({ routineId: 'trig_01XYZ', token: 'sk-ant-oat01-test', fetch })
  const session = await driver.start({ cwd: '/ws' })
  const turn = await session.prompt('fix the auth bug')

  assert.equal(turn.text, 'https://claude.ai/code/session_01ABC')
  assert.equal(turn.sessionId, 'session_01ABC')
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.url, 'https://api.anthropic.com/v1/claude_code/routines/trig_01XYZ/fire')
  assert.equal(calls[0]!.init.method, 'POST')
  assert.equal(calls[0]!.init.headers['Authorization'], 'Bearer sk-ant-oat01-test')
  assert.equal(calls[0]!.init.headers['anthropic-beta'], ROUTINE_BETA_HEADER)
  assert.deepEqual(JSON.parse(calls[0]!.init.body), { text: 'fix the auth bug' })
})

test('WebDriver folds session + per-call framing into the fired text', async () => {
  const { fetch, calls } = stubFetch(jsonResponse(200, OK))
  const driver = new WebDriver({ routineId: 'trig_1', token: 't', fetch })
  const session = await driver.start({ cwd: '/ws', system: 'You are a reviewer.' })
  await session.prompt('check this', { system: 'Be terse.' })
  assert.deepEqual(JSON.parse(calls[0]!.init.body), { text: 'You are a reviewer.\n\nBe terse.\n\ncheck this' })
})

test('WebDriver emits start then result events', async () => {
  const events: DriverEvent[] = []
  const { fetch } = stubFetch(jsonResponse(200, OK))
  const driver = new WebDriver({ routineId: 'trig_1', token: 't', fetch })
  const session = await driver.start({ cwd: '/ws', onEvent: e => events.push(e) })
  await session.prompt('go')
  assert.deepEqual(events.map(e => e.type), ['start', 'result'])
})

test('WebDriver surfaces the error envelope message on a non-2xx', async () => {
  const { fetch } = stubFetch(jsonResponse(429, { type: 'error', error: { type: 'rate_limit_error', message: 'daily run limit reached' } }))
  const driver = new WebDriver({ routineId: 'trig_1', token: 't', fetch })
  const session = await driver.start({ cwd: '/ws' })
  await assert.rejects(() => session.prompt('go'), /daily run limit reached/)
})

test('WebDriver rejects an unrecognized 200 body', async () => {
  const { fetch } = stubFetch(jsonResponse(200, { type: 'routine_fire' }))
  const driver = new WebDriver({ routineId: 'trig_1', token: 't', fetch })
  const session = await driver.start({ cwd: '/ws' })
  await assert.rejects(() => session.prompt('go'), /unrecognized response/)
})

test('WebDriver rejects an already-aborted prompt without firing', async () => {
  const { fetch, calls } = stubFetch(jsonResponse(200, OK))
  const driver = new WebDriver({ routineId: 'trig_1', token: 't', fetch })
  const session = await driver.start({ cwd: '/ws', signal: AbortSignal.abort() })
  await assert.rejects(() => session.prompt('go'))
  assert.equal(calls.length, 0)
})

test('WebDriver has no readCode (remote workspace is not host-readable)', async () => {
  const { fetch } = stubFetch(jsonResponse(200, OK))
  const driver = new WebDriver({ routineId: 'trig_1', token: 't', fetch })
  const session = await driver.start({ cwd: '/ws' })
  assert.equal((session as { readCode?: unknown }).readCode, undefined)
})
