/** Full-screen Task/Session collaboration control center. */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  ISessions,
  IWorkspaces,
  PendingInteractionStatus,
  SessionId,
  SessionSummary,
  WorkspaceId,
  WorkspaceView,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {
  TaskAssignment,
  TaskBoardStatus,
  TaskContextEntry,
  TaskCreateInput,
  TaskId,
  TaskMemoryKind,
  TaskMemoryVerification,
  TaskTranscriptPage,
  TaskView,
} from '../task/types.ts'
import { interpolate, type TaskBoardStrings } from './locales.ts'
import type { TaskBoardRemote } from './task-board-remote.ts'
import { invalidateTaskOwnership, type TaskBoardOpenRequest } from './task-board-navigation.ts'
import css from './TaskBoardModal.module.css'

type Translate = (key: keyof TaskBoardStrings) => string
type WorkspaceFilter = 'all' | 'archived' | 'legacy' | WorkspaceId
type Screen = 'tasks' | 'task'
type TaskLane = TaskBoardStatus
type SessionLane = 'ready' | 'running' | 'attention' | 'ended'

interface Props {
  readonly open: boolean
  readonly entryRequest: TaskBoardOpenRequest | null
  readonly onClose: () => void
  readonly t: Translate
  readonly remote: TaskBoardRemote
  readonly sessions: ISessions & { create(opts: { workspaceId: WorkspaceId }): Promise<SessionId> }
  readonly workspaces: IWorkspaces
}

interface RemoteState {
  readonly loading: boolean
  readonly error: string | null
  readonly tasks: readonly TaskView[]
  readonly assignments: readonly TaskAssignment[]
}

const EMPTY_STATE: RemoteState = { loading: true, error: null, tasks: [], assignments: [] }
const TASK_LANES: readonly TaskLane[] = ['backlog', 'in_progress', 'review', 'done']
const SESSION_LANES: readonly SessionLane[] = ['ready', 'running', 'attention', 'ended']
const MEMORY_KINDS: readonly TaskMemoryKind[] = ['summary', 'decision', 'blocker', 'handoff']

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
}

function taskLane(
  task: TaskView,
  sessions: readonly SessionSummary[],
  archivedSessionIds?: ReadonlySet<SessionId>,
): TaskLane {
  if (task.status === 'closed' || task.boardStatus === 'done') return 'done'
  if (sessions.some(session => archivedSessionIds?.has(session.id) !== true && session.pendingInteraction !== undefined)) return 'review'
  return task.boardStatus
}

function sessionLane(session: SessionSummary): SessionLane {
  if (session.pendingInteraction !== undefined) return 'attention'
  if (session.running) return 'running'
  if (session.completed === true) return 'ended'
  return 'ready'
}

function pendingLabel(status: PendingInteractionStatus | undefined, t: Translate): string {
  if (status === 'approval') return t('session.approval')
  if (status === 'question') return t('session.question')
  if (status === 'plan-review') return t('session.planReview')
  return t('session.idle')
}

function memoryKindLabel(kind: TaskMemoryKind, t: Translate): string {
  return t(`memory.kind.${kind}`)
}

function verificationLabel(verification: TaskMemoryVerification, t: Translate): string {
  return t(`memory.${verification}`)
}

