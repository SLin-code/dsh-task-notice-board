/**
 * Direct fetch caller for the TaskStore's dedicated Connection RPC channel.
 * A third-party package cannot add a method to the browser's build-time
 * `ctx.remote` contribution table. A separate generic channel also avoids
 * coupling runtime discovery to whichever copy of the Typert protocol the
 * host application loaded.
 */

import type {
  TaskAssignment,
  TaskContextEntryId,
  TaskCreateInput,
  TaskId,
  TaskMemoryCreateInput,
  TaskMemoryVerification,
  TaskTranscriptPage,
  TaskUpdateInput,
  TaskView,
} from '../task/types.ts'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

/** Dedicated generic Connection channel registered by the host TaskStore. */
const CHANNEL = '/task-board-rpc'

/**
 * Client-side face of the host TaskStore. Every method maps one-to-one to a
 * `@Remote`-decorated method on the host class.
 */
export interface TaskBoardRemote {
  create(input: TaskCreateInput): Promise<TaskView>
  get(id: TaskId): Promise<TaskView | undefined>
  list(): Promise<readonly TaskView[]>
  update(id: TaskId, expectedRevision: number, input: TaskUpdateInput): Promise<TaskView>
  remove(id: TaskId, expectedRevision: number): Promise<boolean>
  listAssignments(): Promise<readonly TaskAssignment[]>
  assignSession(sessionId: SessionId, taskId: TaskId): Promise<TaskAssignment>
  unassignSession(sessionId: SessionId): Promise<boolean>
  getAssignment(sessionId: SessionId): Promise<TaskAssignment | undefined>
  getTaskForSession(sessionId: SessionId): Promise<TaskView | undefined>
  readSessionTranscript(taskId: TaskId, sessionId: SessionId, beforeSeq?: number): Promise<TaskTranscriptPage>
  addMemory(id: TaskId, expectedRevision: number, input: TaskMemoryCreateInput): Promise<TaskView>
  setMemoryVerification(
    id: TaskId,
    entryId: TaskContextEntryId,
    expectedRevision: number,
    verification: TaskMemoryVerification,
  ): Promise<TaskView>
}

/** Server response envelope, matching the harness's `serverResponseSchema`. */
interface ServerResponseEnvelope<T = unknown> {
  readonly type: 'server-response'
  readonly rpcId: string
  readonly result:
    | { readonly ok: true, readonly value: T }
    | { readonly ok: false, readonly error: { readonly code: string, readonly message: string, readonly details?: unknown } }
}

/**
 * Random request-correlation id. Uses `crypto.randomUUID` when available and
 * falls back to a hand-rolled string on older environments — either serves
 * only as an echoed opaque handle for the response envelope.
 */
function newRpcId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID !== undefined) return c.randomUUID()
  return `dsh-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Invoke one remote method under the `taskBoard` namespace.
 * @param method - remote method name (e.g. `list`, `create`).
 * @param args - the method's named arguments, exactly as the host expects.
 * @returns the validated business result, or throws on transport / business
 * failures with a message suitable for surfacing in the UI.
 */
async function invoke<T>(method: string, args: Readonly<Record<string, unknown>>): Promise<T> {
  const endpoint = method
  const rpcId = newRpcId()
  const message = {
    type: 'client-request',
    rpcId,
    method: endpoint,
    payload: { args },
  }
  const response = await globalThis.fetch(`${CHANNEL}/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  })
  if (!response.ok) {
    throw new Error(`transport failure for ${endpoint}: HTTP ${response.status}`)
  }
  const envelope = await response.json() as ServerResponseEnvelope<T>
  if (envelope.type !== 'server-response') {
    throw new Error(`unexpected envelope for ${endpoint}: ${JSON.stringify(envelope).slice(0, 200)}`)
  }
  if (envelope.rpcId !== rpcId) {
    throw new Error(`rpcId mismatch for ${endpoint}: sent ${rpcId}, got ${envelope.rpcId}`)
  }
  if (!envelope.result.ok) {
    const error = envelope.result.error
    throw new Error(`${error.message} (${error.code})`)
  }
  return envelope.result.value
}

/** The one shared instance the UI consumes. */
export const taskBoardRemote: TaskBoardRemote = {
  create: (input) => invoke('create', { input }),
  get: (id) => invoke('get', { id }),
  list: () => invoke('list', {}),
  update: (id, expectedRevision, input) => invoke('update', { id, expectedRevision, input }),
  remove: (id, expectedRevision) => invoke('remove', { id, expectedRevision }),
  listAssignments: () => invoke('listAssignments', {}),
  assignSession: (sessionId, taskId) => invoke('assignSession', { sessionId, taskId }),
  unassignSession: (sessionId) => invoke('unassignSession', { sessionId }),
  getAssignment: (sessionId) => invoke('getAssignment', { sessionId }),
  getTaskForSession: (sessionId) => invoke('getTaskForSession', { sessionId }),
  readSessionTranscript: (taskId, sessionId, beforeSeq) => invoke('readSessionTranscript', {
    taskId,
    sessionId,
    ...(beforeSeq === undefined ? {} : { beforeSeq }),
  }),
  addMemory: (id, expectedRevision, input) => invoke('addMemory', { id, expectedRevision, input }),
  setMemoryVerification: (id, entryId, expectedRevision, verification) =>
    invoke('setMemoryVerification', { id, entryId, expectedRevision, verification }),
}
