/**
 * Post-build step: copy tsc's .d.ts emit from `lib/` alongside the tsdown
 * runtime output in `dist/`, renaming to .d.mts so the ESM `exports` block
 * resolves them correctly.
 *
 * tsc runs first (stage-3 decorator lowering the bundler can't do), tsdown
 * only bundles the already-lowered .js, and the .d.ts tsc produced is the
 * one truth for type consumers. Copying is simpler than reconfiguring
 * tsdown to consume tsc's declaration output.
 */
import { mkdir, readdir, copyFile, stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const LIB = join(ROOT, 'lib')
const DIST = join(ROOT, 'dist')

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(abs)
    else yield abs
  }
}

async function main() {
  try {
    await stat(LIB)
  } catch {
    throw new Error(`copy-dts: ${LIB} does not exist — run tsc first`)
  }
  let copied = 0
  for await (const src of walk(LIB)) {
    if (!src.endsWith('.d.ts')) continue
    const rel = relative(LIB, src)
    const dest = join(DIST, rel.replace(/\.d\.ts$/, '.d.mts'))
    await mkdir(dirname(dest), { recursive: true })
    await copyFile(src, dest)
    copied += 1
  }
  process.stdout.write(`copy-dts: ${copied} declaration file(s) copied into dist/\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
