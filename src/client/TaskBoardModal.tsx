/**
 * Task Board modal: full list / detail / create / assign / close surface,
 * portalled into the page through ui-primitives' Modal (which handles the
 * mask, Escape key, and body-level portal). Every read hits the remote
 * face; no client-side subscription.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { TaskAssignment, TaskCreateInput, TaskId, TaskView } from '../task/types.ts'
import { interpolate, type TaskBoardStrings } from './locales.ts'
import css from './TaskBoardModal.module.css'

type RemoteFace = TypertRemoteNamespaceMap['taskBoard']

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

function formatBytes(text: string): number {
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
 * The modal.
 * @param props - open state, close callback, locale accessor, remote face,
 * and the current session id snapshot.
 */
export function TaskBoardModal({ open, onClose, t, remote, sessionId }: Props): JSX.Element | null {
  const [state, setState] = useState<LoadState>(EMPTY_STATE)
  const [selected, setSelected] = useState<TaskId | null>(null)
  const [showCreate, setShowCreate] = useState(false)

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

  // Reload every time the modal is opened. Otherwise data grows stale between
  // sessions the user visited from another tab, another user, or the model.
  useEffect(() => {
    if (open) void refresh()
    else {
      setSelected(null)
      setShowCreate(false)
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

  const onCreate = useCallback(async (input: TaskCreateInput): Promise<boolean> => {
    try {
      await remote.create(input)
      await refresh()
      return true
    } catch (cause) {
      setState(previous => ({ ...previous, error: errorMessage(cause) }))
      return false
    }
  }, [remote, refresh])

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

  const onClose_ = useCallback(async (task: TaskView) => {
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modal.title')}
      closeLabel={t('modal.close')}
      className={clsx(css.dialog)}
      contentClassName={clsx(css.content)}
      footer={(
        <div className={css.footer}>
          <Button variant="ghost" onClick={() => void refresh()} disabled={state.loading}>
            {t('button.refresh')}
          </Button>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            {t('button.newTask')}
          </Button>
        </div>
      )}
    >
      {state.error !== null && <div className={css.error}>{state.error}</div>}

      <div className={css.banner}>
        {sessionId === undefined
          ? <span className={css.muted}>{t('banner.notAssigned')}</span>
          : currentTask === undefined
            ? <span className={css.muted}>{t('banner.notAssigned')}</span>
            : (
              <>
                <span>{interpolate(t('banner.assignedTo'), { title: currentTask.title })}</span>
                <Button variant="ghost" onClick={() => void onUnassign()}>
                  {t('button.unassign')}
                </Button>
              </>
            )}
      </div>

      <div className={css.body}>
        <ul className={css.list}>
          {state.tasks.length === 0 && !state.loading && (
            <li className={css.empty}>{t('list.empty')}</li>
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
                    {task.status === 'closed' && (
                      <span className={css.badgeClosed}>{t('list.badge.closed')}</span>
                    )}
                    {isCurrent && (
                      <span className={css.badgeCurrent}>{t('list.badge.current')}</span>
                    )}
                  </div>
                  <div className={css.rowMeta}>
                    {interpolate(t('list.rowMeta'), {
                      revision: task.revision,
                      entries: task.entries.length,
                      updated: formatTimestamp(task.updatedAt),
                    })}
                  </div>
                </button>
                <div className={css.rowActions}>
                  {sessionId !== undefined && !isCurrent && task.status === 'open' && (
                    <Button variant="ghost" onClick={() => void onAssign(task.id)}>
                      {t('button.assign')}
                    </Button>
                  )}
                  {task.status === 'open'
                    ? (
                      <Button variant="ghost" onClick={() => void onClose_(task)}>
                        {t('button.close')}
                      </Button>
                    )
                    : (
                      <Button variant="ghost" onClick={() => void onReopen(task)}>
                        {t('button.reopen')}
                      </Button>
                    )}
                </div>
              </li>
            )
          })}
        </ul>

        <aside className={css.detail}>
          {selectedTask === undefined
            ? <span className={css.muted}>{t('detail.placeholder')}</span>
            : <TaskDetail task={selectedTask} t={t} />}
        </aside>
      </div>

      {showCreate && (
        <CreateDialog
          t={t}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (input) => {
            const ok = await onCreate(input)
            if (ok) setShowCreate(false)
          }}
        />
      )}
    </Modal>
  )
}

/** Objective + retained entries pane. */
function TaskDetail({ task, t }: { task: TaskView, t: Translate }): JSX.Element {
  return (
    <div className={css.detailInner}>
      <div className={css.detailHeader}>
        <div className={css.detailTitle}>{task.title}</div>
        <div className={css.muted}>
          {interpolate(t('detail.metaLine'), { revision: task.revision, status: task.status })}
        </div>
      </div>
      <div className={css.detailSection}>
        <div className={css.sectionLabel}>{t('detail.objectiveLabel')}</div>
        <pre className={css.pre}>{task.objective}</pre>
      </div>
      <div className={css.detailSection}>
        <div className={css.sectionLabel}>
          {interpolate(t('detail.entriesLabel'), { count: task.entries.length })}
        </div>
        {task.entries.length === 0
          ? <span className={css.muted}>{t('detail.entriesEmpty')}</span>
          : (
            <ol className={css.entries}>
              {task.entries.map(entry => (
                <li key={entry.id} className={css.entry}>
                  <div className={css.entryMeta}>
                    {interpolate(t('detail.entryMeta'), {
                      revision: entry.revision,
                      bytes: formatBytes(entry.text),
                      when: formatTimestamp(entry.createdAt),
                    })}
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

/** Inline "new task" dialog. */
function CreateDialog({
  t,
  onCancel,
  onSubmit,
}: {
  t: Translate
  onCancel: () => void
  onSubmit: (input: TaskCreateInput) => Promise<void>
}): JSX.Element {
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = title.trim().length > 0 && objective.trim().length > 0 && !submitting

  return (
    <Modal
      open
      onClose={onCancel}
      title={t('button.newTask')}
      closeLabel={t('button.cancel')}
      className={clsx(css.createDialog)}
      footer={(
        <div className={css.footer}>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            {t('button.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={() => {
              setSubmitting(true)
              void onSubmit({ title: title.trim(), objective: objective.trim() })
                .finally(() => setSubmitting(false))
            }}
          >
            {submitting ? t('button.creating') : t('button.create')}
          </Button>
        </div>
      )}
    >
      <label className={css.field}>
        <span className={css.fieldLabel}>{t('form.titleLabel')}</span>
        <Input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder={t('form.titlePlaceholder')}
          autoFocus
        />
      </label>
      <label className={css.field}>
        <span className={css.fieldLabel}>{t('form.objectiveLabel')}</span>
        <textarea
          className={css.textarea}
          rows={6}
          value={objective}
          onChange={event => setObjective(event.target.value)}
          placeholder={t('form.objectivePlaceholder')}
        />
      </label>
    </Modal>
  )
}
