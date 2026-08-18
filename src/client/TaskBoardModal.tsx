/**
 * Task Board modal: single Modal instance, two views (`list` and `create`).
 *
 * The earlier version nested a second Modal for the create form; two Modals
 * portal to `document.body` at once caused the primary card sizing to fight
 * with the nested one and, more importantly, the nested Modal's Escape
 * listener kept firing against the outer's `onClose`, which is the bug that
 * made "Create Task" appear inert. Everything renders in one Modal here;
 * `view` swaps the body and footer contents without unmounting the shell.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TaskAssignment, TaskCreateInput, TaskId, TaskView } from '../task/types.ts'
import { interpolate, type TaskBoardStrings } from './locales.ts'
import type { TaskBoardRemote } from './task-board-remote.ts'
import css from './TaskBoardModal.module.css'

type RemoteFace = TaskBoardRemote

/** Locale accessor as the standard-kit slot seat provides it. */
type Translate = (key: keyof TaskBoardStrings) => string

interface Props {
  readonly open: boolean
  readonly onClose: () => void
  readonly t: Translate
  readonly remote: RemoteFace
  /** Current session id at the moment the modal was opened (may be undefined). */
  readonly sessionId: SessionId | undefined
}

interface LoadState {
  readonly loading: boolean
  readonly error: string | null
  readonly tasks: readonly TaskView[]
  readonly assignment: TaskAssignment | undefined
}

const EMPTY_STATE: LoadState = { loading: true, error: null, tasks: [], assignment: undefined }

type View = 'list' | 'create'

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString()
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}

/**
 * The Task Board modal.
 * @param props - open state, close callback, locale accessor, remote face,
 * and the current session id snapshot.
 */
export function TaskBoardModal({ open, onClose, t, remote, sessionId }: Props): JSX.Element | null {
  const [state, setState] = useState<LoadState>(EMPTY_STATE)
  const [selected, setSelected] = useState<TaskId | null>(null)
  const [view, setView] = useState<View>('list')

  // Create-form state (kept alongside the parent so switching views does not
  // reset a half-filled draft the user pushed off screen).
  const [createTitle, setCreateTitle] = useState('')
  const [createObjective, setCreateObjective] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const refresh = useCallback(async () => {
    setState(previous => ({ ...previous, loading: true, error: null }))
    try {
      const [tasks, assignment] = await Promise.all([
        remote.list(),
        sessionId === undefined ? Promise.resolve(undefined) : remote.getAssignment(sessionId),
      ])
      setState({ loading: false, error: null, tasks, assignment })
    } catch (cause) {
      setState(previous => ({ ...previous, loading: false, error: errorMessage(cause) }))
    }
  }, [remote, sessionId])

  useEffect(() => {
    if (open) void refresh()
    else {
      setSelected(null)
      setView('list')
      setCreateTitle('')
      setCreateObjective('')
      setSubmitting(false)
    }
  }, [open, refresh])

  const selectedTask = useMemo(
    () => (selected === null ? undefined : state.tasks.find(task => task.id === selected)),
    [selected, state.tasks],
  )

  const currentTaskId = state.assignment?.taskId
  const currentTask = useMemo(
    () => (currentTaskId === undefined ? undefined : state.tasks.find(task => task.id === currentTaskId)),
    [currentTaskId, state.tasks],
  )

  const onCreate = useCallback(async () => {
    const title = createTitle.trim()
    const objective = createObjective.trim()
    if (title.length === 0 || objective.length === 0 || submitting) return
    setSubmitting(true)
    try {
      await remote.create({ title, objective } satisfies TaskCreateInput)
      setCreateTitle('')
      setCreateObjective('')
      setView('list')
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    } finally {
      setSubmitting(false)
    }
  }, [remote, refresh, createTitle, createObjective, submitting])

  const onAssign = useCallback(async (taskId: TaskId) => {
    if (sessionId === undefined) return
    try {
      await remote.assignSession(sessionId, taskId)
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    }
  }, [remote, refresh, sessionId])

  const onUnassign = useCallback(async () => {
    if (sessionId === undefined) return
    try {
      await remote.unassignSession(sessionId)
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    }
  }, [remote, refresh, sessionId])

  const onCloseTask = useCallback(async (task: TaskView) => {
    try {
      await remote.update(task.id, task.revision, { status: 'closed' })
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    }
  }, [remote, refresh])

  const onReopen = useCallback(async (task: TaskView) => {
    try {
      await remote.update(task.id, task.revision, { status: 'open' })
      await refresh()
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
    }
  }, [remote, refresh])

  const canSubmit = createTitle.trim().length > 0 && createObjective.trim().length > 0 && !submitting

  const listFooter = (
    <>
      <Button variant="ghost" onClick={() => void refresh()} disabled={state.loading}>
        {t('button.refresh')}
      </Button>
      <Button variant="primary" onClick={() => setView('create')}>
        {t('button.newTask')}
      </Button>
    </>
  )

  const createFooter = (
    <>
      <Button variant="ghost" onClick={() => setView('list')} disabled={submitting}>
        {t('button.cancel')}
      </Button>
      <Button variant="primary" onClick={() => { void onCreate() }} disabled={!canSubmit}>
        {submitting ? t('button.creating') : t('button.create')}
      </Button>
    </>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modal.title')}
      closeLabel={t('modal.close')}
      className={clsx(css.dialog)}
      contentClassName={clsx(css.content)}
      footer={view === 'list' ? listFooter : createFooter}
    >
      {state.error !== null && <div className={clsx(css.error)}>{state.error}</div>}
      {view === 'list'
        ? (
          <ListView
            t={t}
            state={state}
            sessionId={sessionId}
            currentTask={currentTask}
            currentTaskId={currentTaskId}
            selected={selected}
            selectedTask={selectedTask}
            onSelect={setSelected}
            onAssign={onAssign}
            onUnassign={onUnassign}
            onCloseTask={onCloseTask}
            onReopen={onReopen}
          />
        )
        : (
          <CreateView
            t={t}
            title={createTitle}
            objective={createObjective}
            onTitleChange={setCreateTitle}
            onObjectiveChange={setCreateObjective}
          />
        )}
    </Modal>
  )
}

