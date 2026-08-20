/** Localized copy for the Task Collaboration control center. */

export interface TaskBoardStrings {
  'sidebar.action.label': string
  'sidebar.action.tooltip': string
  'modal.title': string
  'modal.close': string
  'nav.overview': string
  'nav.workspaces': string
  'nav.allTasks': string
  'nav.archived': string
  'nav.legacy': string
  'header.taskBoard': string
  'header.taskBoardHint': string
  'header.sessionBoard': string
  'header.archivedTasks': string
  'header.archivedTasksHint': string
  'button.refresh': string
  'button.newTask': string
  'button.newSession': string
  'button.linkCurrent': string
  'button.back': string
  'button.cancel': string
  'button.create': string
  'button.creating': string
  'button.addMemory': string
  'button.openSession': string
  'button.openTask': string
  'button.verify': string
  'button.supersede': string
  'button.archiveTask': string
  'button.restoreTask': string
  'button.deleteTask': string
  'board.backlog': string
  'board.in_progress': string
  'board.review': string
  'board.done': string
  'board.empty': string
  'task.sessions': string
  'task.memories': string
  'task.owner': string
  'task.unassigned': string
  'task.updated': string
  'task.objective': string
  'task.acceptance': string
  'task.status': string
  'task.statusLocked': string
  'task.detailLabel': string
  'task.archivedAt': string
  'session.ready': string
  'session.running': string
  'session.attention': string
  'session.ended': string
  'session.empty': string
  'session.approval': string
  'session.question': string
  'session.planReview': string
  'session.idle': string
  'session.completed': string
  'session.archived': string
  'session.archivedHint': string
  'session.activeCount': string
  'session.archivedCount': string
  'session.archivedGroup': string
  'session.archivedGroupHint': string
  'session.idLabel': string
  'session.viewTranscript': string
  'session.taskLabel': string
  'session.returnToTask': string
  'session.returnToTaskHint': string
  'transcript.title': string
  'transcript.hint': string
  'transcript.close': string
  'transcript.loading': string
  'transcript.loadOlder': string
  'transcript.empty': string
  'transcript.user': string
  'transcript.assistant': string
  'transcript.images': string
  'transcript.tool': string
  'transcript.truncated': string
  'memory.title': string
  'memory.hint': string
  'memory.empty': string
  'memory.sourceUser': string
  'memory.sourceSession': string
  'memory.unverified': string
  'memory.verified': string
  'memory.superseded': string
  'memory.kind.summary': string
  'memory.kind.decision': string
  'memory.kind.finding': string
  'memory.kind.blocker': string
  'memory.kind.evidence': string
  'memory.kind.handoff': string
  'form.workspace': string
  'form.title': string
  'form.titlePlaceholder': string
  'form.objective': string
  'form.objectivePlaceholder': string
  'form.acceptance': string
  'form.acceptancePlaceholder': string
  'form.owner': string
  'form.ownerPlaceholder': string
  'form.memoryKind': string
  'form.memoryText': string
  'form.memoryPlaceholder': string
  'notice.noWorkspace': string
  'notice.pending': string
  'archive.empty': string
  'archive.title': string
  'archive.message': string
  'archive.sessions': string
  'archive.restoreHint': string
  'archive.partialFailure': string
  'archive.syncPendingTitle': string
  'archive.syncPending': string
  'archive.retry': string
  'archive.confirm': string
  'delete.title': string
  'delete.message': string
  'delete.impact': string
  'delete.keepSessions': string
  'delete.confirm': string
}

export type TaskBoardKey = keyof TaskBoardStrings

