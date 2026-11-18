import { setDefaultTimeout, setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber'
import type { BrowserContext, Page } from 'playwright'

// Browser launch + first page load can exceed cucumber's 5s default.
setDefaultTimeout(30_000)

/**
 * Shared per-scenario state. `page` and `baseUrl` are populated by the hooks in
 * `hooks.ts`, so every step definition can drive the running app end to end:
 *
 *   When('I open the dashboard', async function (this: AppWorld) {
 *     await this.page.goto(this.baseUrl)
 *   })
 */
export class AppWorld extends World {
  baseUrl = ''
  context!: BrowserContext
  page!: Page

  constructor(options: IWorldOptions) {
    super(options)
  }
}

setWorldConstructor(AppWorld)
