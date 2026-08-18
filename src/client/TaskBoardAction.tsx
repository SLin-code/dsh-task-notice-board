/**
 * Task Board action: a sidebar-footer entry that renders one icon in rail
 * mode and a labelled row in wide mode (matching the shipped Settings
 * companion), and on click opens the Task Board modal.
 *
 * The action itself carries no session state; it owns the modal's open flag
 * only. The modal reads / mutates the durable Task store via the remote
 * face passed in through the inject seat, and reads the current-session id
 * imperatively at click time — enough to bind the modal to the session the
 * user is looking at without re-rendering on every session change.
 */

import { useState } from 'react'
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { TaskBoardRemote } from './task-board-remote.ts'
import { TaskBoardModal } from './TaskBoardModal.tsx'
import css from './TaskBoardAction.module.css'

/** Business face injected by the sidebar-footer registration. */
export interface TaskBoardActionInjected {
  /** Task remote face — direct-fetch caller talking to the host TaskStore. */
  readonly remote: TaskBoardRemote
  /** Snapshot of the current session id, read fresh on each call. */
  currentSessionId(): SessionId | undefined
}

/** Composed component props for the sidebar-footer entry. */
type Props =
  & PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'taskBoard'>
  & TaskBoardActionInjected

/**
 * Sidebar-footer action.
 * @param props - wide-state owner share, locale seat, remote face, and
 * current-session accessor.
 */
export function TaskBoardAction({ wide, t, remote, currentSessionId }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const label = t('sidebar.action.label')
  const tooltip = t('sidebar.action.tooltip')

  return (
    <>
      <Tooltip label={tooltip} delayMs={500} disabled={wide}>
        <button
          type="button"
          className={clsx(wide ? css.rowWide : css.rowRail)}
          aria-label={tooltip}
          onClick={() => setOpen(true)}
        >
          <TaskBoardIcon size={wide ? 16 : 18} className={clsx(css.icon)} />
          {wide && <span className={clsx(css.label)}>{label}</span>}
        </button>
      </Tooltip>
      <TaskBoardModal
        open={open}
        onClose={() => setOpen(false)}
        t={t}
        remote={remote}
        sessionId={open ? currentSessionId() : undefined}
      />
    </>
  )
}

/**
 * Inline SVG for the sidebar icon: a clipboard-with-checkmark glyph that
 * matches the visual weight of the shipped IconSettings / IconNewChat icons.
 * Ships inline so this plugin does not pull in an icon set.
 */
function TaskBoardIcon({ size, className }: { size: number, className?: string }): JSX.Element {
  return (
    <svg
      className={clsx(className)}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="2.5" width="10" height="12" rx="1.4" />
      <path d="M5.5 2.5V1.5h5v1" />
      <path d="M5.5 8.5l1.7 1.7 3.3-3.5" />
    </svg>
  )
}