interface ListViewProps {
  readonly t: Translate
  readonly state: LoadState
  readonly sessionId: SessionId | undefined
  readonly currentTask: TaskView | undefined
  readonly currentTaskId: TaskId | undefined
  readonly selected: TaskId | null
  readonly selectedTask: TaskView | undefined
  onSelect(id: TaskId): void
  onAssign(id: TaskId): Promise<void>
  onUnassign(): Promise<void>
  onCloseTask(task: TaskView): Promise<void>
  onReopen(task: TaskView): Promise<void>
}

function ListView({
  t, state, sessionId, currentTask, currentTaskId, selected, selectedTask,
  onSelect, onAssign, onUnassign, onCloseTask, onReopen,
}: ListViewProps): JSX.Element {
  return (
    <>
      <div className={clsx(css.banner)}>
        {sessionId === undefined
          ? <span className={clsx(css.mutedInline)}>{t('banner.notAssigned')}</span>
          : currentTask === undefined
            ? <span className={clsx(css.mutedInline)}>{t('banner.notAssigned')}</span>
            : (
              <>
                <span>{interpolate(t('banner.assignedTo'), { title: currentTask.title })}</span>
                <Button variant="ghost" size="sm" onClick={() => { void onUnassign() }}>
                  {t('button.unassign')}
                </Button>
              </>
            )}
      </div>

      <div className={clsx(css.body)}>
        <ul className={clsx(css.list)}>
          {state.tasks.length === 0 && !state.loading && (
            <li className={clsx(css.empty)}>{t('list.empty')}</li>
          )}
          {state.tasks.map((task) => {
            const isCurrent = currentTaskId === task.id
            const isSelected = selected === task.id
            return (
              <li key={task.id} className={clsx(css.row, isCurrent && css.rowCurrent, isSelected && css.rowSelected)}>
                <button
                  type="button"
                  className={clsx(css.rowMain)}
                  onClick={() => onSelect(task.id)}
                >
                  <div className={clsx(css.rowTitle)}>
                    <span className={clsx(css.rowTitleText)}>{task.title}</span>
                    {task.status === 'closed' && (
                      <span className={clsx(css.badgeClosed)}>{t('list.badge.closed')}</span>
                    )}
                    {isCurrent && (
                      <span className={clsx(css.badgeCurrent)}>{t('list.badge.current')}</span>
                    )}
                  </div>
                  <div className={clsx(css.rowMeta)}>
                    {interpolate(t('list.rowMeta'), {
                      revision: task.revision,
                      entries: task.entries.length,
                      updated: formatTimestamp(task.updatedAt),
                    })}
                  </div>
                </button>
                <div className={clsx(css.rowActions)}>
                  {sessionId !== undefined && !isCurrent && task.status === 'open' && (
                    <Button variant="ghost" size="sm" onClick={() => { void onAssign(task.id) }}>
                      {t('button.assign')}
                    </Button>
                  )}
                  {task.status === 'open'
                    ? (
                      <Button variant="ghost" size="sm" onClick={() => { void onCloseTask(task) }}>
                        {t('button.close')}
                      </Button>
                    )
                    : (
                      <Button variant="ghost" size="sm" onClick={() => { void onReopen(task) }}>
                        {t('button.reopen')}
                      </Button>
                    )}
                </div>
              </li>
            )
          })}
        </ul>

        <aside className={clsx(css.detail)}>
          {selectedTask === undefined
            ? <div className={clsx(css.detailPlaceholder)}>{t('detail.placeholder')}</div>
            : <TaskDetail task={selectedTask} t={t} />}
        </aside>
      </div>
    </>
  )
}