export function TaskBoardModal({ open, entryRequest, onClose, t, remote, sessions, workspaces }: Props): JSX.Element | null {
  const sessionState = useSyncExternalStore(sessions.list.subscribe, sessions.list.getSnapshot)
  const workspaceState = useSyncExternalStore(workspaces.list.subscribe, workspaces.list.getSnapshot)
  const [state, setState] = useState<RemoteState>(EMPTY_STATE)
  const [workspaceFilter, setWorkspaceFilter] = useState<WorkspaceFilter>('all')
  const [screen, setScreen] = useState<Screen>('tasks')
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<TaskView | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TaskView | null>(null)
  const [busy, setBusy] = useState(false)
  const [workspaceInitialized, setWorkspaceInitialized] = useState(false)
  const appliedEntryRequest = useRef(0)

  const refresh = useCallback(async (): Promise<RemoteState | null> => {
    setState(previous => ({ ...previous, loading: true, error: null }))
    try {
      const [tasks, assignments] = await Promise.all([remote.list(), remote.listAssignments()])
      const next = { loading: false, error: null, tasks, assignments } satisfies RemoteState
      setState(next)
      return next
    } catch (cause) {
      setState(previous => ({ ...previous, loading: false, error: errorMessage(cause) }))
      return null
    }
  }, [remote])

  useEffect(() => {
    if (!open) {
      setScreen('tasks')
      setSelectedTaskId(null)
      setCreateOpen(false)
      setArchiveTarget(null)
      setDeleteTarget(null)
      setWorkspaceInitialized(false)
      return
    }
    if (entryRequest === null) void refresh()
  }, [entryRequest, open, refresh])

  useEffect(() => {
    if (!open || entryRequest === null || appliedEntryRequest.current === entryRequest.revision) return
    let current = true
    const request = entryRequest
    setSelectedTaskId(request.taskId)
    setScreen('task')
    void refresh().then(next => {
      if (!current || next === null) return
      const target = next.tasks.find(task => task.id === request.taskId)
      appliedEntryRequest.current = request.revision
      if (target === undefined) {
        setSelectedTaskId(null)
        setScreen('tasks')
        return
      }
      setWorkspaceFilter(target.archived ? 'archived' : (target.workspaceId ?? 'legacy'))
      setWorkspaceInitialized(true)
    })
    return () => { current = false }
  }, [entryRequest, open, refresh])

  useEffect(() => {
    if (!open || workspaceInitialized || entryRequest !== null) return
    const current = sessionState.current
    const currentWorkspace = current === undefined
      ? undefined
      : workspaceState.items.find(workspace => workspace.sessionIds.includes(current))
    const preferred = currentWorkspace?.workspaceId ?? workspaceState.recentWorkspaceId
    if (preferred !== undefined) setWorkspaceFilter(preferred)
    setWorkspaceInitialized(true)
  }, [entryRequest, open, sessionState.current, workspaceInitialized, workspaceState.items, workspaceState.recentWorkspaceId])

  const selectedTask = useMemo(
    () => selectedTaskId === null ? undefined : state.tasks.find(task => task.id === selectedTaskId),
    [selectedTaskId, state.tasks],
  )

  const assignmentsByTask = useMemo(() => {
    const map = new Map<TaskId, TaskAssignment[]>()
    for (const assignment of state.assignments) {
      const list = map.get(assignment.taskId) ?? []
      list.push(assignment)
      map.set(assignment.taskId, list)
    }
    return map
  }, [state.assignments])

  const archivedSessionIds = useMemo(
    () => new Set(workspaceState.archivedSessionIds),
    [workspaceState.archivedSessionIds],
  )

  const sessionFor = useCallback((assignment: TaskAssignment): SessionSummary | undefined => {
    return sessionState.byId[assignment.sessionId]
  }, [sessionState.byId])

  const taskSessions = useCallback((taskId: TaskId): SessionSummary[] => {
    return (assignmentsByTask.get(taskId) ?? [])
      .map(sessionFor)
      .filter((session): session is SessionSummary => session !== undefined)
  }, [assignmentsByTask, sessionFor])

  const visibleTasks = useMemo(() => state.tasks.filter(task => {
    if (workspaceFilter === 'archived') return task.archived
    if (task.archived) return false
    if (workspaceFilter === 'all') return true
    if (workspaceFilter === 'legacy') return task.workspaceId === undefined
    return task.workspaceId === workspaceFilter
  }), [state.tasks, workspaceFilter])

  const attentionCount = useMemo(() => state.assignments.reduce((count, assignment) => {
    if (archivedSessionIds.has(assignment.sessionId)) return count
    return sessionFor(assignment)?.pendingInteraction === undefined ? count : count + 1
  }, 0), [archivedSessionIds, sessionFor, state.assignments])

  const chooseTask = useCallback((task: TaskView) => {
    setSelectedTaskId(task.id)
    setScreen('task')
  }, [])

  const mutateTask = useCallback(async (task: TaskView, boardStatus: TaskBoardStatus) => {
    try {
      setBusy(true)
      await remote.update(task.id, task.revision, { boardStatus })
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    } finally {
      setBusy(false)
    }
  }, [refresh, remote])

  const archiveLinkedSessions = useCallback(async (taskId: TaskId): Promise<number> => {
    const alreadyArchived = new Set(workspaceState.archivedSessionIds)
    const pendingIds = (assignmentsByTask.get(taskId) ?? [])
      .map(assignment => assignment.sessionId)
      .filter(sessionId => !alreadyArchived.has(sessionId))
    let failed = 0
    for (const sessionId of pendingIds) {
      try {
        await workspaces.archiveSession(sessionId)
      } catch {
        failed += 1
      }
    }
    return failed
  }, [assignmentsByTask, workspaces, workspaceState.archivedSessionIds])

  const setTaskArchived = useCallback(async (task: TaskView, archived: boolean): Promise<boolean> => {
    try {
      setBusy(true)
      if (archived) {
        const updated = await remote.update(task.id, task.revision, { archived: true })
        setState(previous => ({
          ...previous,
          tasks: previous.tasks.map(item => item.id === updated.id ? updated : item),
          error: null,
        }))
        setArchiveTarget(null)
        setSelectedTaskId(null)
        setScreen('tasks')
        setWorkspaceFilter('archived')
        const failed = await archiveLinkedSessions(task.id)
        await refresh()
        if (failed > 0) {
          setState(previous => ({
            ...previous,
            error: interpolate(t('archive.partialFailure'), { failed }),
          }))
        }
        return true
      }
      await remote.update(task.id, task.revision, { archived: false })
      setWorkspaceFilter(task.workspaceId ?? 'legacy')
      await refresh()
      return true
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
      return false
    } finally {
      setBusy(false)
    }
  }, [archiveLinkedSessions, refresh, remote, t])

  const retryArchiveSessions = useCallback(async (task: TaskView) => {
    try {
      setBusy(true)
      const failed = await archiveLinkedSessions(task.id)
      if (failed > 0) {
        setState(previous => ({
          ...previous,
          error: interpolate(t('archive.partialFailure'), { failed }),
        }))
      } else {
        setState(previous => ({ ...previous, error: null }))
      }
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    } finally {
      setBusy(false)
    }
  }, [archiveLinkedSessions, t])

  const deleteTask = useCallback(async (task: TaskView) => {
    try {
      setBusy(true)
      await remote.remove(task.id, task.revision)
      invalidateTaskOwnership()
      setDeleteTarget(null)
      setSelectedTaskId(null)
      setScreen('tasks')
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    } finally {
      setBusy(false)
    }
  }, [refresh, remote])

  const openSession = useCallback((id: SessionId) => {
    sessions.open(id)
    onClose()
  }, [onClose, sessions])

  const createSession = useCallback(async (task: TaskView) => {
    if (task.workspaceId === undefined || busy) return
    try {
      setBusy(true)
      const id = await sessions.create({ workspaceId: task.workspaceId })
      await remote.assignSession(id, task.id)
      invalidateTaskOwnership()
      await refresh()
      sessions.open(id)
      onClose()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    } finally {
      setBusy(false)
    }
  }, [busy, onClose, refresh, remote, sessions])

  const linkCurrentSession = useCallback(async (task: TaskView) => {
    const current = sessionState.current
    if (current === undefined || busy) return
    try {
      setBusy(true)
      await remote.assignSession(current, task.id)
      invalidateTaskOwnership()
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, remote, sessionState.current])

  const markMemory = useCallback(async (
    task: TaskView,
    entry: TaskContextEntry,
    verification: TaskMemoryVerification,
  ) => {
    try {
      setBusy(true)
      await remote.setMemoryVerification(task.id, entry.id, task.revision, verification)
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    } finally {
      setBusy(false)
    }
  }, [refresh, remote])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modal.title')}
      closeLabel={t('modal.close')}
      className={clsx(css.dialog)}
      contentClassName={clsx(css.content)}
    >
      <div className={clsx(css.shell)}>
        <ControlSidebar
          t={t}
          tasks={state.tasks}
          workspaces={workspaceState.items}
          sessionsByTask={new Map([...assignmentsByTask.keys()].map(taskId => [taskId, taskSessions(taskId)]))}
          archivedSessionIds={archivedSessionIds}
          selected={workspaceFilter}
          selectedTaskId={selectedTaskId}
          attentionCount={attentionCount}
          onSelect={(next) => { setWorkspaceFilter(next); setScreen('tasks'); setSelectedTaskId(null) }}
          onSelectTask={chooseTask}
          onOpenSession={openSession}
        />

        <main className={clsx(css.main)}>
          {state.error !== null && <div className={clsx(css.error)}>{state.error}</div>}
          {screen === 'tasks' || selectedTask === undefined
            ? (
              workspaceFilter === 'archived'
                ? <ArchivedTasks t={t} tasks={visibleTasks} loading={state.loading} taskSessions={taskSessions} onChoose={chooseTask} onRefresh={refresh} />
                : <TaskBoard
                    t={t}
                    tasks={visibleTasks}
                    loading={state.loading}
                    taskSessions={taskSessions}
                    archivedSessionIds={archivedSessionIds}
                    onChoose={chooseTask}
                    onMove={mutateTask}
                    onRefresh={refresh}
                    onCreate={() => setCreateOpen(true)}
                    canCreate={workspaceState.items.length > 0}
                  />
            )
            : (
              <TaskWorkspace
                t={t}
                task={selectedTask}
                sessions={taskSessions(selectedTask.id)}
                archivedSessionIds={archivedSessionIds}
                busy={busy}
                onBack={() => setScreen('tasks')}
                onOpenSession={openSession}
                onCreateSession={() => { void createSession(selectedTask) }}
                canLinkCurrent={(() => {
                  const current = sessionState.current
                  if (current === undefined || state.assignments.some(item => item.sessionId === current)) return false
                  const summary = sessionState.byId[current]
                  if (summary?.blank !== true || selectedTask.workspaceId === undefined) return false
                  return workspaceState.items.find(item => item.workspaceId === selectedTask.workspaceId)?.sessionIds.includes(current) === true
                })()}
                onLinkCurrent={() => { void linkCurrentSession(selectedTask) }}
                onMove={(status) => { void mutateTask(selectedTask, status) }}
                onArchive={() => setArchiveTarget(selectedTask)}
                onRestore={() => { void setTaskArchived(selectedTask, false) }}
                onRetryArchiveSessions={() => { void retryArchiveSessions(selectedTask) }}
                onReadTranscript={(sessionId, beforeSeq) => remote.readSessionTranscript(selectedTask.id, sessionId, beforeSeq)}
                onDelete={() => setDeleteTarget(selectedTask)}
                onAddMemory={async (kind, text) => {
                  try {
                    setBusy(true)
                    await remote.addMemory(selectedTask.id, selectedTask.revision, { kind, text })
                    await refresh()
                    return true
                  } catch (cause) {
                    setState(previous => ({ ...previous, error: errorMessage(cause) }))
                    return false
                  } finally {
                    setBusy(false)
                  }
                }}
                onMarkMemory={(entry, verification) => { void markMemory(selectedTask, entry, verification) }}
              />
            )}
        </main>
      </div>

      {createOpen && (
        <CreateTaskPanel
          t={t}
          workspaces={workspaceState.items}
          preferredWorkspace={workspaceFilter === 'all' || workspaceFilter === 'archived' || workspaceFilter === 'legacy' ? undefined : workspaceFilter}
          remote={remote}
          onCancel={() => setCreateOpen(false)}
          onCreated={async (task) => {
            setCreateOpen(false)
            setWorkspaceFilter(task.workspaceId ?? 'legacy')
            await refresh()
            chooseTask(task)
          }}
          onError={(message) => setState(previous => ({ ...previous, error: message }))}
        />
      )}
      {deleteTarget !== null && (
        <DeleteTaskPanel
          t={t}
          task={deleteTarget}
          sessionCount={assignmentsByTask.get(deleteTarget.id)?.length ?? 0}
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => { void deleteTask(deleteTarget) }}
        />
      )}
      {archiveTarget !== null && (
        <ArchiveTaskPanel
          t={t}
          task={archiveTarget}
          sessionCount={assignmentsByTask.get(archiveTarget.id)?.length ?? 0}
          busy={busy}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => {
            void setTaskArchived(archiveTarget, true).then(success => {
              if (success) setArchiveTarget(null)
            })
          }}
        />
      )}
    </Modal>
  )
}

