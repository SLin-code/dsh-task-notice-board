/**
 * Build config for dsh-task-notice-board.
 *
 * Two artifacts: the Node-side ESM library (host half + tools + sync entries)
 * and one Browser-side CJS bundle for the client half. The client bundle
 * follows deepseek-harness's __ModuleLoader__ contract exactly — a CJS entry
 * wrapped in a `window.__ModuleLoader__.load({ id, factory })` call — so the
 * harness `dsh-client-modules` scanner picks the bundle up via the
 * `exports["./client"]` and `dsh.client.platform === "web"` declarations in
 * package.json without any harness-side patch.
 */
import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import { defineConfig, type UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

/** Package identity stamped into the loader hand-off and per-stylesheet `<style>` tags. */
const PLUGIN_ID = 'dsh-task-notice-board'

/**
 * Modules the harness browser shell already publishes into its frozen module
 * table (see `packages/client/web/src/platform.ts` in deepseek-harness). Every
 * entry here becomes an external for our client bundle — the loader answers
 * the `require(id)` call with the shared runtime instance, keeping cordis
 * services, slot identity, and React hooks single-instance across plugins.
 */
const CLIENT_EXTERNALS: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  // Runtime store engine seat — deepseek-harness documents this as a
  // deliberate exemption; the runtime package registers its factory in the
  // module table before any dependent bundle materializes.
  '@deepseek-ai/dsh-client-runtime/client',
]

/**
 * Rolldown/tsdown plugin: compile `.module.css` through lightningcss inside
 * the bundle. Every stylesheet auto-injects one `<style data-plugin="...">`
 * tag at factory-execution time (idempotent under re-evaluation), and the
 * `default` export is the hashed class-name map. Matches the deepseek-harness
 * client-bundle pipeline so styling behaves the same in both trees.
 */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

const cssModulesPlugin = {
  name: 'dsh-css-modules-inline',
  resolveId(sourceOrOptions: string | { id: string; importer?: string }, maybeImporter?: string | undefined) {
    // Same shape-negotiation as `load`: rolldown ≥ 1.x can hand us an object
    // `{ id, importer }` where older versions pass positional arguments.
    const source = typeof sourceOrOptions === 'string' ? sourceOrOptions : sourceOrOptions.id
    const importer = typeof sourceOrOptions === 'string' ? maybeImporter : sourceOrOptions.importer
    if (!source.endsWith('.module.css')) return null
    const abs = importer !== undefined ? resolvePath(dirname(importer), source) : source
    return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
  },
  async load(idOrOptions: string | { id: string }) {
    // Newer rolldown ships an options object with an `id` field to `load`;
    // older versions pass the id as a bare string. Both are supported here.
    const virtualId = typeof idOrOptions === 'string' ? idOrOptions : idOrOptions.id
    if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
    const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
    // The virtual id would otherwise hide the stylesheet from rolldown's watch graph.
    ;(this as { addWatchFile?: (file: string) => void }).addWatchFile?.(fileId)
    const source = await readFile(fileId)
    const { code, exports: cssExports } = transform({
      filename: fileId,
      code: source,
      cssModules: { pattern: '[hash]_[local]' },
      minify: true,
    })
    const classMap: Record<string, string> = {}
    for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
    return [
      `const css = ${JSON.stringify(code.toString())};`,
      `const tagId = ${JSON.stringify(`${PLUGIN_ID}/${basename(fileId)}`)};`,
      'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
      '  const tag = document.createElement(\'style\');',
      `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
      '  tag.dataset.pluginCss = tagId;',
      '  tag.textContent = css;',
      '  document.head.appendChild(tag);',
      '}',
      `export default ${JSON.stringify(classMap)};`,
    ].join('\n')
  },
}

/**
 * Node-side ESM library: the host half + patch entries.
 *
 * `target: es2022` is deliberate — the source uses stage-3 decorators
 * (`@Remote` on TaskStore methods), and oxc only lowers them when the target
 * is below es2024. Node 23 does not parse the raw stage-3 syntax as of writing,
 * so an es2024 emit would compile locally then throw
 * `SyntaxError: Invalid or unexpected token` the moment the Harness Loader
 * imports the entry.
 */
/**
 * Node-side ESM library.
 *
 * IMPORTANT: this reads from `lib/**` (tsc's emit), NOT from `src/**`. The
 * source uses stage-3 decorators (`@Remote` on TaskStore methods); rolldown/oxc
 * 1.2 only lowers the *legacy* decorator flavour, which produces `__decorate`
 * helper calls whose signature is not what Typert's `Remote` runtime function
 * expects — a legacy lowering compiles clean but throws
 * `typert-protocol: Remote decorators require a public instance method with a
 * string name` at import time. TypeScript's own emit implements the stage-3
 * runtime semantics correctly, so the `prepare` / `build` script runs
 * `tsc -b tsconfig.build.json` first and this bundler stage only bundles the
 * already-lowered JS.
 */
const nodeConfig: UserConfig = {
  entry: [
    'lib/index.js',
    'lib/task/index.js',
    'lib/task-context-sync/index.js',
    'lib/tool-task-context/index.js',
  ],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'es2022',
  // tsc already produced .d.ts alongside the .js in lib/; the copy-dts step
  // below moves them into place so consumers see them at dist/.
  dts: false,
  clean: true,
  sourcemap: true,
}

/**
 * Browser-side CJS bundle: `dist/client.js`, matching the harness contract.
 *
 * A `<script>` served from `/plugins/dsh-task-notice-board/client.js?rev=...`
 * runs this bundle inside a factory closure the harness's `__ModuleLoader__`
 * pushed a `require` into. The banner/footer wrapping IS the contract — the
 * loader looks for exactly this call shape.
 */
const clientConfig: UserConfig = {
  entry: { client: 'src/client/index.ts' },
  outDir: 'dist',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  // Anything not in the shared platform table must inline: the loader's
  // frozen module table cannot answer a `require` for an ordinary npm
  // dependency, so a missed inline is a runtime throw. tsdown auto-externalizes
  // package deps by default; noExternal overrides that back to "inline unless
  // external above wins".
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  plugins: [cssModulesPlugin],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([nodeConfig, clientConfig])
