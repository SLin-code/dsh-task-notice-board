/**
 * Locale bindings for the Task Board client half. Registered against
 * `ctx.locale` under the `taskBoard` namespace, so components read display
 * text through `t(key)` and switch language automatically with the app's
 * locale.
 */

/** Every translatable key the Task Board surface consumes. */
export interface TaskBoardStrings {
  'sidebar.action.label': string
  'sidebar.action.tooltip': string
  'modal.title': string
  'modal.close': string
  'button.refresh': string
  'button.newTask': string
  'button.assign': string
  'button.unassign': string
  'button.close': string
  'button.reopen': string
  'button.cancel': string
  'button.create': string
  'button.creating': string
  'banner.assignedTo': string
  'banner.notAssigned': string
  'list.empty': string
  'list.rowMeta': string
  'list.badge.closed': string
  'list.badge.current': string
  'detail.placeholder': string
  'detail.metaLine': string
  'detail.objectiveLabel': string
  'detail.entriesLabel': string
  'detail.entriesEmpty': string
  'detail.entryMeta': string
  'form.titleLabel': string
  'form.titlePlaceholder': string
  'form.objectiveLabel': string
  'form.objectivePlaceholder': string
}

/** Locale key for narrowing via ctx.locale.LocaleNamespaceMap. */
export type TaskBoardKey = keyof TaskBoardStrings

/** English dictionary — used as the source of truth for keys. */
export const en: TaskBoardStrings = {
  'sidebar.action.label': 'Task Board',
  'sidebar.action.tooltip': 'Open the Task Board',
  'modal.title': 'Task Board',
  'modal.close': 'Close',
  'button.refresh': 'Refresh',
  'button.newTask': 'New Task',
  'button.assign': 'Assign',
  'button.unassign': 'Unassign',
  'button.close': 'Close',
  'button.reopen': 'Reopen',
  'button.cancel': 'Cancel',
  'button.create': 'Create Task',
  'button.creating': 'Creating…',
  'banner.assignedTo': 'This session is assigned to “{title}”.',
  'banner.notAssigned': 'This session is not assigned to any Task. Pick one and click Assign.',
  'list.empty': 'No Tasks yet. Click New Task to add one.',
  'list.rowMeta': 'rev {revision} · {entries} entries · updated {updated}',
  'list.badge.closed': 'closed',
  'list.badge.current': 'current',
  'detail.placeholder': 'Select a Task to see its objective and retained entries.',
  'detail.metaLine': 'rev {revision} · status {status}',
  'detail.objectiveLabel': 'Objective',
  'detail.entriesLabel': 'Retained entries ({count})',
  'detail.entriesEmpty': 'No entries retained yet.',
  'detail.entryMeta': 'rev {revision} · {bytes} bytes · {when}',
  'form.titleLabel': 'Title',
  'form.titlePlaceholder': 'Short human-readable name',
  'form.objectiveLabel': 'Objective',
  'form.objectivePlaceholder':
    'What this Task exists to achieve. Sessions assigned to it will see this at each step.',
}

/** Simplified Chinese dictionary. */
export const zh: TaskBoardStrings = {
  'sidebar.action.label': '任务看板',
  'sidebar.action.tooltip': '打开任务看板',
  'modal.title': '任务看板',
  'modal.close': '关闭',
  'button.refresh': '刷新',
  'button.newTask': '新建任务',
  'button.assign': '关联当前会话',
  'button.unassign': '取消关联',
  'button.close': '关闭任务',
  'button.reopen': '重新打开',
  'button.cancel': '取消',
  'button.create': '创建任务',
  'button.creating': '创建中…',
  'banner.assignedTo': '当前会话已关联到「{title}」。',
  'banner.notAssigned': '当前会话未关联任何任务。选择一个任务后点击"关联当前会话"。',
  'list.empty': '暂无任务。点击"新建任务"来创建一个。',
  'list.rowMeta': '版本 {revision} · {entries} 条更新 · 更新于 {updated}',
  'list.badge.closed': '已关闭',
  'list.badge.current': '当前',
  'detail.placeholder': '选择一个任务以查看其目标和已保留的更新。',
  'detail.metaLine': '版本 {revision} · 状态 {status}',
  'detail.objectiveLabel': '目标',
  'detail.entriesLabel': '已保留的更新（共 {count} 条）',
  'detail.entriesEmpty': '暂无保留的更新。',
  'detail.entryMeta': '版本 {revision} · {bytes} 字节 · {when}',
  'form.titleLabel': '标题',
  'form.titlePlaceholder': '简短的人类可读名称',
  'form.objectiveLabel': '目标',
  'form.objectivePlaceholder': '这个任务要达成什么。分配到该任务的会话会在每一步看到此内容。',
}

/**
 * Interpolate `{placeholder}` tokens against a values map.
 * @param template - format string with `{name}` placeholders.
 * @param values - map from placeholder name to substitution.
 * @returns the fully substituted string.
 */
export function interpolate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : `{${name}}`)
}
