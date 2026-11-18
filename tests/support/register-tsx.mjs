// Registers the tsx ESM loader so cucumber-js can import TypeScript/TSX sources.
import { register } from 'tsx/esm/api'

register({ tsconfig: 'tsconfig.app.json' })
