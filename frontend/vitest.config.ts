import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// defineConfig accepts either a config object or a function that returns one,
// so the plugins array is taken from the object-shaped member of that union.
type VitestConfig = Extract<Parameters<typeof defineConfig>[0], { plugins?: unknown }>

// vitest resolves its own nested copy of vite, so the Plugin type that
// @vitejs/plugin-react returns comes from a different vite install than the one
// defineConfig expects. The plugin objects are structurally identical and work
// at runtime; only the nominal type identity differs. Deriving the expected
// type from defineConfig itself keeps this tied to whatever version is
// installed, and the real fix is deduplicating vite, which is a dependency
// change rather than a config one.
const plugins = [react()] as unknown as NonNullable<VitestConfig['plugins']>

export default defineConfig({
  plugins,
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
  },
})
