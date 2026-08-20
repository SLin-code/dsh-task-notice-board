/** In-browser navigation bridge between the native Session header and Task Board modal. */

import type { TaskId } from '../task/types.ts'

export interface TaskBoardOpenRequest {
  readonly revision: number
  readonly taskId: TaskId
}

type Listener = () => void

let request: TaskBoardOpenRequest | null = null
let revision = 0
const listeners = new Set<Listener>()
let ownershipRevision = 0
const ownershipListeners = new Set<Listener>()

/** Publish a request to open the Task Board directly at one Task. */
export function requestTaskBoardTask(taskId: TaskId): void {
  revision += 1
  request = Object.freeze({ revision, taskId })
  for (const listener of listeners) listener()
}

/** Snapshot reader for React's external-store contract. */
export function getTaskBoardOpenRequest(): TaskBoardOpenRequest | null {
  return request
}

/** Subscribe to Task Board navigation requests. */
export function subscribeTaskBoardOpenRequest(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Invalidate cached Session-to-Task ownership after a local Task mutation. */
export function invalidateTaskOwnership(): void {
  ownershipRevision += 1
  for (const listener of ownershipListeners) listener()
}

/** Snapshot reader for Session-to-Task ownership invalidation. */
export function getTaskOwnershipRevision(): number {
  return ownershipRevision
}

/** Subscribe to Session-to-Task ownership invalidation. */
export function subscribeTaskOwnership(listener: Listener): () => void {
  ownershipListeners.add(listener)
  return () => { ownershipListeners.delete(listener) }
}
