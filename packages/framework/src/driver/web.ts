import { combineFraming, makeEmit } from './session-support.js'
import type { Driver, DriverPromptOptions, DriverSession, DriverStartOptions, DriverTurn } from './types.js'

// SPIKE (#610): a Driver that runs the task on Claude Code on the web instead of the local CLI.
// It drives the *supported* surface — the routines fire API — not the browser UI (extension /
// headless would script an authed, bot-protected page and is barred by the Usage Policy). The
// same subscription that auths the local CLI auths the cloud session; the only new secret is a
// per-routine token generated once in the web UI.
//
// The seam holds for start / dispose, but the web flow is fire-and-forget by design: `/fire`
// returns as soon as the session is created, so `prompt` resolves with the session *handle*
// (id + url), not a final turn. Collecting the outcome (the pushed branch / PR) is a later step,
// not this call. That contract shift is the one open design question before this graduates from
// spike to a shipped driver.

/** The slice of `fetch` the driver needs. Injectable so the transport is unit-testable. */
export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponse>

/** The request shape {@link WebDriver} sends. */
export interface FetchInit {
  method: string
  headers: Record<string, string>
  body: string
  signal?: AbortSignal
}

/** The slice of a `fetch` Response the driver reads. */
export interface FetchResponse {
  ok: boolean
  status: number
  text(): Promise<string>
}

/** Options for {@link WebDriver}. */
export interface WebDriverOptions {
  /** The routine's trigger id (prefixed `trig_`), from the API trigger the web UI shows. */
  routineId: string
  /** Per-routine bearer token (prefixed `sk-ant-oat01-`), generated once in the web UI. */
  token: string
  /** API host. Default `https://api.anthropic.com`. */
  baseUrl?: string
  /** Beta header value gating the experimental endpoint. */
  betaHeader?: string
  /** API version header. Default `2023-06-01`. */
  apiVersion?: string
  /** `fetch` override for tests. Default the global `fetch`. */
  fetch?: FetchLike
}

/** Default beta header for the routines fire endpoint (experimental; dated). */
export const ROUTINE_BETA_HEADER = 'experimental-cc-routine-2026-04-01'

/** The `/fire` response we parse: the created session's id and url. */
interface RoutineFireResponse {
  type: string
  claude_code_session_id: string
  claude_code_session_url: string
}

/**
 * A {@link Driver} that fires Claude Code on the web via the routines API. Each
 * {@link DriverSession.prompt} POSTs the prompt as the run's `text` context and
 * returns the new session's url as the turn — a handle to watch, not the final
 * code. `readCode` is omitted (the workspace is a remote VM); gate on the branch/PR.
 */
export class WebDriver implements Driver {
  readonly name = 'claude-code-web'
  constructor(private readonly opts: WebDriverOptions) {}

  start(opts: DriverStartOptions): Promise<DriverSession> {
    return Promise.resolve(new WebSession(this.opts, opts))
  }
}

/** One workspace-bound web session. Each `prompt` is a fresh `/fire` call. */
export class WebSession implements DriverSession {
  readonly id: string
  readonly cwd: string

  constructor(
    private readonly config: WebDriverOptions,
    private readonly startOpts: DriverStartOptions,
  ) {
    this.cwd = startOpts.cwd
    this.id = `${config.routineId}`
  }

  async prompt(text: string, opts: DriverPromptOptions = {}): Promise<DriverTurn> {
    const emit = makeEmit(this.startOpts.onEvent, this.driverName)
    const system = combineFraming(this.startOpts.system, opts.system)
    // The endpoint takes freeform `text` appended to the routine's saved prompt; fold any
    // framing in as a leading block since there is no separate system field on this surface.
    const body = combineFraming(system, text)

    const signals = [this.startOpts.signal, opts.signal].filter((s): s is AbortSignal => s != null)
    for (const s of signals) {
      if (s.aborted) throw new Error(`[framework] ${this.driverName} prompt aborted`)
    }

    emit({ type: 'start', prompt: text })
    const res = await this.fire(body, signals[0])
    const raw = await res.text()
    if (!res.ok) {
      const message = parseErrorMessage(raw) ?? `fire failed (${res.status})`
      emit({ type: 'error', message })
      throw new Error(`[framework] ${this.driverName} ${message}`)
    }

    const parsed = parseFireResponse(raw)
    if (!parsed) {
      const message = 'routine fire returned an unrecognized response'
      emit({ type: 'error', message })
      throw new Error(`[framework] ${this.driverName} ${message}`)
    }

    // Fire-and-forget: the turn is the session handle, not final code. The url is what a UI
    // links to and what a later collect step teleports / reads the PR from.
    const sessionId = parsed.claude_code_session_id
    const turn: DriverTurn = { text: parsed.claude_code_session_url, sessionId }
    emit({ type: 'result', text: turn.text, sessionId })
    return turn
  }

  dispose(): Promise<void> {
    // No local process; the cloud session persists server-side by design. Nothing to tear down.
    return Promise.resolve()
  }

  private get driverName(): string {
    return 'claude-code-web'
  }

  private fire(body: string, signal: AbortSignal | undefined): Promise<FetchResponse> {
    const base = this.config.baseUrl ?? 'https://api.anthropic.com'
    const url = `${base}/v1/claude_code/routines/${this.config.routineId}/fire`
    const doFetch = this.config.fetch ?? (globalThis.fetch as unknown as FetchLike)
    return doFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'anthropic-version': this.config.apiVersion ?? '2023-06-01',
        'anthropic-beta': this.config.betaHeader ?? ROUTINE_BETA_HEADER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: body }),
      ...(signal ? { signal } : {}),
    })
  }
}

/** Pull the session handle off a `/fire` 200 body; undefined when the shape is wrong. */
function parseFireResponse(raw: string): RoutineFireResponse | undefined {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return undefined
  }
  const id = obj['claude_code_session_id']
  const url = obj['claude_code_session_url']
  if (typeof id !== 'string' || typeof url !== 'string') return undefined
  return { type: String(obj['type'] ?? 'routine_fire'), claude_code_session_id: id, claude_code_session_url: url }
}

/** Pull `error.message` off the standard Anthropic error envelope, when present. */
function parseErrorMessage(raw: string): string | undefined {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const err = obj['error']
    if (typeof err === 'object' && err !== null) {
      const message = (err as Record<string, unknown>)['message']
      if (typeof message === 'string') return message
    }
  } catch {
    // Non-JSON error body; fall back to the status-based message.
  }
  return undefined
}
