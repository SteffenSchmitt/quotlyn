import type { UsageResult } from '../api/usageClient'

export interface PollTarget {
  id: string
  token: string
}

export interface AccountPollState {
  status: 'idle' | 'fetching' | 'ok' | 'limited' | 'error' | 'paused' | 'disabled'
  /** Last attempt, whatever its outcome. */
  lastFetchedAt: string | null
  /** Last successful read. */
  lastOkAt: string | null
  lastError: string | null
  pausedUntil: string | null
}

export interface PollerOptions {
  intervalMs: number
  staggerMs?: number
  targets: () => PollTarget[]
  fetch: (target: PollTarget) => Promise<UsageResult>
  onResult: (target: PollTarget, result: UsageResult) => void
  onStateChange?: (id: string, state: AccountPollState) => void
  now?: () => number
}

const IDLE: AccountPollState = { status: 'idle', lastFetchedAt: null, lastOkAt: null, lastError: null, pausedUntil: null }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class Poller {
  private intervalMs: number
  private readonly staggerMs: number
  private timer: ReturnType<typeof setTimeout> | null = null
  private states = new Map<string, AccountPollState>()
  private cycle: Promise<void> | null = null
  private _running = false
  private readonly now: () => number
  private readonly opts: PollerOptions

  constructor(opts: PollerOptions) {
    this.opts = opts
    this.intervalMs = opts.intervalMs
    this.staggerMs = opts.staggerMs ?? 2000
    this.now = opts.now ?? Date.now
  }

  get running(): boolean {
    return this._running
  }

  getState(id: string): AccountPollState {
    return this.states.get(id) ?? IDLE
  }

  private setState(id: string, patch: Partial<AccountPollState>) {
    const next = { ...this.getState(id), ...patch }
    this.states.set(id, next)
    this.opts.onStateChange?.(id, next)
  }

  start(): void {
    if (this._running) return
    this._running = true
    void this.runCycle(false)
  }

  stop(): void {
    this._running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  setIntervalMs(ms: number): void {
    this.intervalMs = ms
    if (this._running && this.timer) {
      clearTimeout(this.timer)
      this.scheduleNext()
    }
  }

  resetAccount(id: string): void {
    this.setState(id, { status: 'idle', lastError: null, pausedUntil: null })
  }

  refreshAll(): Promise<void> {
    return this.runCycle(true)
  }

  /** Polls one account right away; skips rejected tokens and accounts already being fetched. */
  refreshOne(id: string): Promise<void> {
    const target = this.opts.targets().find((t) => t.id === id)
    const status = this.getState(id).status
    if (!target || status === 'disabled' || status === 'fetching') return Promise.resolve()
    return this.pollOne(target)
  }

  private scheduleNext() {
    if (!this._running) return
    this.timer = setTimeout(() => void this.runCycle(false), this.intervalMs)
  }

  private runCycle(manual: boolean): Promise<void> {
    if (this.cycle) return this.cycle
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.cycle = this.pollAll(manual).finally(() => {
      this.cycle = null
      this.scheduleNext()
    })
    return this.cycle
  }

  private async pollAll(manual: boolean) {
    const targets = this.opts.targets()
    let first = true
    for (const target of targets) {
      const state = this.getState(target.id)
      if (state.status === 'disabled') continue
      if (!manual && state.status === 'paused' && state.pausedUntil && Date.parse(state.pausedUntil) > this.now()) {
        continue
      }
      if (!first) await sleep(this.staggerMs)
      first = false
      await this.pollOne(target)
    }
  }

  private async pollOne(target: PollTarget) {
    this.setState(target.id, { status: 'fetching' })
    let result: UsageResult
    try {
      result = await this.opts.fetch(target)
    } catch (err) {
      result = { ok: false, status: null, error: err instanceof Error ? err.message : String(err) }
    }
    const fetchedAt = new Date(this.now()).toISOString()
    this.opts.onResult(target, result)

    if (result.ok) {
      this.setState(target.id, { status: 'ok', lastFetchedAt: fetchedAt, lastOkAt: fetchedAt, lastError: null, pausedUntil: null })
      return
    }
    if (result.status === 401 || result.status === 403) {
      this.setState(target.id, {
        status: 'disabled',
        lastFetchedAt: fetchedAt,
        lastError: result.error,
        pausedUntil: null,
      })
      return
    }
    if (result.status === 429 && result.limitReached) {
      this.setState(target.id, { status: 'limited', lastFetchedAt: fetchedAt, lastOkAt: fetchedAt, lastError: null, pausedUntil: null })
      return
    }
    if (result.status === 429) {
      const pauseMs = Math.max(2 * this.intervalMs, (result.retryAfterSeconds ?? 0) * 1000)
      this.setState(target.id, {
        status: 'paused',
        lastFetchedAt: fetchedAt,
        lastError: result.error,
        pausedUntil: new Date(this.now() + pauseMs).toISOString(),
      })
      return
    }
    this.setState(target.id, { status: 'error', lastFetchedAt: fetchedAt, lastError: result.error, pausedUntil: null })
  }
}
