/** Durable Task store and Session ownership for cross-Session collaboration. */

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { CallId, ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { taskDomainSpec } from './spec.ts'
import type { TaskAssignmentRecord, TaskContextEntryRecord, TaskRecord } from './spec.ts'
import type {
  TaskAssignment,
  TaskContextEntry,
  TaskContextEntryId,
  TaskContextPublishResult,
  TaskCreateInput,
  TaskId as TaskIdBrand,
  TaskMemoryCreateInput,
  TaskMemoryKind,
  TaskMemoryVerification,
  TaskTranscriptMessage,
  TaskTranscriptPage,
  TaskUpdateInput,
  TaskView,
} from './types.ts'

export type * from './types.ts'
export {
  taskAssignmentRecordSchema,
  taskContextEntryRecordSchema,
  taskDomainSpec,
  taskRecordSchema,
} from './spec.ts'
export type { TaskAssignmentRecord, TaskContextEntryRecord, TaskRecord } from './spec.ts'

/** Stable identity of one durable Task. */
export type TaskId = TaskIdBrand

/**
 * Brand a raw string as a Task id without validating its existence.
 * @param value - Opaque value supplied by a trusted Task API or durable parser.
 * @returns the branded Task id.
 */
export function TaskId(value: string): TaskId {
  return value as TaskId
}

/** Deployment-selected storage bounds. */
export interface Config {
  /** Maximum UTF-8 bytes in a Task title. */
  readonly maxTitleBytes: number
  /** Maximum UTF-8 bytes in a user-owned Task objective. */
  readonly maxObjectiveBytes: number
  /** Maximum UTF-8 bytes in one published advisory entry. */
  readonly maxEntryBytes: number
  /** Maximum advisory entries retained in each Task row. */
  readonly maxEntries: number
}

interface ResolvedConfig extends Config {}

interface TaskBoardRpcResult {
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: { readonly code: 'internal'; readonly message: string; readonly details: {} }
}

interface TaskBoardConnection {
  readonly rpc: {
    handle(
      channel: string,
      handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<TaskBoardRpcResult>,
      options: { readonly authority: 'trusted-host' | 'loopback' },
    ): () => Promise<void>
  }
}

const TRANSCRIPT_PAGE_SIZE = 60
const MAX_TRANSCRIPT_TEXT_CHARS = 40_000
const MAX_TRANSCRIPT_PAGE_BYTES = 512_000
const MAX_TRANSCRIPT_TOOL_NAMES = 100
const MAX_TRANSCRIPT_TOOL_NAME_CHARS = 256

function transcriptContent(content: readonly ContentBlock[]): {
  text: string
  textTruncated: boolean
  imageCount: number
  toolNames: readonly string[]
} {
  const textParts: string[] = []
  const toolNames: string[] = []
  let imageCount = 0
  for (const block of content) {
    if (block.type === 'text') textParts.push(block.text)
    else if (block.type === 'image') imageCount += 1
    else if (block.type === 'tool-call' && toolNames.length < MAX_TRANSCRIPT_TOOL_NAMES) {
      toolNames.push(block.name.slice(0, MAX_TRANSCRIPT_TOOL_NAME_CHARS))
    }
  }
  const completeText = textParts.join('\n').trim()
  const textTruncated = completeText.length > MAX_TRANSCRIPT_TEXT_CHARS
  return Object.freeze({
    text: textTruncated ? completeText.slice(0, MAX_TRANSCRIPT_TEXT_CHARS) : completeText,
    textTruncated,
    imageCount,
    toolNames: Object.freeze(toolNames),
  })
}

/** Project only human-authored prompts and user-visible assistant output from a raw Session log. */
export function projectTaskTranscript(events: readonly SessionEvent[]): readonly TaskTranscriptMessage[] {
  const items: TaskTranscriptMessage[] = []
  for (const event of events) {
    const item = projectTranscriptEvent(event)
    if (item !== undefined) items.push(item)
  }
  return Object.freeze(items)
}

function projectTranscriptEvent(event: SessionEvent): TaskTranscriptMessage | undefined {
  if (event.type === 'user/message') {
    if (event.data.source.kind !== 'user') return undefined
    const content = transcriptContent(event.data.content)
    if (content.text === '' && content.imageCount === 0) return undefined
    return Object.freeze({ seq: event.seq, time: event.time, role: 'user', ...content })
  }
  if (event.type !== 'assistant/message') return undefined
  const content = transcriptContent(event.data.message.content)
  if (content.text === '' && content.imageCount === 0 && content.toolNames.length === 0) return undefined
  return Object.freeze({
    seq: event.seq,
    time: event.time,
    role: 'assistant',
    ...content,
    provider: event.data.message.source.provider,
    model: event.data.message.source.model,
  })
}

/** Select one bounded newest-first window without projecting the complete log. */
export function projectTaskTranscriptPage(
  events: readonly SessionEvent[],
  beforeSeq?: number,
): { readonly items: readonly TaskTranscriptMessage[]; readonly hasMore: boolean; readonly nextBeforeSeq?: number } {
  const newestFirst: TaskTranscriptMessage[] = []
  let bytes = 0
  let hasMore = false
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!
    if (beforeSeq !== undefined && event.seq >= beforeSeq) continue
    const item = projectTranscriptEvent(event)
    if (item === undefined) continue
    const itemBytes = Buffer.byteLength(JSON.stringify(item), 'utf8')
    if (newestFirst.length >= TRANSCRIPT_PAGE_SIZE
      || (newestFirst.length > 0 && bytes + itemBytes > MAX_TRANSCRIPT_PAGE_BYTES)) {
      hasMore = true
      break
    }
    newestFirst.push(item)
    bytes += itemBytes
  }
  const items = Object.freeze(newestFirst.reverse())
  return Object.freeze({
    items,
    hasMore,
    ...(hasMore && items[0] !== undefined ? { nextBeforeSeq: items[0].seq } : {}),
  })
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tasks: TaskStore
  }
}

