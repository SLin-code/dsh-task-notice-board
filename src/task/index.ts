/** Durable Task store and Session ownership for cross-Session collaboration. */

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { CallId } from '@deepseek-ai/dsh-llm'
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

function snapshotEntry(entry: TaskContextEntryRecord): TaskContextEntry {
  return Object.freeze({
    id: entry.id,
    revision: entry.revision,
    text: entry.text,
    source: Object.freeze({ ...entry.source }),
    createdAt: entry.createdAt,
  })
}

function snapshotTask(id: TaskId, record: TaskRecord): TaskView {
  return Object.freeze({
    id,
    title: record.title,
    objective: record.objective,
    status: record.status,
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
 * Extends {@link TypertRemoteService} so the Cordis Gateway routes the
 * `@Remote`-decorated methods below to browser callers as `ctx.remote.taskBoard.*`
 * (wire namespace `taskBoard`), while the host-facing service is still resolved
 * through `ctx.tasks` (unchanged Cordis service key).
 */
export class TaskStore extends TypertRemoteService {
  static inject = ['sessions', 'sessionPersistence', 'storageDomain']

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
    validateText('title', input.title, this.limits.maxTitleBytes)
    validateText('objective', input.objective, this.limits.maxObjectiveBytes)
    const id = TaskId(randomUUID())
    const now = Date.now()
    const record: TaskRecord = {
      title: input.title,
      objective: input.objective,
      status: 'open',
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
    const table = this.requireTasks()
    if (table.get(id) === undefined) throw new TaskNotFoundError(id)
    const record = await table.update(id, (current) => {
      if (current.revision !== expectedRevision) {
        throw new TaskRevisionConflictError(id, expectedRevision, current.revision)
      }
      const title = input.title ?? current.title
      const objective = input.objective ?? current.objective
      const status = input.status ?? current.status
      if (title === current.title && objective === current.objective && status === current.status) return current
      return {
        ...current,
        title,
        objective,
        status,
        revision: nextRevision(id, current.revision),
        updatedAt: Date.now(),
      }
    })
    return snapshotTask(id, record)
  }

  /**
   * Assign one known Session lifecycle. Only a Session with no started step may change Tasks.
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
   * Remove the current assignment only while the Session has no started model step.
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
  async publishFromSession(session: Session, callId: CallId, text: string): Promise<TaskContextPublishResult> {
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
        entry.source.sessionId === session.id
        && entry.source.sessionCreatedAt === session.header.createdAt
        && entry.source.callId === callId)
      if (existing !== undefined) {
        if (existing.text !== text) throw new TaskContextIdempotencyConflictError(assignment.taskId, callId)
        published = existing
        deduplicated = true
        return current
      }
      const revision = nextRevision(assignment.taskId, current.revision)
      const entry: TaskContextEntryRecord = {
        id: randomUUID() as TaskContextEntryId,
        revision,
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
