/**
 * Task Board view: session-bound tab under `conversation.view`. Lists every
 * durable Task, highlights the Task this Session is assigned to, and offers
 * create / assign / unassign / close through the injected `taskBoard` remote
 * face. All state is fetched on demand; there is no client-side cache and no
 * subscription — a change roundtrip re-issues `list()` / `getAssignment()`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  TaskAssignment,
  TaskCreateInput,
  TaskId,
  TaskUpdateInput,
  TaskView,
} from '../task/types.ts'
import css from './TaskBoardView.module.css'

/** Business face injected by the session-scoped register call. */
export interface TaskBoardInjected {
  readonly sessionId: SessionId
  list(): Promise<readonly TaskView[]>
  get(id: TaskId): Promise<TaskView | undefined>
  create(input: TaskCreateInput): Promise<TaskView>
  update(id: TaskId, expectedRevision: number, input: TaskUpdateInput): Promise<TaskView>
  assignSession(taskId: TaskId): Promise<TaskAssignment>
  unassignSession(): Promise<boolean>
  getAssignment(): Promise<TaskAssignment | undefined>
}

/** Full props for the registration site. */
type Props = ConvViewProps & InjectFace<TaskBoardInjected>

interface LoadState {
  readonly loading: boolean
  readonly error: string | null
  readonly tasks: readonly TaskView[]
  readonly assignment: TaskAssignment | undefined
}

const EMPTY_STATE: LoadState = { loading: true, error: null, tasks: [], assignment: undefined }

function formatBytes(text: string): string {
  const bytes = new TextEncoder().encode(text).length
  return `${bytes.toLocaleString()} bytes`
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString()
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}

/**
 * Task Board tab.
 * @param props - framework-composed owner share intersected with the injected
 * `taskBoard` face. The slot framework spreads the inject factory's return
 * over the component props (see the {@link InjectFace} contract), so
 * `list` / `create` / etc. land as top-level props rather than nested under
 * an `inject` field.
 */
export function TaskBoardView({
  list, getAssignment, create, update, assignSession, unassignSession,
}: Props): JSX.Element {
  const [state, setState] = useState<LoadState>(EMPTY_STATE)
  const [selected, setSelected] = useState<TaskId | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  /** Fetch the two remote reads in parallel and commit the resulting snapshot. */
  const refresh = useCallback(async () => {
    setState(previous => ({ ...previous, loading: true, error: null }))
    try {
      const [tasks, assignment] = await Promise.all([list(), getAssignment()])
      setState({ loading: false, error: null, tasks, assignment })
    } catch (cause) {
      setState(previous => ({ ...previous, loading: false, error: errorMessage(cause) }))
    }
  }, [list, getAssignment])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selectedTask = useMemo(
    () => (selected === null ? undefined : state.tasks.find(task => task.id === selected)),
    [selected, state.tasks],
  )

  const currentTaskId = state.assignment?.taskId
  const currentTask = useMemo(
    () => (currentTaskId === undefined ? undefined : state.tasks.find(task => task.id === currentTaskId)),
    [currentTaskId, state.tasks],
  )

  const onCreate = useCallback(async (input: TaskCreateInput) => {
    try {
      await create(input)
      setShowCreate(false)
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    }
  }, [create, refresh])

  const onAssign = useCallback(async (taskId: TaskId) => {
    try {
      await assignSession(taskId)
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    }
  }, [assignSession, refresh])

  const onUnassign = useCallback(async () => {
    try {
      await unassignSession()
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    }
  }, [unassignSession, refresh])

  const onClose = useCallback(async (task: TaskView) => {
    try {
      await update(task.id, task.revision, { status: 'closed' })
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    }
  }, [update, refresh])

  const onReopen = useCallback(async (task: TaskView) => {
    try {
      await update(task.id, task.revision, { status: 'open' })
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    }
  }, [update, refresh])

  return (
    <div className={css.root}>
      <header className={css.header}>
        <h2 className={css.title}>Task Board</h2>
        <div className={css.headerActions}>
          <button type="button" className={css.button} onClick={() => void refresh()} disabled={state.loading}>
            Refresh
          </button>
          <button type="button" className={css.buttonPrimary} onClick={() => setShowCreate(true)}>
            New Task
          </button>
        </div>
      </header>

      {state.error !== null && <div className={css.error}>{state.error}</div>}

      <section className={css.assignmentBanner}>
        {currentTask === undefined
          ? (
            <span className={css.muted}>
              This session is not assigned to any Task. Pick one below and click Assign.
            </span>
          )
          : (
            <>
              <span>
                This session is assigned to <strong>{currentTask.title}</strong>.
              </span>
              <button type="button" className={css.buttonGhost} onClick={() => void onUnassign()}>
                Unassign
              </button>
            </>
          )}
      </section>

      <div className={css.body}>
        <ul className={css.list}>
          {state.tasks.length === 0 && !state.loading && (
            <li className={css.empty}>No Tasks yet. Click New Task to add one.</li>
          )}
          {state.tasks.map((task) => {
            const isCurrent = currentTaskId === task.id
            const isSelected = selected === task.id
            const rowClasses = [css.row]
            if (isCurrent) rowClasses.push(css.rowCurrent)
            if (isSelected) rowClasses.push(css.rowSelected)
            return (
              <li key={task.id} className={rowClasses.join(' ')}>
                <button
                  type="button"
                  className={css.rowMain}
                  onClick={() => setSelected(task.id)}
                >
                  <div className={css.rowTitle}>
                    <span>{task.title}</span>
                    {task.status === 'closed' && <span className={css.badgeClosed}>closed</span>}
                    {isCurrent && <span className={css.badgeCurrent}>current</span>}
                  </div>
                  <div className={css.rowMeta}>
                    rev {task.revision} · {task.entries.length} entries · updated {formatTimestamp(task.updatedAt)}
                  </div>
                </button>
                <div className={css.rowActions}>
                  {!isCurrent && task.status === 'open' && (
                    <button
                      type="button"
                      className={css.buttonSmall}
                      onClick={() => void onAssign(task.id)}
                    >
                      Assign
                    </button>
                  )}
                  {task.status === 'open'
                    ? (
                      <button
                        type="button"
                        className={css.buttonSmall}
                        onClick={() => void onClose(task)}
                      >
                        Close
                      </button>
                    )
                    : (
                      <button
                        type="button"
                        className={css.buttonSmall}
                        onClick={() => void onReopen(task)}
                      >
                        Reopen
                      </button>
                    )}
                </div>
              </li>
            )
          })}
        </ul>

        <aside className={css.detail}>
          {selectedTask === undefined
            ? <span className={css.muted}>Select a Task to see its objective and retained entries.</span>
            : <TaskDetail task={selectedTask} />}
        </aside>
      </div>

      {showCreate && (
        <CreateDialog
          onCancel={() => setShowCreate(false)}
          onSubmit={onCreate}
        />
      )}
    </div>
  )
}