/** A request named no durable Task. */
export class TaskNotFoundError extends Error {
  constructor(readonly taskId: TaskId) {
    super(`task '${taskId}' does not exist`)
    this.name = 'TaskNotFoundError'
  }
}

/** A Session operation has no current lifecycle assignment. */
export class TaskSessionNotAssignedError extends Error {
  constructor(readonly sessionId: SessionId) {
    super(`session '${sessionId}' is not assigned to a task`)
    this.name = 'TaskSessionNotAssignedError'
  }
}

/** A request tried to move a Session after its first model step began. */
export class TaskSessionReassignmentError extends Error {
  constructor(readonly sessionId: SessionId) {
    super(`session '${sessionId}' cannot change tasks after its first step has started`)
    this.name = 'TaskSessionReassignmentError'
  }
}

/** A compare-and-set Task mutation used a stale revision. */
export class TaskRevisionConflictError extends Error {
  constructor(readonly taskId: TaskId, readonly expected: number, readonly actual: number) {
    super(`task '${taskId}' revision conflict: expected ${expected}, current ${actual}`)
    this.name = 'TaskRevisionConflictError'
  }
}

/** A closed Task rejected a new collaborative update. */
export class TaskClosedError extends Error {
  constructor(readonly taskId: TaskId) {
    super(`task '${taskId}' is closed`)
    this.name = 'TaskClosedError'
  }
}

/** One publication identity was reused with different text. */
export class TaskContextIdempotencyConflictError extends Error {
  constructor(readonly taskId: TaskId, readonly callId: CallId) {
    super(`task '${taskId}' already records call '${callId}' with different context`)
    this.name = 'TaskContextIdempotencyConflictError'
  }
}

function resolvePositiveSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`task: ${name} must be a positive safe integer, got ${String(value)}`)
  }
  return value
}

function resolveConfig(config: Config): ResolvedConfig {
  return Object.freeze({
    maxTitleBytes: resolvePositiveSafeInteger('maxTitleBytes', config.maxTitleBytes),
    maxObjectiveBytes: resolvePositiveSafeInteger('maxObjectiveBytes', config.maxObjectiveBytes),
    maxEntryBytes: resolvePositiveSafeInteger('maxEntryBytes', config.maxEntryBytes),
    maxEntries: resolvePositiveSafeInteger('maxEntries', config.maxEntries),
  })
}

function validateText(name: string, value: string, maxBytes: number): void {
  if (value.trim().length === 0) throw new TypeError(`task: ${name} must contain a non-whitespace character`)
  const bytes = Buffer.byteLength(value, 'utf8')
  if (bytes > maxBytes) throw new RangeError(`task: ${name} is ${bytes} UTF-8 bytes; maximum is ${maxBytes}`)
}

