/**
 * Browser half of dsh-task-notice-board: contributes one entry to the
 * conversation view slot so an assigned Session gets a Task Board tab
 * beside the chat and trajectory views. All Task reads and writes ride
 * `ctx.remote.taskBoard.*` (namespace declared below and served by the
 * host TaskStore's TypertRemoteService binding).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pull the api-remotes client merge (ctx.remote).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pull the ui-conversation SlotMap merge (`conversation.view`).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TaskBoardView, type TaskBoardInjected } from './TaskBoardView.tsx'
import type {
  TaskAssignment,
  TaskCreateInput,
  TaskId,
  TaskUpdateInput,
  TaskView,
} from '../task/types.ts'

/**
 * Extend the Typert remote namespace map with the `taskBoard` face served by
 * host TaskStore. The host binds this namespace via
 * `super(ctx, 'tasks', { namespace: 'taskBoard' })` and Gateway routes each
 * `@Remote` method by reflection — no static registration required.
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

/** Required client-side services. */
export const inject = ['slots', 'remote']

/**
 * Client plugin body: register the Task Board view tab under
 * `conversation.view`. The registration rides the slot service's effect
 * wrapper, so plugin unload removes the tab automatically.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'task-board',
    order: 20,
    label: () => 'Task Board',
    inject: (sessionId: SessionId): TaskBoardInjected => ({
      sessionId,
      list: () => ctx.remote.taskBoard.list(),
      get: (id) => ctx.remote.taskBoard.get(id),
      create: (input) => ctx.remote.taskBoard.create(input),
      update: (id, expectedRevision, input) =>
        ctx.remote.taskBoard.update(id, expectedRevision, input),
      assignSession: (taskId) => ctx.remote.taskBoard.assignSession(sessionId, taskId),
      unassignSession: () => ctx.remote.taskBoard.unassignSession(sessionId),
      getAssignment: () => ctx.remote.taskBoard.getAssignment(sessionId),
    }),
  }, TaskBoardView))
}