export const en: TaskBoardStrings = {
  'sidebar.action.label': 'Task Control Center',
  'sidebar.action.tooltip': 'Open Task collaboration',
  'modal.title': 'Task Collaboration',
  'modal.close': 'Close',
  'nav.overview': 'CONTROL CENTER',
  'nav.workspaces': 'WORKSPACES',
  'nav.allTasks': 'All Tasks',
  'nav.archived': 'Archived',
  'nav.legacy': 'Unassigned workspace',
  'header.taskBoard': 'Task Board',
  'header.taskBoardHint': 'Organize work by Task, then run collaborating Sessions under it.',
  'header.sessionBoard': 'Session Board',
  'header.archivedTasks': 'Archived Tasks',
  'header.archivedTasksHint': 'Archived Tasks leave the active board. Their DSH Sessions are archived too.',
  'button.refresh': 'Refresh',
  'button.newTask': 'New Task',
  'button.newSession': 'New Session',
  'button.linkCurrent': 'Link current blank Session',
  'button.back': 'Task Board',
  'button.cancel': 'Cancel',
  'button.create': 'Create Task',
  'button.creating': 'Creating…',
  'button.addMemory': 'Add memory',
  'button.openSession': 'Open',
  'button.openTask': 'Open Task',
  'button.verify': 'Verify',
  'button.supersede': 'Supersede',
  'button.archiveTask': 'Archive Task & Sessions',
  'button.restoreTask': 'Restore Task',
  'button.deleteTask': 'Delete Task',
  'board.backlog': 'To do',
  'board.in_progress': 'In progress',
  'board.review': 'Needs you',
  'board.done': 'Done',
  'board.empty': 'No Tasks in this lane.',
  'task.sessions': '{count} Sessions',
  'task.memories': '{count} memories',
  'task.owner': 'Owner: {owner}',
  'task.unassigned': 'Unassigned',
  'task.updated': 'Updated {when}',
  'task.objective': 'Objective',
  'task.acceptance': 'Acceptance criteria',
  'task.status': 'Task lane',
  'task.statusLocked': 'Resolve the pending Session interaction before changing this status.',
  'task.detailLabel': 'Task workspace',
  'task.archivedAt': 'Archived {when}',
  'session.ready': 'Ready to continue',
  'session.running': 'Running',
  'session.attention': 'Needs you',
  'session.ended': 'Ended',
  'session.empty': 'No Sessions in this lane.',
  'session.approval': 'Waiting for approval',
  'session.question': 'Waiting for answer',
  'session.planReview': 'Waiting for plan review',
  'session.idle': 'Ready',
  'session.completed': 'Completed',
  'session.archived': 'Archived',
  'session.archivedHint': 'This Session is archived in DSH and is available here as read-only metadata.',
  'session.activeCount': '{count} active',
  'session.archivedCount': '{count} archived',
  'session.archivedGroup': 'Archived Sessions',
  'session.archivedGroupHint': 'Kept under this Task for reference. Select a Session to read its archived conversation here.',
  'session.idLabel': 'Session ID',
  'session.viewTranscript': 'View conversation',
  'session.taskLabel': 'Task',
  'session.returnToTask': 'Return to task: {title}',
  'session.returnToTaskHint': 'Open this Session’s owning Task in the control center',
  'transcript.title': 'Archived conversation',
  'transcript.hint': 'Read-only history from this Session. Internal context, reasoning, and tool details are hidden.',
  'transcript.close': 'Close conversation',
  'transcript.loading': 'Loading conversation…',
  'transcript.loadOlder': 'Load older messages',
  'transcript.empty': 'This Session has no visible conversation messages.',
  'transcript.user': 'You',
  'transcript.assistant': 'Assistant',
  'transcript.images': '{count} image(s)',
  'transcript.tool': 'Used {name}',
  'transcript.truncated': 'Long message truncated',
  'memory.title': 'Task long-term memory',
  'memory.hint': 'Shared with every Session under this Task. Raw transcripts are never synced.',
  'memory.empty': 'No durable memory yet.',
  'memory.sourceUser': 'User',
  'memory.sourceSession': 'Session {session}',
  'memory.unverified': 'Unverified',
  'memory.verified': 'Verified',
  'memory.superseded': 'Superseded',
  'memory.kind.summary': 'Summary',
  'memory.kind.decision': 'Decision',
  'memory.kind.finding': 'Finding',
  'memory.kind.blocker': 'Blocker',
  'memory.kind.evidence': 'Evidence',
  'memory.kind.handoff': 'Handoff',
  'form.workspace': 'Workspace',
  'form.title': 'Title',
  'form.titlePlaceholder': 'What needs to be done?',
  'form.objective': 'Objective',
  'form.objectivePlaceholder': 'The outcome every collaborating Session should work toward.',
  'form.acceptance': 'Acceptance criteria',
  'form.acceptancePlaceholder': 'How will you know the Task is complete?',
  'form.owner': 'Owner',
  'form.ownerPlaceholder': 'Optional person or team',
  'form.memoryKind': 'Type',
  'form.memoryText': 'Memory',
  'form.memoryPlaceholder': 'A durable decision, fact, blocker, or handoff—not a transcript.',
  'notice.noWorkspace': 'Create or connect a DSH Workspace before creating a Task.',
  'notice.pending': '{count} Sessions need your attention',
  'archive.empty': 'No archived Tasks.',
  'archive.title': 'Archive Task & Sessions?',
  'archive.message': '“{title}” will leave the active Task Board.',
  'archive.sessions': '{sessions} linked DSH Sessions will be archived and hidden from DSH grouping surfaces.',
  'archive.restoreHint': 'Restoring the Task later will not unarchive those DSH Sessions.',
  'archive.partialFailure': 'The Task is archived, but {failed} Sessions could not be archived. Open the Task and retry.',
  'archive.syncPendingTitle': 'Session archive is incomplete',
  'archive.syncPending': '{count} linked Sessions are still active in DSH.',
  'archive.retry': 'Retry Session archive',
  'archive.confirm': 'Archive Task & Sessions',
  'delete.title': 'Delete Task?',
  'delete.message': 'This permanently deletes “{title}” from the plugin.',
  'delete.impact': '{memories} Task memories and links to {sessions} Sessions will be removed.',
  'delete.keepSessions': 'The DSH Sessions and their original transcripts will not be deleted.',
  'delete.confirm': 'Delete Task',
}

