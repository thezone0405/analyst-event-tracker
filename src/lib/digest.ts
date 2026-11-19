import { parseEvents, parseRegistrations } from '../services/parsers'
import { buildDigestText } from './aggregator'

export interface PostInit {
  method: 'POST'
  headers: Record<string, string>
  body: string
}

export interface PostResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
}

export interface DigestDeps {
  env: Record<string, string | undefined>
  readFile: (path: string) => string
  post: (url: string, init: PostInit) => Promise<PostResponse>
  log: (message: string) => void
  error: (message: string) => void
  now: () => Date
}

export const EVENTS_PATH = 'public/events.json'
export const REGISTRATIONS_PATH = 'public/registrations.csv'

/** Today's calendar date (YYYY-MM-DD) in Sydney, so 08:00 AEDT runs use the local day. */
export function sydneyToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Runs the digest and returns the process exit code (0 on success). */
export async function runDigest(deps: DigestDeps): Promise<number> {
  const webhook = deps.env.SLACK_WEBHOOK?.trim()
  if (!webhook) {
    deps.error('SLACK_WEBHOOK is not set; cannot deliver the morning digest.')
    return 1
  }
  try {
    const today = deps.env.DIGEST_DATE?.trim() || sydneyToday(deps.now())
    const events = parseEvents(JSON.parse(deps.readFile(EVENTS_PATH)))
    const registrations = parseRegistrations(deps.readFile(REGISTRATIONS_PATH))
    const text = buildDigestText(events, registrations, today)
    const response = await deps.post(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!response.ok) {
      const body = await response.text()
      deps.error(`Slack webhook responded with HTTP ${response.status}: ${body}`)
      return 1
    }
    deps.log(`Morning digest delivered for ${today}.`)
    return 0
  } catch (err) {
    deps.error(`Morning digest failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}