/** Objective + retained entries panel for one Task. */
function TaskDetail({ task }: { task: TaskView }): JSX.Element {
  return (
    <div className={css.detailInner}>
      <div className={css.detailHeader}>
        <div className={css.detailTitle}>{task.title}</div>
        <div className={css.muted}>rev {task.revision} · status {task.status}</div>
      </div>
      <div className={css.detailSection}>
        <div className={css.sectionLabel}>Objective</div>
        <pre className={css.pre}>{task.objective}</pre>
      </div>
      <div className={css.detailSection}>
        <div className={css.sectionLabel}>Retained entries ({task.entries.length})</div>
        {task.entries.length === 0
          ? <span className={css.muted}>No entries retained yet.</span>
          : (
            <ol className={css.entries}>
              {task.entries.map(entry => (
                <li key={entry.id} className={css.entry}>
                  <div className={css.entryMeta}>
                    rev {entry.revision} · {formatBytes(entry.text)} · {formatTimestamp(entry.createdAt)}
                  </div>
                  <pre className={css.pre}>{entry.text}</pre>
                </li>
              ))}
            </ol>
          )}
      </div>
    </div>
  )
}

/** Modal-ish inline form for creating a Task; keeps state local. */
function CreateDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (input: TaskCreateInput) => Promise<void>
}): JSX.Element {
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = title.trim().length > 0 && objective.trim().length > 0 && !submitting

  return (
    <div className={css.modalBackdrop} role="dialog" aria-modal="true">
      <div className={css.modal}>
        <h3 className={css.modalTitle}>New Task</h3>
        <label className={css.field}>
          <span className={css.fieldLabel}>Title</span>
          <input
            className={css.input}
            type="text"
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Short human-readable name"
            autoFocus
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>Objective</span>
          <textarea
            className={css.textarea}
            rows={6}
            value={objective}
            onChange={event => setObjective(event.target.value)}
            placeholder="What this Task exists to achieve. Sessions assigned to it will see this at each step."
          />
        </label>
        <div className={css.modalActions}>
          <button type="button" className={css.button} onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className={css.buttonPrimary}
            disabled={!canSubmit}
            onClick={() => {
              setSubmitting(true)
              void onSubmit({ title: title.trim(), objective: objective.trim() })
                .finally(() => setSubmitting(false))
            }}
          >
            {submitting ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}
