/**
 * Direct fetch-based caller for the host TaskStore's Typert Remote face.
 *
 * Why not `ctx.remote.taskBoard.*`? — `ctx.remote` on the browser is a proxy
 * built from an explicit list of `TypertRemoteContribution` artefacts that
 * `@deepseek-ai/dsh-api-remotes` mounts at boot (see `packages/api/remotes/src/
 * client/index.ts` in the harness: only commands / goals / cordis / plugin
 * inventory / message-feedback are `$mount`ed). A third-party plugin has no
 * way to register a new namespace on that proxy without a compiled Typert
 * contribution — a build-time artefact this plugin does not (and can not
 * cheaply) produce. So we bypass the typed proxy and speak the Connection
 * RPC wire protocol directly. Server-side the Gateway resolves the endpoint
 * through its SRC reflection (see `packages/api/gateway/src/index.ts`) — the
 * host's `@Remote`-decorated TaskStore methods answer identically regardless
 * of whether the client came through the typed proxy or a plain fetch.
 */

import type {
  TaskAssignment,
  TaskCreateInput,
  TaskId,
  TaskUpdateInput,
  TaskView,
} from '../task/types.ts'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

/** Namespace the host TaskStore binds via `super(ctx, 'tasks', { namespace: 'taskBoard' })`. */
const NAMESPACE = 'taskBoard'

/** RPC channel the Connection Gateway listens on. */
const CHANNEL = '/api'

/**
 * Client-side face of the host TaskStore. Every method maps one-to-one to a
 * `@Remote`-decorated method on the host class.
 */
export interface TaskBoardRemote {
  create(input: TaskCreateInput): Promise<TaskView>
  get(id: TaskId): Promise<TaskView | undefined>
  list(): Promise<readonly TaskView[]>
  update(id: TaskId, expectedRevision: number, input: TaskUpdateInput): Promise<TaskView>
  assignSession(sessionId: SessionId, taskId: TaskId): Promise<TaskAssignment>
  unassignSession(sessionId: SessionId): Promise<boolean>
  getAssignment(sessionId: SessionId): Promise<TaskAssignment | undefined>
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
  const endpoint = `${NAMESPACE}/${method}`
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
  assignSession: (sessionId, taskId) => invoke('assignSession', { sessionId, taskId }),
  unassignSession: (sessionId) => invoke('unassignSession', { sessionId }),
  getAssignment: (sessionId) => invoke('getAssignment', { sessionId }),
}
