import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { Given, Then, When } from '@cucumber/cucumber'
import { runDigest, type PostInit, type PostResponse } from '../../src/lib/digest.ts'

interface Capture {
  exitCode: number
  posts: { url: string; init: PostInit }[]
  errors: string[]
  logs: string[]
}

interface DigestWorld {
  today?: string
  workflow?: string
  cron?: string
  env: Record<string, string | undefined>
  expected?: Record<string, string>[]
  runs: Capture[]
  failureMode?: boolean
}

const WEBHOOK = 'https://hooks.example.test/services/T000/B000/XXXX'
const w = (ctx: unknown): DigestWorld => ctx as DigestWorld

function read(path: string): string {
  return readFileSync(path, 'utf-8')
}

async function execute(
  env: Record<string, string | undefined>,
  respond: (url: string) => PostResponse,
): Promise<Capture> {
  const cap: Capture = { exitCode: -1, posts: [], errors: [], logs: [] }
  cap.exitCode = await runDigest({
    env,
    readFile: read,
    post: async (url, init) => {
      cap.posts.push({ url, init })
      return respond(url)
    },
    log: (m) => cap.logs.push(m),
    error: (m) => cap.errors.push(m),
    now: () => new Date('2026-11-15T21:00:00Z'),
  })
  return cap
}

const ok = (): PostResponse => ({ ok: true, status: 200, text: async () => 'ok' })

function runDigestScript(world: DigestWorld, date: string): Promise<Capture> {
  return execute({ SLACK_WEBHOOK: WEBHOOK, DIGEST_DATE: date }, ok)
}

function lastText(world: DigestWorld): string {
  const run = world.runs.at(-1)
  assert.ok(run && run.posts.length === 1, 'expected exactly one POST')
  return (JSON.parse(run.posts[0].init.body) as { text: string }).text
}

function init(world: DigestWorld): void {
  world.runs ??= []
  world.env ??= {}
}

// ---- Background ----
Given('the aggregation script is located at {string}', function (path: string) {
  init(w(this))
  assert.ok(existsSync(path), `${path} missing`)
})

Given('the GitHub Actions workflow is configured at {string}', function (path: string) {
  assert.ok(existsSync(path), `${path} missing`)
  w(this).workflow = read(path)
})

Given('the repository secret {string} is configured with a valid webhook endpoint URL', function (name: string) {
  assert.match(w(this).workflow ?? '', new RegExp(`secrets\\.${name}`))
})

Given('the script imports the shared deduplication and attention logic from {string}', function (path: string) {
  // script/daily-digest.ts -> src/lib/digest.ts -> src/lib/aggregator.ts (transitive import)
  assert.match(read('script/daily-digest.ts'), /src\/lib\/digest/)
  assert.match(read('src/lib/digest.ts'), /from '\.\/aggregator'/)
  const aggregator = read(path)
  assert.match(aggregator, /deduplicate/)
  assert.match(aggregator, /evaluateAttention/)
})

// ---- Scenario 1 ----
Given('the GitHub Actions schedule uses the UTC cron expression {string}', function (cron: string) {
  w(this).cron = cron
  assert.ok(w(this).workflow?.includes(`cron: '${cron}'`), 'cron not found in workflow')
})

