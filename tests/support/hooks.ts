import { After, AfterAll, Before, BeforeAll, Status } from '@cucumber/cucumber'
import { chromium, type Browser } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import type { AppWorld } from './world.ts'

let browser: Browser
let server: ViteDevServer | undefined
let baseUrl: string

/**
 * Starts the app once per run. Set BASE_URL to test an already-running
 * server instead (e.g. `vite preview` or a Vercel preview deployment).
 * Set HEADED=1 to watch the browser.
 */
BeforeAll(async function () {
  if (process.env.BASE_URL) {
    baseUrl = process.env.BASE_URL
  } else {
    server = await createServer({ logLevel: 'error', server: { port: 5199, strictPort: false } })
    await server.listen()
    baseUrl = server.resolvedUrls?.local[0] ?? 'http://localhost:5199/'
  }
  browser = await chromium.launch({ headless: !process.env.HEADED })
})

Before(async function (this: AppWorld) {
  this.baseUrl = baseUrl
  this.context = await browser.newContext()
  this.page = await this.context.newPage()
})

After(async function (this: AppWorld, { result }) {
  if (result?.status === Status.FAILED && this.page) {
    const png = await this.page.screenshot({ fullPage: true })
    this.attach(png, 'image/png')
  }
  await this.context?.close()
})

AfterAll(async function () {
  await browser?.close()
  await server?.close()
})