function validateOptionalText(name: string, value: string, maxBytes: number): void {
  const bytes = Buffer.byteLength(value, 'utf8')
  if (bytes > maxBytes) throw new RangeError(`task: ${name} is ${bytes} UTF-8 bytes; maximum is ${maxBytes}`)
}

function snapshotEntry(entry: TaskContextEntryRecord): TaskContextEntry {
  return Object.freeze({
    id: entry.id,
    revision: entry.revision,
    kind: entry.kind ?? 'finding',
    verification: entry.verification ?? 'unverified',
    text: entry.text,
    source: Object.freeze({ ...entry.source }),
    createdAt: entry.createdAt,
  })
}

function snapshotTask(id: TaskId, record: TaskRecord): TaskView {
  return Object.freeze({
    id,
    ...(record.workspaceId === undefined
      ? {}
      : { workspaceId: record.workspaceId as NonNullable<TaskView['workspaceId']> }),
    key: record.key ?? `TASK-${String(id).slice(0, 6).toUpperCase()}`,
    title: record.title,
    objective: record.objective,
    acceptanceCriteria: record.acceptanceCriteria ?? '',
    owner: record.owner ?? '',
    status: record.status,
    boardStatus: record.boardStatus ?? (record.status === 'closed' ? 'done' : 'backlog'),
    archived: record.archivedAt !== undefined,
    ...(record.archivedAt === undefined ? {} : { archivedAt: record.archivedAt }),
    revision: record.revision,
    entries: Object.freeze(record.entries.map(snapshotEntry)),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })
}

function hasStarted(events: readonly SessionEvent[]): boolean {
  return events.some(event => event.type === 'step/start')
}

function nextRevision(taskId: TaskId, current: number): number {
  if (current >= Number.MAX_SAFE_INTEGER) throw new RangeError(`task '${taskId}' revision is exhausted`)
  return current + 1
}

/**
 * Durable Task store. Task records and assignments publish only after storage commits.
 *
 * Extends {@link TypertRemoteService} for host reflection and registers a
 * dedicated Connection channel for the separately bundled browser client.
 * Host consumers continue to resolve the service through `ctx.tasks`.
 */
export class TaskStore extends TypertRemoteService {
  static inject = ['sessions', 'sessionPersistence', 'storageDomain', 'connection']

  static Config: s<Config> = s.object({
    maxTitleBytes: s.number().step(1).min(1).required(),
    maxObjectiveBytes: s.number().step(1).min(1).required(),
    maxEntryBytes: s.number().step(1).min(1).required(),
    maxEntries: s.number().step(1).min(1).required(),
  })