export const zh: TaskBoardStrings = {
  'sidebar.action.label': '任务控制台',
  'sidebar.action.tooltip': '打开任务协作控制台',
  'modal.title': '任务协作',
  'modal.close': '关闭',
  'nav.overview': '控制台',
  'nav.workspaces': '工作区',
  'nav.allTasks': '全部任务',
  'nav.archived': '已归档',
  'nav.legacy': '未归属工作区',
  'header.taskBoard': '任务看板',
  'header.taskBoardHint': '以任务组织工作，并在同一任务下运行多个协作会话。',
  'header.sessionBoard': '会话看板',
  'header.archivedTasks': '已归档任务',
  'header.archivedTasksHint': '归档任务会离开活跃看板，其关联 Session 也会在 DSH 中归档。',
  'button.refresh': '刷新',
  'button.newTask': '新建任务',
  'button.newSession': '新建会话',
  'button.linkCurrent': '关联当前空白会话',
  'button.back': '返回任务看板',
  'button.cancel': '取消',
  'button.create': '创建任务',
  'button.creating': '创建中…',
  'button.addMemory': '添加记忆',
  'button.openSession': '打开',
  'button.openTask': '打开任务',
  'button.verify': '标记已验证',
  'button.supersede': '标记已过期',
  'button.archiveTask': '归档任务及 Session',
  'button.restoreTask': '恢复任务',
  'button.deleteTask': '删除任务',
  'board.backlog': '待办',
  'board.in_progress': '进行中',
  'board.review': '等你处理',
  'board.done': '已完成',
  'board.empty': '这一列还没有任务。',
  'task.sessions': '{count} 个会话',
  'task.memories': '{count} 条记忆',
  'task.owner': '负责人：{owner}',
  'task.unassigned': '未分配',
  'task.updated': '更新于 {when}',
  'task.objective': '任务目标',
  'task.acceptance': '验收标准',
  'task.status': '任务状态',
  'task.statusLocked': '请先处理 Session 中等待授权、回答或计划确认的事项。',
  'task.detailLabel': '任务工作区',
  'task.archivedAt': '归档于 {when}',
  'session.ready': '可继续',
  'session.running': '运行中',
  'session.attention': '等你处理',
  'session.ended': '已结束',
  'session.empty': '这一列还没有会话。',
  'session.approval': '等待授权',
  'session.question': '等待回答',
  'session.planReview': '等待确认计划',
  'session.idle': '可以继续',
  'session.completed': '已完成',
  'session.archived': '已归档',
  'session.archivedHint': '该 Session 已在 DSH 中归档，仅在所属任务内保留只读信息。',
  'session.activeCount': '{count} 个活跃',
  'session.archivedCount': '{count} 个已归档',
  'session.archivedGroup': '已归档 Session',
  'session.archivedGroupHint': '保留在所属任务中供回顾；选择 Session 可直接查看归档对话。',
  'session.idLabel': 'Session ID',
  'session.viewTranscript': '查看对话',
  'session.taskLabel': '返回任务',
  'session.returnToTask': '返回任务：{title}',
  'session.returnToTaskHint': '在任务控制台中打开该 Session 所属的任务',
  'transcript.title': '归档对话',
  'transcript.hint': '这里显示该 Session 的只读历史；内部上下文、推理过程和工具细节不会展示。',
  'transcript.close': '关闭对话',
  'transcript.loading': '正在加载对话…',
  'transcript.loadOlder': '加载更早消息',
  'transcript.empty': '该 Session 没有可展示的对话消息。',
  'transcript.user': '你',
  'transcript.assistant': '助手',
  'transcript.images': '{count} 张图片',
  'transcript.tool': '使用了 {name}',
  'transcript.truncated': '长消息已截断',
  'memory.title': '任务长期记忆',
  'memory.hint': '同步给本任务下的所有会话；不会同步原始对话记录。',
  'memory.empty': '暂无长期记忆。',
  'memory.sourceUser': '用户',
  'memory.sourceSession': '会话 {session}',
  'memory.unverified': '未验证',
  'memory.verified': '已验证',
  'memory.superseded': '已过期',
  'memory.kind.summary': '进展摘要',
  'memory.kind.decision': '关键决策',
  'memory.kind.finding': '发现（旧记录）',
  'memory.kind.blocker': '当前阻塞',
  'memory.kind.evidence': '证据（旧记录）',
  'memory.kind.handoff': '交接说明',
  'form.workspace': '工作区',
  'form.title': '任务标题',
  'form.titlePlaceholder': '需要完成什么？',
  'form.objective': '任务目标',
  'form.objectivePlaceholder': '所有协作会话共同努力的最终结果。',
  'form.acceptance': '验收标准',
  'form.acceptancePlaceholder': '满足什么条件才算任务完成？',
  'form.owner': '负责人',
  'form.ownerPlaceholder': '可选：人员或团队',
  'form.memoryKind': '记忆类型',
  'form.memoryText': '记忆内容',
  'form.memoryPlaceholder': '记录可长期复用的决策、事实、阻塞或交接信息，不要粘贴原始对话。',
  'notice.noWorkspace': '请先在 DSH 中连接一个工作区，再创建任务。',
  'notice.pending': '{count} 个会话需要你处理',
  'archive.empty': '暂无已归档任务。',
  'archive.title': '归档任务及 Session？',
  'archive.message': '“{title}”将离开活跃任务看板。',
  'archive.sessions': '其关联的 {sessions} 个 DSH Session 将一并归档，并从 DSH 会话分组中隐藏。',
  'archive.restoreHint': '之后恢复 Task 时，不会自动恢复这些 DSH Session。',
  'archive.partialFailure': '任务已归档，但有 {failed} 个 Session 归档失败。可打开该任务后重试。',
  'archive.syncPendingTitle': 'Session 归档尚未完成',
  'archive.syncPending': '还有 {count} 个关联 Session 在 DSH 中处于活跃状态。',
  'archive.retry': '重试归档 Session',
  'archive.confirm': '确认归档任务及 Session',
  'delete.title': '删除任务？',
  'delete.message': '这会从插件中永久删除“{title}”。',
  'delete.impact': '将删除 {memories} 条任务长期记忆，并解除与 {sessions} 个 Session 的关系。',
  'delete.keepSessions': 'DSH 中的 Session 和原始对话不会被删除。',
  'delete.confirm': '确认删除任务',
}

export function interpolate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : `{${name}}`)
}