/** Objective + retained entries pane. */
function TaskDetail({ task, t }: { task: TaskView, t: Translate }): JSX.Element {
  return (
    <div className={clsx(css.detailInner)}>
      <div className={clsx(css.detailHeader)}>
        <div className={clsx(css.detailTitle)}>{task.title}</div>
        <div className={clsx(css.detailMeta)}>
          {interpolate(t('detail.metaLine'), { revision: task.revision, status: task.status })}
        </div>
      </div>
      <div className={clsx(css.detailSection)}>
        <div className={clsx(css.sectionLabel)}>{t('detail.objectiveLabel')}</div>
        <pre className={clsx(css.pre)}>{task.objective}</pre>
      </div>
      <div className={clsx(css.detailSection)}>
        <div className={clsx(css.sectionLabel)}>
          {interpolate(t('detail.entriesLabel'), { count: task.entries.length })}
        </div>
        {task.entries.length === 0
          ? <div className={clsx(css.detailPlaceholder)}>{t('detail.entriesEmpty')}</div>
          : (
            <ol className={clsx(css.entries)}>
              {task.entries.map(entry => (
                <li key={entry.id} className={clsx(css.entry)}>
                  <div className={clsx(css.entryMeta)}>
                    {interpolate(t('detail.entryMeta'), {
                      revision: entry.revision,
                      bytes: utf8ByteLength(entry.text),
                      when: formatTimestamp(entry.createdAt),
                    })}
                  </div>
                  <pre className={clsx(css.pre)}>{entry.text}</pre>
                </li>
              ))}
            </ol>
          )}
      </div>
    </div>
  )
}

interface CreateViewProps {
  readonly t: Translate
  readonly title: string
  readonly objective: string
  onTitleChange(next: string): void
  onObjectiveChange(next: string): void
}

/** Inline "new task" view, part of the same outer modal. */
function CreateView({ t, title, objective, onTitleChange, onObjectiveChange }: CreateViewProps): JSX.Element {
  return (
    <div className={clsx(css.form)}>
      <label className={clsx(css.field)}>
        <span className={clsx(css.fieldLabel)}>{t('form.titleLabel')}</span>
        <Input
          value={title}
          onChange={event => onTitleChange(event.target.value)}
          placeholder={t('form.titlePlaceholder')}
          autoFocus
        />
      </label>
      <label className={clsx(css.field)}>
        <span className={clsx(css.fieldLabel)}>{t('form.objectiveLabel')}</span>
        <textarea
          className={clsx(css.textarea)}
          rows={8}
          value={objective}
          onChange={event => onObjectiveChange(event.target.value)}
          placeholder={t('form.objectivePlaceholder')}
        />
      </label>
    </div>
  )
}
