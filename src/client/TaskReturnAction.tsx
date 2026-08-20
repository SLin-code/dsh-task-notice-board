/** Task ownership shortcut rendered in the native DSH Session header. */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { TranslateNS, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TaskView } from '../task/types.ts'
import type { TaskBoardRemote } from './task-board-remote.ts'
import { interpolate } from './locales.ts'
import {
  getTaskOwnershipRevision,
  requestTaskBoardTask,
  subscribeTaskOwnership,
} from './task-board-navigation.ts'
import css from './TaskReturnAction.module.css'

export interface TaskReturnActionInjected {
  readonly remote: TaskBoardRemote
}

function useOwningTask(sessionId: Props['sessionId'], remote: TaskBoardRemote): TaskView | null {
  const [task, setTask] = useState<TaskView | null>(null)
  const ownershipRevision = useSyncExternalStore(
    subscribeTaskOwnership,
    getTaskOwnershipRevision,
    getTaskOwnershipRevision,
  )

  useEffect(() => {
    let current = true
    setTask(null)
    void remote.getTaskForSession(sessionId)
      .then(next => { if (current) setTask(next ?? null) })
      .catch(() => { if (current) setTask(null) })
    return () => { current = false }
  }, [ownershipRevision, remote, sessionId])

  return task
}

function TaskReturnButton({ task, t }: {
  readonly task: TaskView
  readonly t: TranslateNS<'taskBoard'>
}): JSX.Element {
  const label = interpolate(t('session.returnToTask'), { title: task.title })
  return (
    <button
      type="button"
      className={css.trigger}
      aria-label={label}
      title={t('session.returnToTaskHint')}
      onClick={() => { requestTaskBoardTask(task.id) }}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M6.5 3.5 2 8l4.5 4.5M2.5 8H14" />
      </svg>
      <span className={css.prefix}>{t('session.taskLabel')}</span>
      <span className={css.title}>{task.title}</span>
    </button>
  )
}

type Props =
  & PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'taskBoard'>
  & TaskReturnActionInjected

/** Open the Task that owns the current Session, preserving native Session navigation. */
export function TaskReturnAction({ sessionId, remote, t }: Props): JSX.Element | null {
  const task = useOwningTask(sessionId, remote)
  if (task === null) return null
  return <TaskReturnButton task={task} t={t} />
}

type BlankProps =
  & PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'taskBoard'>
  & TaskReturnActionInjected

/** Return affordance for a blank Session, whose native DSH header is hidden. */
export function BlankTaskReturnAction({ sessionId, useSession, remote, t }: BlankProps): JSX.Element | null {
  const blank = useSession(state => state.blank)
  const task = useOwningTask(sessionId, remote)
  if (!blank || task === null) return null
  return (
    <div className={css.blankReturn}>
      <TaskReturnButton task={task} t={t} />
    </div>
  )
}
