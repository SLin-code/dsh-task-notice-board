/** Public Task records and opaque identifiers. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { CallId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** Stable identity of one durable Task. */
export type TaskId = Branded<'TaskId'>

/** Stable identity of one retained Task context entry. */
export type TaskContextEntryId = Branded<'TaskContextEntryId'>

/** User-controlled Task lifecycle. */
export type TaskStatus = 'open' | 'closed'

/** Provenance of one advisory context entry published by an assigned Session. */
export interface TaskContextEntrySource {
  readonly kind: 'session'
  readonly sessionId: SessionId
  readonly sessionCreatedAt: number
  readonly callId: CallId
}

/** One retained, advisory cross-Session update. */
export interface TaskContextEntry {
  readonly id: TaskContextEntryId
  readonly revision: number
  readonly text: string
  readonly source: TaskContextEntrySource
  readonly createdAt: number
}

/** Immutable caller projection of one Task and its retained context. */
export interface TaskView {
  readonly id: TaskId
  readonly title: string
  readonly objective: string
  readonly status: TaskStatus
  readonly revision: number
  readonly entries: readonly TaskContextEntry[]
  readonly createdAt: number
  readonly updatedAt: number
}

/** Durable ownership of one Session lifecycle by one Task. */
export interface TaskAssignment {
  readonly sessionId: SessionId
  readonly sessionCreatedAt: number
  readonly taskId: TaskId
  readonly assignedAt: number
}

/** Inputs that create the user-owned portion of a Task. */
export interface TaskCreateInput {
  readonly title: string
  readonly objective: string
}

/** Compare-and-set replacement of user-owned Task fields. */
export interface TaskUpdateInput {
  readonly title?: string
  readonly objective?: string
  readonly status?: TaskStatus
}

/** Result of an idempotent Session context publication. */
export interface TaskContextPublishResult {
  readonly task: TaskView
  readonly entry: TaskContextEntry
  readonly deduplicated: boolean
}
