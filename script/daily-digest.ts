import { readFileSync } from 'node:fs'
import { runDigest } from '../src/lib/digest.ts'

process.exitCode = await runDigest({
  env: process.env,
  readFile: (path) => readFileSync(path, 'utf-8'),
  post: (url, init) => fetch(url, init),
  log: (message) => console.log(message),
  error: (message) => console.error(message),
  now: () => new Date(),
})