  private readonly limits: ResolvedConfig
  private tasksTable?: KvTable<TaskId, TaskRecord>
  private assignmentsTable?: KvTable<SessionId, TaskAssignmentRecord>
  private assignmentTail: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'tasks', { namespace: 'taskBoard' })
    this.limits = resolveConfig(config)
    const connection = (ctx as unknown as { connection: TaskBoardConnection }).connection
    ctx.effect(() => connection.rpc.handle(
      '/task-board-rpc',
      (endpoint, payload) => this.handleRpc(endpoint, payload),
      { authority: 'trusted-host' },
    ), 'task.rpcChannel')
  }

  /** Open the Task domain and reject stored rows outside the active deployment limits. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(taskDomainSpec)
    this.ctx.effect(() => async () => {
      await this.assignmentTail
      await domain.close()
    }, 'task.domainClose')
    this.tasksTable = domain.table('tasks')
    this.assignmentsTable = domain.table('assignments')
    this.validateStoredRows()
  }

  /**
   * Create one open Task with user-owned title and objective.
   * @param input - non-blank title and objective within the configured UTF-8 limits.
   * @returns the committed immutable Task projection at revision 1.
   * @throws {TypeError} when either field is blank.
   * @throws {RangeError} when either field exceeds its configured byte limit.
   */
  @Remote
  async create(input: TaskCreateInput): Promise<TaskView> {
    if (String(input.workspaceId).trim().length === 0) throw new TypeError('task: workspaceId must not be blank')
    validateText('title', input.title, this.limits.maxTitleBytes)
    validateText('objective', input.objective, this.limits.maxObjectiveBytes)
    validateOptionalText('acceptanceCriteria', input.acceptanceCriteria ?? '', this.limits.maxObjectiveBytes)
    validateOptionalText('owner', input.owner ?? '', this.limits.maxTitleBytes)
    const id = TaskId(randomUUID())
    const now = Date.now()
    const record: TaskRecord = {
      workspaceId: input.workspaceId,
      key: `TASK-${String(id).slice(0, 6).toUpperCase()}`,
      title: input.title,
      objective: input.objective,
      acceptanceCriteria: input.acceptanceCriteria ?? '',
      owner: input.owner ?? '',
      status: 'open',
      boardStatus: 'backlog',
      revision: 1,
      entries: [],
      createdAt: now,
      updatedAt: now,
    }
    await this.requireTasks().put(id, record)
    return snapshotTask(id, record)
  }

  /**
   * Return one immutable Task projection.
   * @param id - Task identity to read.
   * @returns a fresh immutable projection, or `undefined` when absent.
   */
  @Remote
  get(id: TaskId): TaskView | undefined {
    const record = this.requireTasks().get(id)
    return record === undefined ? undefined : snapshotTask(id, record)
  }

  /**
   * List Tasks by most recent durable mutation, then stable id.
   * @returns fresh immutable projections in display order.
   */
  @Remote
  list(): readonly TaskView[] {
    return Object.freeze([...this.requireTasks().entries()]
      .sort(([leftId, left], [rightId, right]) =>
        right.updatedAt - left.updatedAt || String(leftId).localeCompare(String(rightId)))
      .map(([id, record]) => snapshotTask(id, record)))
  }

  /**
   * Compare-and-set user-owned Task fields. Equal replacements do not advance revision.
   * @param id - Task identity to mutate.
   * @param expectedRevision - exact current revision required for the mutation.
   * @param input - partial replacement of title, objective, or lifecycle status.
   * @returns the committed immutable Task projection.
   * @throws {TaskNotFoundError} when the Task does not exist.
   * @throws {TaskRevisionConflictError} when `expectedRevision` is stale.
   * @throws {TypeError} when the revision or replacement text is invalid.
   * @throws {RangeError} when replacement text exceeds a configured byte limit.
   */
  @Remote
  async update(id: TaskId, expectedRevision: number, input: TaskUpdateInput): Promise<TaskView> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new TypeError('task: expectedRevision must be a positive safe integer')
    }
    if (input.title !== undefined) validateText('title', input.title, this.limits.maxTitleBytes)
    if (input.objective !== undefined) validateText('objective', input.objective, this.limits.maxObjectiveBytes)
    if (input.acceptanceCriteria !== undefined) {
      validateOptionalText('acceptanceCriteria', input.acceptanceCriteria, this.limits.maxObjectiveBytes)
    }
    if (input.owner !== undefined) validateOptionalText('owner', input.owner, this.limits.maxTitleBytes)
    const table = this.requireTasks()
    if (table.get(id) === undefined) throw new TaskNotFoundError(id)
    const record = await table.update(id, (current) => {
      if (current.revision !== expectedRevision) {
        throw new TaskRevisionConflictError(id, expectedRevision, current.revision)
      }
      const title = input.title ?? current.title
      const objective = input.objective ?? current.objective
      const acceptanceCriteria = input.acceptanceCriteria ?? current.acceptanceCriteria ?? ''
      const owner = input.owner ?? current.owner ?? ''
      const previousBoardStatus = current.boardStatus ?? (current.status === 'closed' ? 'done' : 'backlog')
      const wasArchived = current.archivedAt !== undefined
      const archived = input.archived ?? wasArchived
      const archiveChanged = archived !== wasArchived
      const boardStatus = archiveChanged
        ? (archived ? 'done' : 'backlog')
        : archived
          ? 'done'
          : input.boardStatus ?? (input.status === 'closed'
            ? 'done'
            : input.status === 'open' && previousBoardStatus === 'done' ? 'backlog' : previousBoardStatus)
      const status = archiveChanged
        ? (archived ? 'closed' : 'open')
        : archived
          ? 'closed'
          : input.status ?? (input.boardStatus === 'done' ? 'closed'
            : input.boardStatus !== undefined ? 'open' : current.status)
      const archivedAt = archiveChanged ? (archived ? Date.now() : undefined) : current.archivedAt
      if (title === current.title && objective === current.objective
        && acceptanceCriteria === (current.acceptanceCriteria ?? '')
        && owner === (current.owner ?? '')
        && status === current.status && boardStatus === previousBoardStatus
        && archivedAt === current.archivedAt) return current
      return {
        ...current,
        title,
        objective,
        acceptanceCriteria,
        owner,
        status,
        boardStatus,
        archivedAt,
        revision: nextRevision(id, current.revision),
        updatedAt: Date.now(),
      }
    })
    return snapshotTask(id, record)
  }

  /**
   * Permanently remove one plugin Task, its retained memory, and its Session
   * assignment rows. The underlying DSH Sessions and transcripts are untouched.
   */
  @Remote
  async remove(id: TaskId, expectedRevision: number): Promise<boolean> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new TypeError('task: expectedRevision must be a positive safe integer')
    }
    return this.enqueueAssignment(async () => {
      const tasks = this.requireTasks()
      const current = tasks.get(id)
      if (current === undefined) return false
      if (current.revision !== expectedRevision) {
        throw new TaskRevisionConflictError(id, expectedRevision, current.revision)
      }
      for (const [sessionId, assignment] of this.requireAssignments().entries()) {
        if (assignment.taskId === id) await this.requireAssignments().delete(sessionId)
      }
      return tasks.delete(id)
    })
  }

  /** List all durable Session ownership rows for Task/Session board aggregation. */
  @Remote
  listAssignments(): readonly TaskAssignment[] {
    return Object.freeze([...this.requireAssignments().entries()]
      .sort(([leftId], [rightId]) => String(leftId).localeCompare(String(rightId)))
      .map(([sessionId, record]) => this.snapshotAssignment(sessionId, record)))
  }

  /**
   * Assign one known Session lifecycle. Once model work begins, the owning
   * Task is immutable so one Session cannot silently mix two Task memories.
   * @param sessionId - live or persisted Session identity to assign.
   * @param taskId - open Task that will own this Session lifecycle.
   * @returns the committed assignment, or the existing equal assignment.
   * @throws {TaskNotFoundError} when the Task does not exist.
   * @throws {TaskClosedError} when the Task is closed.
   * @throws {TaskSessionReassignmentError} when work has started under another Task.
   */
  @Remote
  assignSession(sessionId: SessionId, taskId: TaskId): Promise<TaskAssignment> {
    return this.enqueueAssignment(async () => {
      const task = this.requireTasks().get(taskId)
      if (task === undefined) throw new TaskNotFoundError(taskId)
      if (task.status === 'closed') throw new TaskClosedError(taskId)
      const session = await this.inspectSession(sessionId)
      const table = this.requireAssignments()
      const existing = table.get(sessionId)
      if (existing?.sessionCreatedAt === session.header.createdAt && existing.taskId === taskId) {
        return this.snapshotAssignment(sessionId, existing)
      }
      if (existing?.sessionCreatedAt === session.header.createdAt && hasStarted(session.events)) {
        throw new TaskSessionReassignmentError(sessionId)
      }
      const record: TaskAssignmentRecord = {
        taskId,
        sessionCreatedAt: session.header.createdAt,
        assignedAt: Date.now(),
      }
      await table.put(sessionId, record)
      return this.snapshotAssignment(sessionId, record)
    })
  }

  /**
   * Remove the current assignment only before the first model step.
   * @param sessionId - Session identity whose current assignment should be removed.
   * @returns `true` when an assignment row was removed; otherwise `false`.
   * @throws {TaskSessionReassignmentError} when the assigned lifecycle has started work.
   */
  @Remote
  unassignSession(sessionId: SessionId): Promise<boolean> {
    return this.enqueueAssignment(async () => {
      const existing = this.requireAssignments().get(sessionId)
      if (existing === undefined) return false
      const session = await this.inspectSession(sessionId)
      if (existing.sessionCreatedAt !== session.header.createdAt) {
        return this.requireAssignments().delete(sessionId)
      }
      if (hasStarted(session.events)) throw new TaskSessionReassignmentError(sessionId)
      return this.requireAssignments().delete(sessionId)
    })
  }

  /**
   * Return the stored assignment row without asserting a live Session lifecycle.
   * @param sessionId - Session identity used as the assignment key.
   * @returns an immutable assignment, or `undefined` when no row exists.
   */
  @Remote
  getAssignment(sessionId: SessionId): TaskAssignment | undefined {
    const record = this.requireAssignments().get(sessionId)
    return record === undefined ? undefined : this.snapshotAssignment(sessionId, record)
  }

  /** Resolve the Task for the current lifecycle of a persisted Session. */
  @Remote
  async getTaskForSession(sessionId: SessionId): Promise<TaskView | undefined> {
    const assignment = this.requireAssignments().get(sessionId)
    if (assignment === undefined) return undefined
    const inspected = await this.inspectSession(sessionId)
    if (assignment.sessionCreatedAt !== inspected.header.createdAt) return undefined
    return this.get(assignment.taskId)
  }

  /**
   * Read one bounded page of user-visible conversation from a Session still owned by a Task.
   * Internal context injections, reasoning blocks, tool arguments, and tool results are omitted.
   */
  @Remote
  async readSessionTranscript(
    taskId: TaskId,
    sessionId: SessionId,
    beforeSeq?: number,
  ): Promise<TaskTranscriptPage> {
    if (this.requireTasks().get(taskId) === undefined) throw new TaskNotFoundError(taskId)
    const assignment = this.requireAssignments().get(sessionId)
    if (assignment === undefined || assignment.taskId !== taskId) {
      throw new Error(`task: session '${sessionId}' is not assigned to task '${taskId}'`)
    }
    if (beforeSeq !== undefined && (!Number.isSafeInteger(beforeSeq) || beforeSeq < 0)) {
      throw new TypeError('task: beforeSeq must be a non-negative safe integer')
    }
    const inspected = await this.inspectSession(sessionId)
    if (assignment.sessionCreatedAt !== inspected.header.createdAt) {
      throw new Error(`task: session '${sessionId}' assignment belongs to an older lifecycle`)
    }
    const page = projectTaskTranscriptPage(inspected.events, beforeSeq)
    return Object.freeze({
      taskId,
      sessionId,
      sessionCreatedAt: inspected.header.createdAt,
      items: page.items,
      hasMore: page.hasMore,
      ...(page.nextBeforeSeq === undefined ? {} : { nextBeforeSeq: page.nextBeforeSeq }),
    })
  }

  /**
   * Resolve the assignment only when it belongs to this exact Session lifecycle.
   * @param session - Session whose id and creation time fence the lookup.
   * @returns the matching immutable assignment, or `undefined` for absent or stale ownership.
   */
  assignmentFor(session: Session): TaskAssignment | undefined {
    const assignment = this.getAssignment(session.id)
    return assignment?.sessionCreatedAt === session.header.createdAt ? assignment : undefined
  }

  /**
   * Resolve the Task owned by this exact Session lifecycle.
   * @param session - Session whose lifecycle-fenced ownership should be resolved.
   * @returns a fresh immutable Task projection, or `undefined` when no current Task is assigned.
   */
  taskFor(session: Session): TaskView | undefined {
    const assignment = this.assignmentFor(session)
    return assignment === undefined ? undefined : this.get(assignment.taskId)
  }

  /** Add one explicit user-authored Task memory without retaining conversation text. */
  @Remote
  async addMemory(id: TaskId, expectedRevision: number, input: TaskMemoryCreateInput): Promise<TaskView> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new TypeError('task: expectedRevision must be a positive safe integer')
    }
    validateText('context entry', input.text, this.limits.maxEntryBytes)
    const table = this.requireTasks()
    if (table.get(id) === undefined) throw new TaskNotFoundError(id)
    const record = await table.update(id, (current) => {
      if (current.revision !== expectedRevision) {
        throw new TaskRevisionConflictError(id, expectedRevision, current.revision)
      }
      if (current.status === 'closed') throw new TaskClosedError(id)
      const revision = nextRevision(id, current.revision)
      const now = Date.now()
      const entry: TaskContextEntryRecord = {
        id: randomUUID() as TaskContextEntryId,
        revision,
        kind: input.kind,
        verification: 'verified',
        text: input.text,
        source: { kind: 'user' },
        createdAt: now,
      }
      return {
        ...current,
        revision,
        entries: [...current.entries, entry].slice(-this.limits.maxEntries),
        updatedAt: now,
      }
    })
    return snapshotTask(id, record)
  }

  /** Mark one retained memory verified, unverified, or superseded. */
  @Remote
  async setMemoryVerification(
    id: TaskId,
    entryId: TaskContextEntryId,
    expectedRevision: number,
    verification: TaskMemoryVerification,
  ): Promise<TaskView> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new TypeError('task: expectedRevision must be a positive safe integer')
    }
    const table = this.requireTasks()
    if (table.get(id) === undefined) throw new TaskNotFoundError(id)
    const record = await table.update(id, (current) => {
      if (current.revision !== expectedRevision) {
        throw new TaskRevisionConflictError(id, expectedRevision, current.revision)
      }
      const entryIndex = current.entries.findIndex(entry => entry.id === entryId)
      if (entryIndex < 0) throw new Error(`task '${id}' memory '${entryId}' does not exist`)
      const existing = current.entries[entryIndex]!
      if ((existing.verification ?? 'unverified') === verification) return current
      const revision = nextRevision(id, current.revision)
      const entries = [...current.entries]
      entries[entryIndex] = { ...existing, revision, verification }
      return { ...current, revision, entries, updatedAt: Date.now() }
    })
    return snapshotTask(id, record)
  }

  /**
   * Publish one advisory update, idempotent within retained entries by Session lifecycle and call id.
   * @param session - exact Session lifecycle that produced the update.
   * @param callId - Tool call identity used as the retained-entry idempotency key.
   * @param text - non-blank self-contained update within the configured UTF-8 limit.
   * @returns the committed Task, retained entry, and whether an equal publication already existed.
   * @throws {TaskSessionNotAssignedError} when the Session has no current assignment.
   * @throws {TaskNotFoundError} when the assigned Task no longer exists.
   * @throws {TaskClosedError} when the assigned Task is closed.
   * @throws {TaskContextIdempotencyConflictError} when the retained call identity has different text.
   */
  async publishFromSession(
    session: Session,
    callId: CallId,
    text: string,
    kind: TaskMemoryKind = 'finding',
  ): Promise<TaskContextPublishResult> {
    validateText('context entry', text, this.limits.maxEntryBytes)
    const assignment = this.assignmentFor(session)
    if (assignment === undefined) throw new TaskSessionNotAssignedError(session.id)
    const table = this.requireTasks()
    if (table.get(assignment.taskId) === undefined) throw new TaskNotFoundError(assignment.taskId)
    let published: TaskContextEntryRecord | undefined
    let deduplicated = false
    const record = await table.update(assignment.taskId, (current) => {
      if (current.status === 'closed') throw new TaskClosedError(assignment.taskId)
      const existing = current.entries.find(entry =>
        entry.source.kind === 'session'
        && entry.source.sessionId === session.id
        && entry.source.sessionCreatedAt === session.header.createdAt
        && entry.source.callId === callId)
      if (existing !== undefined) {
        if (existing.text !== text || (existing.kind ?? 'finding') !== kind) {
          throw new TaskContextIdempotencyConflictError(assignment.taskId, callId)
        }
        published = existing
        deduplicated = true
        return current
      }
      const revision = nextRevision(assignment.taskId, current.revision)
      const entry: TaskContextEntryRecord = {
        id: randomUUID() as TaskContextEntryId,
        revision,
        kind,
        verification: 'unverified',
        text,
        source: {
          kind: 'session',
          sessionId: session.id,
          sessionCreatedAt: session.header.createdAt,
          callId,
        },
        createdAt: Date.now(),
      }
      published = entry
      return {
        ...current,
        revision,
        entries: [...current.entries, entry].slice(-this.limits.maxEntries),
        updatedAt: entry.createdAt,
      }
    })
    /* v8 ignore next -- KvTable.update invokes the callback exactly once before resolving. */
    if (published === undefined) throw new Error('task publication committed without an entry')
    return Object.freeze({
      task: snapshotTask(assignment.taskId, record),
      entry: snapshotEntry(published),
      deduplicated,
    })
  }

  private validateStoredRows(): void {
    const tasks = this.requireTasks()
    for (const [id, record] of tasks.entries()) {
      validateText(`stored task '${id}' title`, record.title, this.limits.maxTitleBytes)
      validateText(`stored task '${id}' objective`, record.objective, this.limits.maxObjectiveBytes)
      validateOptionalText(`stored task '${id}' acceptance criteria`, record.acceptanceCriteria ?? '', this.limits.maxObjectiveBytes)
      validateOptionalText(`stored task '${id}' owner`, record.owner ?? '', this.limits.maxTitleBytes)
      if (record.entries.length > this.limits.maxEntries) {
        throw new RangeError(`stored task '${id}' has ${record.entries.length} context entries; maximum is ${this.limits.maxEntries}`)
      }
      for (const entry of record.entries) {
        validateText(`stored task '${id}' context entry '${entry.id}'`, entry.text, this.limits.maxEntryBytes)
      }
    }
    for (const [sessionId, assignment] of this.requireAssignments().entries()) {
      if (tasks.get(assignment.taskId) === undefined) {
        throw new Error(`task assignment for session '${sessionId}' references missing task '${assignment.taskId}'`)
      }
    }
  }

  /** Dedicated plugin RPC avoids relying on build-time Typert client contributions. */
  private async handleRpc(endpoint: string, payload: unknown): Promise<TaskBoardRpcResult> {
    try {
      const args = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as { args?: unknown }).args
        : undefined
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        throw new TypeError('task rpc payload requires a plain args object')
      }
      const named = args as Record<string, unknown>
      let value: unknown
      switch (endpoint) {
        case 'create':
          value = await this.create(named.input as TaskCreateInput)
          break
        case 'get':
          value = this.get(named.id as TaskId)
          break
        case 'list':
          value = this.list()
          break
        case 'update':
          value = await this.update(
            named.id as TaskId,
            named.expectedRevision as number,
            named.input as TaskUpdateInput,
          )
          break
        case 'remove':
          value = await this.remove(named.id as TaskId, named.expectedRevision as number)
          break
        case 'listAssignments':
          value = this.listAssignments()
          break
        case 'assignSession':
          value = await this.assignSession(named.sessionId as SessionId, named.taskId as TaskId)
          break
        case 'unassignSession':
          value = await this.unassignSession(named.sessionId as SessionId)
          break
        case 'getAssignment':
          value = this.getAssignment(named.sessionId as SessionId)
          break
        case 'getTaskForSession':
          value = await this.getTaskForSession(named.sessionId as SessionId)
          break
        case 'readSessionTranscript':
          value = await this.readSessionTranscript(
            named.taskId as TaskId,
            named.sessionId as SessionId,
            named.beforeSeq as number | undefined,
          )
          break
        case 'addMemory':
          value = await this.addMemory(
            named.id as TaskId,
            named.expectedRevision as number,
            named.input as TaskMemoryCreateInput,
          )
          break
        case 'setMemoryVerification':
          value = await this.setMemoryVerification(
            named.id as TaskId,
            named.entryId as TaskContextEntryId,
            named.expectedRevision as number,
            named.verification as TaskMemoryVerification,
          )
          break
        default:
          throw new Error(`unknown task rpc method '${endpoint}'`)
      }
      return { ok: true, value }
    } catch (cause) {
      return {
        ok: false,
        error: { code: 'internal', message: cause instanceof Error ? cause.message : String(cause), details: {} },
      }
    }
  }

  private async inspectSession(sessionId: SessionId): Promise<{ header: Session['header']; events: readonly SessionEvent[] }> {
    const live = this.ctx.sessions.get(sessionId)
    if (live !== undefined) return { header: live.header, events: live.events }
    const known = (await this.ctx.sessionPersistence.list()).some(header => header.id === sessionId)
    if (!known) throw new Error(`task: session '${sessionId}' does not exist`)
    const inspected = await this.ctx.sessionPersistence.inspect(sessionId)
    return { header: inspected.meta, events: inspected.events }
  }

  private snapshotAssignment(sessionId: SessionId, record: TaskAssignmentRecord): TaskAssignment {
    return Object.freeze({ sessionId, ...record })
  }

  private enqueueAssignment<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.assignmentTail.then(operation)
    this.assignmentTail = result.then(() => undefined, () => undefined)
    return result
  }

  private requireTasks(): KvTable<TaskId, TaskRecord> {
    if (this.tasksTable === undefined) throw new Error('task store is not initialized')
    return this.tasksTable
  }

  private requireAssignments(): KvTable<SessionId, TaskAssignmentRecord> {
    if (this.assignmentsTable === undefined) throw new Error('task store is not initialized')
    return this.assignmentsTable
  }
}

export default TaskStore