When(/^the scheduled time reaches 08:00 AM AEDT \(Monday through Friday\)$/, function () {
  // Cron fields: minute hour dom month dow. Verify 21:00 UTC Sun-Thu == 08:00 Mon-Fri in Sydney (AEDT, Nov).
  const [minute, hour, , , dow] = w(this).cron!.split(' ')
  assert.equal(minute, '0')
  assert.equal(hour, '21')
  assert.equal(dow, '0-4')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const seen: string[] = []
  for (let d = 15; d <= 19; d++) {
    const utc = new Date(Date.UTC(2026, 10, d, 21, 0))
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(utc)
    const get = (t: string) => parts.find((p) => p.type === t)!.value
    assert.equal(`${get('hour')}:${get('minute')}`, '08:00')
    seen.push(get('weekday'))
    assert.ok(utc.getUTCDay() >= 0 && utc.getUTCDay() <= 4, `${days[utc.getUTCDay()]} outside cron dow`)
  }
  assert.deepEqual(seen, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
})

Then('GitHub Actions should checkout the repository and execute {string}', function (script: string) {
  const wf = w(this).workflow!
  assert.match(wf, /actions\/checkout/)
  assert.match(wf, new RegExp(`run:.*${script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
})

Then('pass the {string} secret as an environment variable to the script', function (name: string) {
  assert.match(w(this).workflow!, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`))
})

// ---- Scenario 2 ----
Given('a team member or engineer opens the {string} tab in GitHub', function (_tab: string) {
  init(w(this))
})

When('they manually trigger the {string} event for {string}', function (event: string, _path: string) {
  assert.match(w(this).workflow!, new RegExp(`^\\s*${event}:`, 'm'))
})

Then('the workflow should immediately run {string}', function (script: string) {
  assert.ok(w(this).workflow!.includes(script))
  // workflow_dispatch has no `if:` guards that would skip the step
  assert.doesNotMatch(w(this).workflow!, /^\s*if:/m)
})

Then('deliver the morning digest payload to the configured {string} URL', async function (_name: string) {
  init(w(this))
  const run = await runDigestScript(w(this), '2026-11-16')
  assert.equal(run.exitCode, 0)
  assert.equal(run.posts[0].url, WEBHOOK)
})

// ---- Scenario 3 ----
Given('{string} and {string} are reconciled with deduplication enabled', function (_a: string, _b: string) {
  init(w(this))
  assert.ok(existsSync('public/events.json') && existsSync('public/registrations.csv'))
})

Given(/^the following upcoming events meet the behind-target criteria \(within 10 days and under 85% target\):$/, function (table) {
  w(this).expected = table.hashes()
})

When('{string} executes', async function (_script: string) {
  const world = w(this)
  init(world)
  if (world.failureMode) return
  world.runs.push(await runDigestScript(world, world.today ?? '2026-11-20'))
})

Then('it should send an HTTP POST request with {string} to {string}', function (header: string, _name: string) {
  const run = w(this).runs.at(-1)!
  assert.equal(run.exitCode, 0)
  assert.equal(run.posts.length, 1)
  assert.equal(run.posts[0].url, WEBHOOK)
  assert.equal(run.posts[0].init.method, 'POST')
  const [name, value] = header.split(': ')
  assert.equal(run.posts[0].init.headers[name], value)
  assert.doesNotThrow(() => JSON.parse(run.posts[0].init.body))
})

Then('the JSON payload should include a human-readable {string} summary listing those {int} events sorted by soonest date first', function (key: string, count: number) {
  const text = lastText(w(this))
  assert.ok(typeof JSON.parse(w(this).runs.at(-1)!.posts[0].init.body)[key] === 'string')
  const lines = text.split('\n').filter((l) => l.startsWith('•'))
  const expected = w(this).expected!
  assert.equal(expected.length, count)
  assert.equal(lines.length, count, `lines:\n${text}`)
  assert.deepEqual(
    lines.map((l) => l.split(' ')[1]),
    expected.map((e) => e.event_id),
  )
})

Then('each listed event should show its event ID, name, city, days remaining, confirmed-to-target ratio, and pending count if greater than 0', function () {
  const lines = lastText(w(this)).split('\n').filter((l) => l.startsWith('•'))
  w(this).expected!.forEach((e, i) => {
    const line = lines[i]
    assert.ok(line.includes(e.event_id), line)
    assert.ok(line.includes(e.name), line)
    assert.ok(line.includes(`(${e.city})`), line)
    assert.ok(line.includes(`${e.days_until} day`), line)
    assert.ok(line.includes(`${e.confirmed}/${e.target}`), line)
    assert.ok(line.includes(`${e.pct}%`), line)
    if (Number(e.pending) > 0) assert.ok(line.includes(`${e.pending} pending`), line)
    else assert.ok(!line.includes('pending'), line)
  })
})

Then(/^completed past events such as "(\w+)" and on-track events such as "(\w+)" should be excluded from the behind-target list$/, function (past: string, onTrack: string) {
  const text = lastText(w(this))
  assert.ok(!text.includes(past), `${past} listed`)
  assert.ok(!text.includes(onTrack), `${onTrack} listed`)
})

// ---- Scenario 4 ----
Given(/^all upcoming events within the next 10 days have reached at least 85% of their target registrations$/, function () {
  init(w(this))
  // 2026-11-20: only E141 (31/30, 6 days out) remains in the 10-day window; it is on track.
  w(this).today = '2026-11-20'
})

Then('it should send an HTTP POST request to {string}', function (_name: string) {
  const run = w(this).runs.at(-1)!
  assert.equal(run.exitCode, 0)
  assert.equal(run.posts.length, 1)
  assert.equal(run.posts[0].url, WEBHOOK)
})

Then('the payload {string} should confirm that all upcoming events are currently on track', function (_key: string) {
  const text = lastText(w(this))
  assert.match(text, /on track/i)
  assert.ok(!text.includes('•'), text)
})

// ---- Scenario 5 ----
Given('the {string} environment variable is empty or the endpoint responds with HTTP status {int}', async function (_name: string, status: number) {
  const world = w(this)
  init(world)
  world.failureMode = true
  const date = '2026-11-16'
  world.runs.push(await execute({ SLACK_WEBHOOK: '', DIGEST_DATE: date }, ok))
  world.runs.push(
    await execute({ SLACK_WEBHOOK: WEBHOOK, DIGEST_DATE: date }, () => ({
      ok: false,
      status,
      text: async () => 'internal error body',
    })),
  )
})

Then('the script should log the HTTP failure details to stderr', function () {
  const [missing, http500] = w(this).runs
  assert.equal(missing.posts.length, 0)
  assert.match(missing.errors.join('\n'), /SLACK_WEBHOOK/)
  assert.match(http500.errors.join('\n'), /HTTP 500/)
  assert.match(http500.errors.join('\n'), /internal error body/)
})

Then('exit with a non-zero exit code so GitHub Actions marks the workflow run as failed', function () {
  for (const run of w(this).runs) assert.notEqual(run.exitCode, 0)
})
