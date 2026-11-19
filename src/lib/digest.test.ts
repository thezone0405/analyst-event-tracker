import { describe, expect, it, vi } from 'vitest'
import { runDigest, sydneyToday, type DigestDeps } from './digest'

const EVENTS = JSON.stringify([
  {
    event_id: 'E101',
    name: 'Sydney Cloud Security Summit',
    city: 'Sydney',
    date: '2026-11-19',
    type: 'Summit',
    target_registrations: 60,
    current_registrations: 36,
    launched: '2026-08-20',
  },
])
const CSV = 'registration_id,event,first_name,last_name,email,company,job_title,mobile,registered_at,status\n'

function makeDeps(overrides: Partial<DigestDeps> = {}) {
  const deps = {
    env: { SLACK_WEBHOOK: 'https://hooks.example/abc', DIGEST_DATE: '2026-11-16' },
    readFile: (path: string) => (path.endsWith('.json') ? EVENTS : CSV),
    post: vi.fn(async () => ({ ok: true, status: 200, text: async () => 'ok' })),
    log: vi.fn(),
    error: vi.fn(),
    now: () => new Date('2026-11-15T21:00:00Z'),
    ...overrides,
  }
  return deps
}

describe('sydneyToday', () => {
  it('returns the Sydney calendar date for 21:00 UTC (08:00 AEDT next day)', () => {
    expect(sydneyToday(new Date('2026-11-15T21:00:00Z'))).toBe('2026-11-16')
  })
})

describe('runDigest', () => {
  it('posts JSON with the digest text and exits 0', async () => {
    const deps = makeDeps()
    expect(await runDigest(deps)).toBe(0)
    expect(deps.post).toHaveBeenCalledTimes(1)
    const [url, init] = deps.post.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string>; body: string }]
    expect(url).toBe('https://hooks.example/abc')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body).text).toContain('E101 Sydney Cloud Security Summit (Sydney)')
    expect(deps.error).not.toHaveBeenCalled()
  })

  it('falls back to the Sydney date when DIGEST_DATE is unset', async () => {
    const deps = makeDeps({ env: { SLACK_WEBHOOK: 'https://hooks.example/abc' } })
    expect(await runDigest(deps)).toBe(0)
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('2026-11-16'))
  })

  it.each([undefined, '', '   '])('fails to stderr when SLACK_WEBHOOK is %j', async (value) => {
    const deps = makeDeps({ env: { SLACK_WEBHOOK: value } })
    expect(await runDigest(deps)).toBe(1)
    expect(deps.error).toHaveBeenCalledWith(expect.stringContaining('SLACK_WEBHOOK'))
    expect(deps.post).not.toHaveBeenCalled()
  })

  it('logs HTTP failure details and exits non-zero on a 500', async () => {
    const deps = makeDeps({
      post: vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' })),
    })
    expect(await runDigest(deps)).toBe(1)
    expect(deps.error).toHaveBeenCalledWith('Slack webhook responded with HTTP 500: boom')
  })

  it('reports thrown errors and exits non-zero', async () => {
    const deps = makeDeps({ post: vi.fn(async () => { throw new Error('network down') }) })
    expect(await runDigest(deps)).toBe(1)
    expect(deps.error).toHaveBeenCalledWith('Morning digest failed: network down')
  })

  it('stringifies non-Error throws', async () => {
    const deps = makeDeps({ readFile: () => { throw 'bad' } })
    expect(await runDigest(deps)).toBe(1)
    expect(deps.error).toHaveBeenCalledWith('Morning digest failed: bad')
  })
})
