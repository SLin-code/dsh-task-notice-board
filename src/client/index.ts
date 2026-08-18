/**
 * Browser half of dsh-task-notice-board.
 *
 * Contributes one entry to `sidebar.footer.action` — a small icon that sits
 * next to the Settings gear at the bottom of the sidebar and opens the Task
 * Board as a centered modal (portalled to document.body by the modal
 * primitive). The board is deliberately session-independent so it stays
 * reachable whether the user has a Session open or is still on the hero
 * page: every open Session lookup is driven by the framework-injected
 * `sessionId` at the moment the user is on that Session.
 *
 * All Task reads and writes ride `ctx.remote.taskBoard.*` — served by the
 * host TaskStore's TypertRemoteService binding, routed by Cordis Gateway's
 * SRC reflection, and therefore requires no static registration on the
 * harness side. Copy is localized through `ctx.locale`, namespace
 * `taskBoard`.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pull the api-remotes client merge (ctx.remote).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pull the ui-locale merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pull the sidebar SlotMap merge (`sidebar.footer.action`).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { TaskBoardAction, type TaskBoardActionInjected } from './TaskBoardAction.tsx'
import { en, zh, type TaskBoardKey } from './locales.ts'
import type {
  TaskAssignment,
  TaskCreateInput,
  TaskId,
  TaskUpdateInput,
  TaskView,
} from '../task/types.ts'

/**
 * Extend the Typert remote namespace map with the `taskBoard` face served by
 * host TaskStore.
 */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    taskBoard: {
      create(input: TaskCreateInput): Promise<TaskView>
      get(id: TaskId): Promise<TaskView | undefined>
      list(): Promise<readonly TaskView[]>
      update(id: TaskId, expectedRevision: number, input: TaskUpdateInput): Promise<TaskView>
      assignSession(sessionId: SessionId, taskId: TaskId): Promise<TaskAssignment>
      unassignSession(sessionId: SessionId): Promise<boolean>
      getAssignment(sessionId: SessionId): Promise<TaskAssignment | undefined>
    }
  }
}

/** Extend the locale namespace map with this plugin's key set. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Task Board copy: sidebar action label, modal title, buttons, banners, form fields. */
    taskBoard: TaskBoardKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'taskBoard'

/**
 * Required client-side services. `sessions` supplies the current-session id
 * to the click handler; `locale` is the standard-kit locale seat; `slots`
 * and `remote` are consumed by the action's inject face.
 */
export const inject = ['slots', 'remote', 'locale', 'sessions']

/**
 * Client plugin body.
 *
 * The two effects register in a specific order: `ctx.locale.register` first
 * so the sidebar action's registration-time `label` thunk (also read from
 * the standard-kit `t`) has dictionaries to consult, then the slot
 * registration itself. Both are wrapped in `ctx.effect`, so unloading the
 * plugin removes them cleanly.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  // Runtime service accessor. Multiple pnpm-resolved copies of
  // @deepseek-ai/cordis can make the cross-package declare-merge for
  // `ctx.sessions` land on a different Context realm than the one our
  // type-only import sees at build time, so the direct read compiles as a
  // node-lib `Session[]` getter. Reaching through this typed accessor pins
  // the shape to the runtime's actual ISessions face; the runtime resolves
  // the service by name regardless of type-realm identity.
  const sessions = () => (ctx as unknown as { sessions: ISessions }).sessions

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'task-notice-board: dictionaries')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'task-board',
    order: 10,
    locale: NS,
    // Root-scoped: this action never binds a Session; every remote call
    // reads the *current* session id off the runtime's list snapshot at
    // click time. The read is intentionally imperative (not a hook) — the
    // action does not need to re-render on session change.
    inject: (): TaskBoardActionInjected => ({
      remote: ctx.remote.taskBoard,
      currentSessionId: () => sessions().list.getSnapshot().current,
    }),
  }, TaskBoardAction))
}
