/** Public Task records and opaque identifiers. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-remotes/client'
import type { CallId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** Stable identity of one durable Task. */
export type TaskId = Branded<'TaskId'>

/** Stable identity of one retained Task context entry. */
export type TaskContextEntryId = Branded<'TaskContextEntryId'>

/** User-controlled Task lifecycle. */
export type TaskStatus = 'open' | 'closed'

/** Task Board lane. Runtime pending interactions may temporarily promote a Task to review. */
export type TaskBoardStatus = 'backlog' | 'in_progress' | 'review' | 'done'

/** Semantic class of one Task-scoped long-term memory. */
export type TaskMemoryKind = 'summary' | 'decision' | 'finding' | 'blocker' | 'evidence' | 'handoff'

/** Human verification state for retained Task memory. */
export type TaskMemoryVerification = 'unverified' | 'verified' | 'superseded'

/** Provenance of one advisory context entry published by an assigned Session. */
export interface TaskContextEntrySessionSource {
  readonly kind: 'session'
  readonly sessionId: SessionId
  readonly sessionCreatedAt: number
  readonly callId: CallId
}

/** Provenance of one memory entered directly by the user in the control center. */
export interface TaskContextEntryUserSource {
  readonly kind: 'user'
}

/** Provenance of one Task memory. Raw transcripts are never retained here. */
export type TaskContextEntrySource = TaskContextEntrySessionSource | TaskContextEntryUserSource

/** One retained, advisory cross-Session update. */
export interface TaskContextEntry {
  readonly id: TaskContextEntryId
  readonly revision: number
  readonly kind: TaskMemoryKind
  readonly verification: TaskMemoryVerification
  readonly text: string
  readonly source: TaskContextEntrySource
  readonly createdAt: number
}

/** Immutable caller projection of one Task and its retained context. */
export interface TaskView {
  readonly id: TaskId
  readonly workspaceId?: WorkspaceId
  readonly key: string
  readonly title: string
  readonly objective: string
  readonly acceptanceCriteria: string
  readonly owner: string
  readonly status: TaskStatus
  readonly boardStatus: TaskBoardStatus
  /** Archived Tasks are hidden from the active board but remain recoverable. */
  readonly archived: boolean
  readonly archivedAt?: number
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

/** One user-visible message projected from a Session's durable event log. */
export interface TaskTranscriptMessage {
  readonly seq: number
  readonly time: number
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly textTruncated: boolean
  readonly imageCount: number
  readonly toolNames: readonly string[]
  readonly provider?: string
  readonly model?: string
}

/** A newest-first window returned in chronological order for an assigned Session. */
export interface TaskTranscriptPage {
  readonly taskId: TaskId
  readonly sessionId: SessionId
  readonly sessionCreatedAt: number
  readonly items: readonly TaskTranscriptMessage[]
  readonly hasMore: boolean
  readonly nextBeforeSeq?: number
}

/** Inputs that create the user-owned portion of a Task. */
export interface TaskCreateInput {
  readonly workspaceId: WorkspaceId
  readonly title: string
  readonly objective: string
  readonly acceptanceCriteria?: string
  readonly owner?: string
}

/** Compare-and-set replacement of user-owned Task fields. */
export interface TaskUpdateInput {
  readonly title?: string
  readonly objective?: string
  readonly acceptanceCriteria?: string
  readonly owner?: string
  readonly status?: TaskStatus
  readonly boardStatus?: TaskBoardStatus
  /** Archive or restore the Task. Archiving closes it; restoring returns it to backlog. */
  readonly archived?: boolean
}

/** User-authored Task memory input. */
export interface TaskMemoryCreateInput {
  readonly kind: TaskMemoryKind
  readonly text: string
}

/** Result of an idempotent Session context publication. */
export interface TaskContextPublishResult {
  readonly task: TaskView
  readonly entry: TaskContextEntry
  readonly deduplicated: boolean
}
