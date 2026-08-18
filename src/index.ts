/**
 * Aggregated Cordis entry for dsh-task-notice-board.
 *
 * The harness `dsh-client-modules` scanner resolves a plugin's browser bundle
 * through `require.resolve('<name>/package.json')`, which only works when the
 * loader entry's `name` is a bare npm package specifier. So this package
 * exposes exactly one plugin — bound to the package name — and forwards the
 * three internal seats (durable Task store, context projection, model tools)
 * off a single nested config through the child plugins the schemas below
 * describe. Each child keeps its own file (`./task`, `./task-context-sync`,
 * `./tool-task-context`) so it stays independently testable; only the
 * externally-visible Cordis registration is unified.
 */

import type { Context } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import {
  TaskStore,
  type Config as TaskStoreConfig,
} from './task/index.ts'
import {
  apply as applyTaskContextSync,
  Config as TaskContextSyncConfigSchema,
  type Config as TaskContextSyncConfig,
} from './task-context-sync/index.ts'
import {
  apply as applyTaskContextTools,
  Config as TaskContextToolsConfigSchema,
  type Config as TaskContextToolsConfig,
} from './tool-task-context/index.ts'

export * from './task/index.ts'
export { renderTaskContext } from './task-context-sync/index.ts'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'dsh-task-notice-board'

/**
 * Deployment-selected bounds for every part of the bundle. Grouped by seat
 * so a Web-profile patch overrides one seat's limits without restating the
 * others.
 */
export interface Config {
  readonly task: TaskStoreConfig
  readonly contextSync: TaskContextSyncConfig
  readonly contextTools: TaskContextToolsConfig
}

/** Schemastery composition; each seat validates independently. */
export const Config: s<Config> = s.object({
  task: TaskStore.Config,
  contextSync: TaskContextSyncConfigSchema,
  contextTools: TaskContextToolsConfigSchema,
})

/**
 * Aggregate apply: mount the durable Task store, then compose the two
 * dependent child plugins under their own fibers. Cordis' `ctx.plugin`
 * respects each child's `inject` list, so the fibers wait until
 * `ctx.tasks` (provided by TaskStore) settles.
 * @param ctx - the profile-scoped Cordis context.
 * @param config - three-seat configuration validated by the schema above.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(TaskStore, config.task)
  ctx.plugin(applyTaskContextSync, config.contextSync)
  ctx.plugin(applyTaskContextTools, config.contextTools)
}
