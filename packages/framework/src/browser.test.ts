import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { chromeLaunchArgs, freePort, launchSharedBrowser, resolveChromePath, waitForDebugEndpoint } from './browser.js'
import { browserMcpServers, withBrowser, BROWSER_MCP_SERVERS } from './cli.js'

test('chromeLaunchArgs opens the debug port on a throwaway profile (#793)', () => {
  const args = chromeLaunchArgs(9333, '/tmp/profile')
  assert.ok(args.includes('--remote-debugging-port=9333'), 'the port is what a second client attaches to')
  assert.ok(args.includes('--user-data-dir=/tmp/profile'), 'never the user’s real Chrome profile')
  assert.ok(args.includes('--headless=new'))
  assert.equal(args.at(-1), 'about:blank')
})

test('chromeLaunchArgs can run headful for local debugging', () => {
  assert.ok(!chromeLaunchArgs(1, '/tmp/p', false).includes('--headless=new'))
})

test('resolveChromePath prefers an explicit CHROME_PATH over the well-known locations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chrome-path-'))
  const fake = join(dir, 'my-chrome')
  await writeFile(fake, '')
  assert.equal(resolveChromePath({ CHROME_PATH: fake }, 'linux'), fake)
  assert.equal(resolveChromePath({ PUPPETEER_EXECUTABLE_PATH: fake }, 'linux'), fake)
})

test('resolveChromePath ignores an override that does not exist', () => {
  assert.equal(resolveChromePath({ CHROME_PATH: '/nope/chrome', PATH: '' }, 'linux'), undefined)
})

test('resolveChromePath finds a browser on PATH when no standard install exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chrome-onpath-'))
  await writeFile(join(dir, 'chromium'), '')
  assert.equal(resolveChromePath({ PATH: dir }, 'linux'), join(dir, 'chromium'))
})

test('freePort returns a port nothing is listening on', async () => {
  const port = await freePort()
  assert.ok(port > 0 && port < 65536)
})

test('waitForDebugEndpoint resolves once the endpoint answers', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ Browser: 'Chrome/150' }))
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  try {
    assert.equal(await waitForDebugEndpoint(`http://127.0.0.1:${port}`, { timeoutMs: 3000 }), true)
  } finally {
    server.close()
  }
})

test('waitForDebugEndpoint gives up rather than hanging the run when Chrome never listens', async () => {
  const port = await freePort()
  assert.equal(await waitForDebugEndpoint(`http://127.0.0.1:${port}`, { timeoutMs: 250, intervalMs: 25 }), false)
})

test('a machine with no Chrome resolves to nothing, which is what makes --browser fall back', () => {
  assert.equal(resolveChromePath({ PATH: '' }, 'linux'), undefined)
})

test('launchSharedBrowser gives up on a binary that never opens the port', async () => {
  // A path that cannot start: stands in for a Chrome that never listens. The run must get
  // undefined (and fall back) rather than a handle to a browser nothing is behind.
  const browser = await launchSharedBrowser({ chromePath: join(tmpdir(), 'definitely-not-chrome'), timeoutMs: 400 })
  assert.equal(browser, undefined, 'a browser that never listens must not be handed to the agent')
})

test('browserMcpServers points the MCP server at our Chrome when we launched one (#793)', () => {
  const args = browserMcpServers('http://127.0.0.1:9333')['chrome-devtools']?.args ?? []
  assert.ok(args.includes('--browserUrl'))
  assert.ok(args.includes('http://127.0.0.1:9333'))
})

test('browserMcpServers is the old launch-its-own spec when there is no shared browser', () => {
  assert.deepEqual(browserMcpServers(undefined), BROWSER_MCP_SERVERS)
  assert.ok(!(browserMcpServers(undefined)['chrome-devtools']?.args ?? []).includes('--browserUrl'))
})

test('withBrowser folds the browser URL through to the driver options', () => {
  const opts = withBrowser({ permissionMode: 'bypassPermissions' }, true, 'http://127.0.0.1:4242')
  assert.ok((opts.mcpServers?.['chrome-devtools']?.args ?? []).includes('http://127.0.0.1:4242'))
})

test('withBrowser stays a no-op without the flag, URL or not', () => {
  const base = { permissionMode: 'bypassPermissions' } as const
  assert.deepEqual(withBrowser(base, false, 'http://127.0.0.1:4242'), base)
})
