import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/task/index.ts',
    'src/task-context-sync/index.ts',
    'src/tool-task-context/index.ts',
  ],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: true,
  clean: true,
  sourcemap: true,
})