function ControlSidebar({
  t, tasks, workspaces, sessionsByTask, archivedSessionIds, selected, selectedTaskId, attentionCount,
  onSelect, onSelectTask, onOpenSession,
}: {
  t: Translate
  tasks: readonly TaskView[]
  workspaces: readonly WorkspaceView[]
  sessionsByTask: ReadonlyMap<TaskId, readonly SessionSummary[]>
  archivedSessionIds: ReadonlySet<SessionId>
  selected: WorkspaceFilter
  selectedTaskId: TaskId | null
  attentionCount: number
  onSelect(next: WorkspaceFilter): void
  onSelectTask(task: TaskView): void
  onOpenSession(id: SessionId): void
}): JSX.Element {
  const [expandedWorkspace, setExpandedWorkspace] = useState<WorkspaceFilter | null>(null)
  const [expandedTask, setExpandedTask] = useState<TaskId | null>(null)
  const activeTasks = tasks.filter(task => !task.archived)
  const archivedCount = tasks.length - activeTasks.length

  useEffect(() => {
    if (selectedTaskId === null) return
    const task = tasks.find(item => item.id === selectedTaskId)
    if (task === undefined) return
    setExpandedWorkspace(task.workspaceId ?? 'legacy')
    setExpandedTask(task.id)
  }, [selectedTaskId, tasks])

  const renderWorkspace = (
    id: WorkspaceId | 'legacy',
    title: string,
    path: string | undefined,
    workspaceTasks: readonly TaskView[],
  ): JSX.Element => {
    const expanded = expandedWorkspace === id || selected === id
    return (
      <div className={clsx(css.treeGroup)} key={id}>
        <button
          className={clsx(css.navItem, css.workspaceRow, selected === id && selectedTaskId === null && css.navItemActive)}
          onClick={() => {
            setExpandedWorkspace(expanded ? null : id)
            onSelect(id)
          }}
          title={path}
          aria-expanded={expanded}
        >
          <span className={clsx(css.treeLabel)}><span className={clsx(css.chevron)}>{expanded ? '▾' : '▸'}</span><span className={clsx(css.navText)}>{title}</span></span>
          <span className={clsx(css.count)}>{workspaceTasks.length}</span>
        </button>
        {expanded && (
          <div className={clsx(css.taskTree)}>
            {workspaceTasks.map(task => {
              const taskSessionItems = sessionsByTask.get(task.id) ?? []
              const taskExpanded = expandedTask === task.id || selectedTaskId === task.id
              return (
                <div className={clsx(css.taskTreeGroup)} key={task.id}>
                  <button
                    className={clsx(css.navItem, css.taskTreeRow, selectedTaskId === task.id && css.navItemActive)}
                    onClick={() => {
                      setExpandedTask(taskExpanded ? null : task.id)
                      onSelectTask(task)
                    }}
                    aria-expanded={taskExpanded}
                    title={task.objective}
                  >
                    <span className={clsx(css.treeLabel)}><span className={clsx(css.chevron)}>{taskExpanded ? '▾' : '▸'}</span><span className={clsx(css.navText)}>{task.title}</span></span>
                    <span className={clsx(css.count)}>{taskSessionItems.length}</span>
                  </button>
                  {taskExpanded && taskSessionItems.length > 0 && (
                    <div className={clsx(css.sessionTree)}>
                      {taskSessionItems.map(session => (
                        <button
                          className={clsx(css.sessionTreeRow, archivedSessionIds.has(session.id) && css.sessionTreeRowArchived)}
                          key={session.id}
                          onClick={() => { if (!archivedSessionIds.has(session.id)) onOpenSession(session.id) }}
                          aria-disabled={archivedSessionIds.has(session.id)}
                          title={archivedSessionIds.has(session.id) ? t('session.archivedHint') : pendingLabel(session.pendingInteraction, t)}
                        >
                          <span className={clsx(css.sessionDot, archivedSessionIds.has(session.id) ? css.sessionDot_archived : css[`sessionDot_${sessionLane(session)}`])} />
                          <span className={clsx(css.navText)}>{session.displayTitle}</span>
                          {archivedSessionIds.has(session.id) && <span className={clsx(css.archivedMiniBadge)}>{t('session.archived')}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className={clsx(css.sidebar)}>
      <div className={clsx(css.navLabel)}>{t('nav.overview')}</div>
      <button className={clsx(css.navItem, selected === 'all' && css.navItemActive)} onClick={() => onSelect('all')}>
        <span>{t('nav.allTasks')}</span><span className={clsx(css.count)}>{activeTasks.length}</span>
      </button>
      <button className={clsx(css.navItem, selected === 'archived' && css.navItemActive)} onClick={() => onSelect('archived')}>
        <span>{t('nav.archived')}</span><span className={clsx(css.count)}>{archivedCount}</span>
      </button>
      {attentionCount > 0 && (
        <div className={clsx(css.attentionBanner)}>{interpolate(t('notice.pending'), { count: attentionCount })}</div>
      )}
      <div className={clsx(css.navLabel)}>{t('nav.workspaces')}</div>
      <div className={clsx(css.workspaceList)}>
        {workspaces.map(workspace => {
          const workspaceTasks = activeTasks.filter(task => task.workspaceId === workspace.workspaceId)
          return renderWorkspace(workspace.workspaceId, workspace.title, workspace.path, workspaceTasks)
        })}
        {activeTasks.some(task => task.workspaceId === undefined)
          && renderWorkspace('legacy', t('nav.legacy'), undefined, activeTasks.filter(task => task.workspaceId === undefined))}
      </div>
    </aside>
  )
}

function TaskBoard({
  t, tasks, loading, taskSessions, archivedSessionIds, onChoose, onMove, onRefresh, onCreate, canCreate,
}: {
  t: Translate
  tasks: readonly TaskView[]
  loading: boolean
  taskSessions(id: TaskId): readonly SessionSummary[]
  archivedSessionIds: ReadonlySet<SessionId>
  onChoose(task: TaskView): void
  onMove(task: TaskView, status: TaskBoardStatus): Promise<void>
  onRefresh(): Promise<unknown>
  onCreate(): void
  canCreate: boolean
}): JSX.Element {
  return (
    <section className={clsx(css.surface)}>
      <header className={clsx(css.topbar)}>
        <div><h2>{t('header.taskBoard')}</h2><p>{t('header.taskBoardHint')}</p></div>
        <div className={clsx(css.actions)}>
          <Button variant="ghost" onClick={() => { void onRefresh() }} disabled={loading}>{t('button.refresh')}</Button>
          <Button variant="primary" onClick={onCreate} disabled={!canCreate}>{t('button.newTask')}</Button>
        </div>
      </header>
      {!canCreate && <div className={clsx(css.info)}>{t('notice.noWorkspace')}</div>}
      <div className={clsx(css.taskBoard)}>
        {TASK_LANES.map(lane => {
          const laneTasks = tasks.filter(task => {
            const sessions = taskSessions(task.id)
            return taskLane(task, sessions, archivedSessionIds) === lane
          })
          return (
            <section className={clsx(css.column, css.taskColumn, css[`lane_${lane}`])} key={lane}>
              <div className={clsx(css.columnHeader)}>
                <span className={clsx(css.columnTitle)}><span className={clsx(css.laneDot)} />{t(`board.${lane}`)}</span>
                <span className={clsx(css.columnCount)}>{laneTasks.length}</span>
              </div>
              <div className={clsx(css.columnBody)}>
                {laneTasks.length === 0 && <div className={clsx(css.empty)}>{t('board.empty')}</div>}
                {laneTasks.map(task => {
                  const sessions = taskSessions(task.id)
                  const pending = sessions.filter(session => !archivedSessionIds.has(session.id) && session.pendingInteraction !== undefined).length
                  const effectiveLane = taskLane(task, sessions, archivedSessionIds)
                  return (
                    <article className={clsx(css.taskCard, css[`cardLane_${effectiveLane}`], pending > 0 && css.taskCardAttention)} key={task.id}>
                      <button className={clsx(css.cardMain)} onClick={() => onChoose(task)}>
                        <div className={clsx(css.cardTitle)}>{task.title}</div>
                        <p>{task.objective}</p>
                        {pending > 0 && <div className={clsx(css.pendingPill)}>{interpolate(t('notice.pending'), { count: pending })}</div>}
                        <div className={clsx(css.cardMeta)}>
                          <span className={clsx(css.metaItem)}><span aria-hidden="true">◉</span>{interpolate(t('task.sessions'), { count: sessions.length })}</span>
                          <span className={clsx(css.metaItem)}><span aria-hidden="true">✦</span>{interpolate(t('task.memories'), { count: task.entries.length })}</span>
                        </div>
                      </button>
                      <div className={clsx(css.cardFooter)}>
                        <TaskStatusControl
                          t={t}
                          value={effectiveLane}
                          disabled={pending > 0}
                          onChange={status => { void onMove(task, status) }}
                        />
                        <button className={clsx(css.openTask)} onClick={() => onChoose(task)} aria-label={`${task.title} · ${t('button.openTask')}`}>→</button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}

function ArchivedTasks({
  t, tasks, loading, taskSessions, onChoose, onRefresh,
}: {
  t: Translate
  tasks: readonly TaskView[]
  loading: boolean
  taskSessions(id: TaskId): readonly SessionSummary[]
  onChoose(task: TaskView): void
  onRefresh(): Promise<unknown>
}): JSX.Element {
  return (
    <section className={clsx(css.surface)}>
      <header className={clsx(css.topbar)}>
        <div><h2>{t('header.archivedTasks')}</h2><p>{t('header.archivedTasksHint')}</p></div>
        <Button variant="ghost" onClick={() => { void onRefresh() }} disabled={loading}>{t('button.refresh')}</Button>
      </header>
      {tasks.length === 0
        ? <div className={clsx(css.archiveEmpty)}>{t('archive.empty')}</div>
        : (
          <div className={clsx(css.archiveGrid)}>
            {tasks.map(task => (
              <button className={clsx(css.archiveCard)} key={task.id} onClick={() => onChoose(task)}>
                <div className={clsx(css.cardTitle)}>{task.title}</div>
                <p>{task.objective}</p>
                <div className={clsx(css.cardMeta)}>
                  <span>{interpolate(t('task.sessions'), { count: taskSessions(task.id).length })}</span>
                  <span>{interpolate(t('task.memories'), { count: task.entries.length })}</span>
                  {task.archivedAt !== undefined && <span>{interpolate(t('task.archivedAt'), { when: formatTimestamp(task.archivedAt) })}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
    </section>
  )
}

function TaskWorkspace({
  t, task, sessions, archivedSessionIds, busy, onBack, onOpenSession, onCreateSession, canLinkCurrent, onLinkCurrent,
  onMove, onArchive, onRestore, onRetryArchiveSessions, onReadTranscript, onDelete, onAddMemory, onMarkMemory,
}: {
  t: Translate
  task: TaskView
  sessions: readonly SessionSummary[]
  archivedSessionIds: ReadonlySet<SessionId>
  busy: boolean
  onBack(): void
  onOpenSession(id: SessionId): void
  onCreateSession(): void
  canLinkCurrent: boolean
  onLinkCurrent(): void
  onMove(status: TaskBoardStatus): void
  onArchive(): void
  onRestore(): void
  onRetryArchiveSessions(): void
  onReadTranscript(sessionId: SessionId, beforeSeq?: number): Promise<TaskTranscriptPage>
  onDelete(): void
  onAddMemory(kind: TaskMemoryKind, text: string): Promise<boolean>
  onMarkMemory(entry: TaskContextEntry, verification: TaskMemoryVerification): void
}): JSX.Element {
  const [memoryKind, setMemoryKind] = useState<TaskMemoryKind>('summary')
  const [memoryText, setMemoryText] = useState('')
  const [transcriptSessionId, setTranscriptSessionId] = useState<SessionId | null>(null)
  const [transcriptPage, setTranscriptPage] = useState<TaskTranscriptPage | null>(null)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const transcriptRequest = useRef(0)
  const activeSessions = sessions.filter(session => !archivedSessionIds.has(session.id))
  const archivedSessions = sessions.filter(session => archivedSessionIds.has(session.id))
  const transcriptSession = transcriptSessionId === null
    ? undefined
    : archivedSessions.find(session => session.id === transcriptSessionId)

  useEffect(() => {
    transcriptRequest.current += 1
    setTranscriptSessionId(null)
    setTranscriptPage(null)
    setTranscriptError(null)
    setTranscriptLoading(false)
  }, [task.id])

  const loadTranscript = async (session: SessionSummary, beforeSeq?: number): Promise<void> => {
    const request = ++transcriptRequest.current
    setTranscriptSessionId(session.id)
    setTranscriptLoading(true)
    setTranscriptError(null)
    if (beforeSeq === undefined) setTranscriptPage(null)
    try {
      const page = await onReadTranscript(session.id, beforeSeq)
      if (request !== transcriptRequest.current) return
      setTranscriptPage(previous => beforeSeq === undefined || previous === null
        ? page
        : { ...page, items: [...page.items, ...previous.items] })
    } catch (cause) {
      if (request !== transcriptRequest.current) return
      setTranscriptError(errorMessage(cause))
    } finally {
      if (request === transcriptRequest.current) setTranscriptLoading(false)
    }
  }

  const closeTranscript = (): void => {
    transcriptRequest.current += 1
    setTranscriptSessionId(null)
    setTranscriptPage(null)
    setTranscriptError(null)
    setTranscriptLoading(false)
  }
  return (
    <section className={clsx(css.surface)}>
      <header className={clsx(css.taskHeader)}>
        <button className={clsx(css.back)} onClick={onBack}>← {t('button.back')}</button>
        <div className={clsx(css.taskHeading)}>
          <div className={clsx(css.eyebrow)}>{t('task.detailLabel')}</div>
          <h2>{task.title}</h2>
          <div className={clsx(css.cardMeta)}>
            <span>{interpolate(t('task.sessions'), { count: sessions.length })}</span>
            <span>{interpolate(t('task.memories'), { count: task.entries.length })}</span>
            {task.owner !== '' && <span>{interpolate(t('task.owner'), { owner: task.owner })}</span>}
          </div>
        </div>
        <div className={clsx(css.actions)}>
          {!task.archived && (
            <>
              <TaskStatusControl
                t={t}
                value={taskLane(task, activeSessions)}
                disabled={activeSessions.some(session => session.pendingInteraction !== undefined)}
                onChange={onMove}
              />
              <Button variant="primary" onClick={onCreateSession} disabled={busy || task.workspaceId === undefined || task.status === 'closed'}>
                {t('button.newSession')}
              </Button>
              {canLinkCurrent && <Button variant="ghost" onClick={onLinkCurrent} disabled={busy}>{t('button.linkCurrent')}</Button>}
              <Button variant="ghost" onClick={onArchive} disabled={busy}>{t('button.archiveTask')}</Button>
            </>
          )}
          {task.archived && <Button variant="primary" onClick={onRestore} disabled={busy}>{t('button.restoreTask')}</Button>}
          <Button variant="ghost" onClick={onDelete} disabled={busy}>{t('button.deleteTask')}</Button>
        </div>
      </header>

      <div className={clsx(css.brief)}>
        <div><strong>{t('task.objective')}</strong><p>{task.objective}</p></div>
        <div><strong>{t('task.acceptance')}</strong><p>{task.acceptanceCriteria || '—'}</p></div>
      </div>

      <div className={clsx(css.sectionHeading)}>
        <h3>{t('header.sessionBoard')}</h3>
        <div className={clsx(css.sessionCounts)}>
          <span>{interpolate(t('session.activeCount'), { count: activeSessions.length })}</span>
          {archivedSessions.length > 0 && <span>{interpolate(t('session.archivedCount'), { count: archivedSessions.length })}</span>}
        </div>
      </div>
      {task.archived && activeSessions.length > 0 && (
        <div className={clsx(css.archiveSyncNotice)}>
          <div><strong>{t('archive.syncPendingTitle')}</strong><span>{interpolate(t('archive.syncPending'), { count: activeSessions.length })}</span></div>
          <Button variant="ghost" size="sm" onClick={onRetryArchiveSessions} disabled={busy}>{t('archive.retry')}</Button>
        </div>
      )}
      {(!task.archived || activeSessions.length > 0) && (
        <div className={clsx(css.sessionBoard)}>
          {SESSION_LANES.map(lane => {
            const laneSessions = activeSessions.filter(session => sessionLane(session) === lane)
            return (
              <section className={clsx(css.column, css.sessionColumn, css[`sessionLane_${lane}`])} key={lane}>
                <div className={clsx(css.columnHeader)}>
                  <span className={clsx(css.columnTitle)}><span className={clsx(css.laneDot)} />{t(`session.${lane}`)}</span>
                  <span className={clsx(css.columnCount)}>{laneSessions.length}</span>
                </div>
                <div className={clsx(css.columnBody)}>
                  {laneSessions.length === 0 && <div className={clsx(css.empty)}>{t('session.empty')}</div>}
                  {laneSessions.map(session => (
                    <button
                      key={session.id}
                      className={clsx(css.sessionCard, session.pendingInteraction !== undefined && css.sessionCardAttention)}
                      onClick={() => onOpenSession(session.id)}
                    >
                      <div className={clsx(css.sessionTitle)}>{session.displayTitle}</div>
                      <div className={clsx(css.sessionStatus)}>{pendingLabel(session.pendingInteraction, t)}</div>
                      <div className={clsx(css.cardMeta)}>
                        <span>{session.agentPreset ?? 'Agent'}</span><span>{formatTimestamp(session.updatedAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {archivedSessions.length > 0 && (
        <section className={clsx(css.archivedSessionsSection)}>
          <div className={clsx(css.archivedSessionsHeader)}>
            <div>
              <h4>{t('session.archivedGroup')}</h4>
              <p>{t('session.archivedGroupHint')}</p>
            </div>
            <span className={clsx(css.archivedCount)}>{archivedSessions.length}</span>
          </div>
          <div className={clsx(css.archivedSessionGrid)}>
            {archivedSessions.map(session => (
              <button
                type="button"
                className={clsx(css.archivedSessionCard, transcriptSessionId === session.id && css.archivedSessionCardSelected)}
                key={session.id}
                aria-expanded={transcriptSessionId === session.id}
                onClick={() => { void loadTranscript(session) }}
              >
                <div className={clsx(css.archivedSessionCardTop)}>
                  <div className={clsx(css.sessionTitle)}>{session.displayTitle}</div>
                  <span className={clsx(css.archivedBadge)}>{t('session.archived')}</span>
                </div>
                <div className={clsx(css.cardMeta)}>
                  <span>{session.agentPreset ?? 'Agent'}</span>
                  <span>{formatTimestamp(session.updatedAt)}</span>
                </div>
                <div className={clsx(css.sessionId)}><span>{t('session.idLabel')}</span><code title={session.id}>{session.id}</code></div>
                <span className={clsx(css.viewTranscript)}>{t('session.viewTranscript')} →</span>
              </button>
            ))}
          </div>
          {transcriptSession !== undefined && (
            <section className={clsx(css.transcriptViewer)} aria-label={t('transcript.title')}>
              <header className={clsx(css.transcriptHeader)}>
                <div>
                  <div className={clsx(css.transcriptEyebrow)}>{t('transcript.title')}</div>
                  <h5>{transcriptSession.displayTitle}</h5>
                  <p>{t('transcript.hint')}</p>
                </div>
                <button type="button" className={clsx(css.transcriptClose)} onClick={closeTranscript} aria-label={t('transcript.close')}>×</button>
              </header>
              {transcriptError !== null && <div className={clsx(css.transcriptError)}>{transcriptError}</div>}
              {transcriptLoading && transcriptPage === null && <div className={clsx(css.transcriptState)}>{t('transcript.loading')}</div>}
              {transcriptPage !== null && (
                <div className={clsx(css.transcriptBody)}>
                  {transcriptPage.hasMore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={transcriptLoading || transcriptPage.nextBeforeSeq === undefined}
                      onClick={() => {
                        if (transcriptPage.nextBeforeSeq !== undefined) {
                          void loadTranscript(transcriptSession, transcriptPage.nextBeforeSeq)
                        }
                      }}
                    >{transcriptLoading ? t('transcript.loading') : t('transcript.loadOlder')}</Button>
                  )}
                  {transcriptPage.items.length === 0 && <div className={clsx(css.transcriptState)}>{t('transcript.empty')}</div>}
                  {transcriptPage.items.map(item => (
                    <article className={clsx(css.transcriptMessage, css[`transcriptMessage_${item.role}`])} key={item.seq}>
                      <div className={clsx(css.transcriptMessageMeta)}>
                        <strong>{item.role === 'user' ? t('transcript.user') : t('transcript.assistant')}</strong>
                        {item.role === 'assistant' && item.model !== undefined && <span>{item.model}</span>}
                        <time>{formatTimestamp(item.time)}</time>
                      </div>
                      {item.text !== '' && <p>{item.text}</p>}
                      <div className={clsx(css.transcriptAttachments)}>
                        {item.imageCount > 0 && <span>{interpolate(t('transcript.images'), { count: item.imageCount })}</span>}
                        {item.toolNames.map((name, index) => <span key={`${name}-${index}`}>{interpolate(t('transcript.tool'), { name })}</span>)}
                        {item.textTruncated && <span>{t('transcript.truncated')}</span>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </section>
      )}

      <section className={clsx(css.memorySection)}>
        <div className={clsx(css.sectionHeading)}>
          <div><h3>{t('memory.title')}</h3><p>{t('memory.hint')}</p></div>
        </div>
        {!task.archived && task.status !== 'closed' && (
          <div className={clsx(css.memoryComposer)}>
            <select value={memoryKind} onChange={event => setMemoryKind(event.target.value as TaskMemoryKind)}>
              {MEMORY_KINDS.map(kind => <option value={kind} key={kind}>{memoryKindLabel(kind, t)}</option>)}
            </select>
            <textarea value={memoryText} onChange={event => setMemoryText(event.target.value)} placeholder={t('form.memoryPlaceholder')} rows={2} />
            <Button
              variant="primary"
              disabled={busy || memoryText.trim().length === 0}
              onClick={() => {
                const text = memoryText.trim()
                if (text === '') return
                void onAddMemory(memoryKind, text).then(saved => { if (saved) setMemoryText('') })
              }}
            >{t('button.addMemory')}</Button>
          </div>
        )}
        <div className={clsx(css.memoryList)}>
          {task.entries.length === 0 && <div className={clsx(css.empty)}>{t('memory.empty')}</div>}
          {[...task.entries].reverse().map(entry => (
            <article className={clsx(css.memoryCard, entry.verification === 'superseded' && css.memorySuperseded)} key={entry.id}>
              <div className={clsx(css.memoryMeta)}>
                <span className={clsx(css.kindPill)}>{memoryKindLabel(entry.kind, t)}</span>
                <span className={clsx(css.verification, css[`verification_${entry.verification}`])}>{verificationLabel(entry.verification, t)}</span>
                <span>{entry.source.kind === 'user'
                  ? t('memory.sourceUser')
                  : interpolate(t('memory.sourceSession'), { session: String(entry.source.sessionId).slice(0, 8) })}</span>
                <span>{formatTimestamp(entry.createdAt)}</span>
              </div>
              <p>{entry.text}</p>
              {!task.archived && entry.verification !== 'superseded' && (
                <div className={clsx(css.memoryActions)}>
                  {entry.source.kind === 'session' && entry.verification === 'unverified' && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => onMarkMemory(entry, 'verified')}>{t('button.verify')}</Button>
                  )}
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => onMarkMemory(entry, 'superseded')}>{t('button.supersede')}</Button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

function TaskStatusControl({
  t, value, disabled = false, onChange,
}: {
  t: Translate
  value: TaskBoardStatus
  disabled?: boolean
  onChange(status: TaskBoardStatus): void
}): JSX.Element {
  return (
    <div
      className={clsx(css.statusControl, disabled && css.statusControlLocked)}
      data-lane={value}
      title={disabled ? t('task.statusLocked') : t('task.status')}
    >
      <span className={clsx(css.statusDot)} />
      <span className={clsx(css.statusLabel)}>{t(`board.${value}`)}</span>
      {!disabled && <span className={clsx(css.statusChevron)} aria-hidden="true">⌄</span>}
      <select
        value={value}
        disabled={disabled}
        aria-label={t('task.status')}
        onChange={event => onChange(event.target.value as TaskBoardStatus)}
      >
        {TASK_LANES.map(status => <option value={status} key={status}>{t(`board.${status}`)}</option>)}
      </select>
    </div>
  )
}

function CreateTaskPanel({
  t, workspaces, preferredWorkspace, remote, onCancel, onCreated, onError,
}: {
  t: Translate
  workspaces: readonly WorkspaceView[]
  preferredWorkspace: WorkspaceId | undefined
  remote: TaskBoardRemote
  onCancel(): void
  onCreated(task: TaskView): Promise<void>
  onError(message: string): void
}): JSX.Element {
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId | undefined>(preferredWorkspace ?? workspaces[0]?.workspaceId)
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('')
  const [owner, setOwner] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submit = async (): Promise<void> => {
    if (workspaceId === undefined || title.trim() === '' || objective.trim() === '' || submitting) return
    setSubmitting(true)
    try {
      const task = await remote.create({
        workspaceId,
        title: title.trim(),
        objective: objective.trim(),
        acceptanceCriteria: acceptanceCriteria.trim(),
        owner: owner.trim(),
      } satisfies TaskCreateInput)
      await onCreated(task)
    } catch (cause) {
      onError(errorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div className={clsx(css.panelBackdrop)} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
      <section className={clsx(css.createPanel)} role="dialog" aria-label={t('button.newTask')}>
        <header><h2>{t('button.newTask')}</h2><button onClick={onCancel} aria-label={t('button.cancel')}>×</button></header>
        <label><span>{t('form.workspace')}</span><select value={workspaceId} onChange={event => setWorkspaceId(event.target.value as WorkspaceId)}>
          {workspaces.map(workspace => <option value={workspace.workspaceId} key={workspace.workspaceId}>{workspace.title}</option>)}
        </select></label>
        <label><span>{t('form.title')}</span><input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder={t('form.titlePlaceholder')} /></label>
        <label><span>{t('form.objective')}</span><textarea rows={5} value={objective} onChange={event => setObjective(event.target.value)} placeholder={t('form.objectivePlaceholder')} /></label>
        <label><span>{t('form.acceptance')}</span><textarea rows={4} value={acceptanceCriteria} onChange={event => setAcceptanceCriteria(event.target.value)} placeholder={t('form.acceptancePlaceholder')} /></label>
        <label><span>{t('form.owner')}</span><input value={owner} onChange={event => setOwner(event.target.value)} placeholder={t('form.ownerPlaceholder')} /></label>
        <footer><Button variant="ghost" onClick={onCancel}>{t('button.cancel')}</Button><Button variant="primary" onClick={() => { void submit() }} disabled={submitting || workspaceId === undefined || title.trim() === '' || objective.trim() === ''}>{submitting ? t('button.creating') : t('button.create')}</Button></footer>
      </section>
    </div>
  )
}

function DeleteTaskPanel({
  t, task, sessionCount, busy, onCancel, onConfirm,
}: {
  t: Translate
  task: TaskView
  sessionCount: number
  busy: boolean
  onCancel(): void
  onConfirm(): void
}): JSX.Element {
  return (
    <div className={clsx(css.panelBackdrop)} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <section className={clsx(css.deletePanel)} role="alertdialog" aria-labelledby="delete-task-title" aria-describedby="delete-task-description">
        <header>
          <h2 id="delete-task-title">{t('delete.title')}</h2>
          <button onClick={onCancel} disabled={busy} aria-label={t('button.cancel')}>×</button>
        </header>
        <div id="delete-task-description" className={clsx(css.deleteCopy)}>
          <p>{interpolate(t('delete.message'), { title: task.title })}</p>
          <p>{interpolate(t('delete.impact'), { memories: task.entries.length, sessions: sessionCount })}</p>
          <p className={clsx(css.keepSessions)}>{t('delete.keepSessions')}</p>
        </div>
        <footer>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>{t('button.cancel')}</Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy}>{t('delete.confirm')}</Button>
        </footer>
      </section>
    </div>
  )
}

function ArchiveTaskPanel({
  t, task, sessionCount, busy, onCancel, onConfirm,
}: {
  t: Translate
  task: TaskView
  sessionCount: number
  busy: boolean
  onCancel(): void
  onConfirm(): void
}): JSX.Element {
  return (
    <div className={clsx(css.panelBackdrop)} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <section className={clsx(css.deletePanel)} role="alertdialog" aria-labelledby="archive-task-title" aria-describedby="archive-task-description">
        <header>
          <h2 id="archive-task-title">{t('archive.title')}</h2>
          <button onClick={onCancel} disabled={busy} aria-label={t('button.cancel')}>×</button>
        </header>
        <div id="archive-task-description" className={clsx(css.deleteCopy)}>
          <p>{interpolate(t('archive.message'), { title: task.title })}</p>
          <p>{interpolate(t('archive.sessions'), { sessions: sessionCount })}</p>
          <p className={clsx(css.keepSessions)}>{t('archive.restoreHint')}</p>
        </div>
        <footer>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>{t('button.cancel')}</Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy}>{t('archive.confirm')}</Button>
        </footer>
      </section>
    </div>
  )
}
