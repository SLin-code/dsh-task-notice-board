import assert from 'node:assert/strict'
import test from 'node:test'
import { Buffer } from 'node:buffer'
import { renderTaskContext } from '../dist/task-context-sync/index.mjs'
import { taskRecordSchema } from '../dist/task/index.mjs'

const now = 1_700_000_000_000

test('legacy Task rows remain readable after the control-center model upgrade', () => {
  const parsed = taskRecordSchema.parse({
    title: 'Legacy task',
    objective: 'Keep existing stored data usable.',
    status: 'open',
    revision: 1,
    entries: [],
    createdAt: now,
    updatedAt: now,
  })
  assert.equal(parsed.title, 'Legacy task')
  assert.equal(parsed.workspaceId, undefined)
  assert.equal(parsed.boardStatus, undefined)
  assert.equal(parsed.archivedAt, undefined)
})

test('archived Task rows retain a recoverable timestamp', () => {
  const parsed = taskRecordSchema.parse({
    workspaceId: 'workspace-1',
    key: 'TASK-ARCHIVE',
    title: 'Archived task',
    objective: 'Stay recoverable outside the active board.',
    status: 'closed',
    boardStatus: 'done',
    archivedAt: now,
    revision: 3,
    entries: [],
    createdAt: now - 1_000,
    updatedAt: now,
  })
  assert.equal(parsed.archivedAt, now)
})

test('Task context carries structured memory without a transcript', () => {
  const task = {
    id: 'task-1',
    workspaceId: 'workspace-1',
    key: 'TASK-000001',
    title: 'Ship collaboration control center',
    objective: 'Coordinate multiple Sessions under one Task.',
    acceptanceCriteria: 'Pending approvals are visible.',
    owner: 'Product',
    status: 'open',
    boardStatus: 'in_progress',
    revision: 2,
    entries: [{
      id: 'memory-1',
      revision: 2,
      kind: 'decision',
      verification: 'verified',
      text: 'Use Task-scoped memory; never sync raw transcripts.',
      source: { kind: 'user' },
      createdAt: now,
    }],
    createdAt: now,
    updatedAt: now,
  }
  const rendered = renderTaskContext(task, 4096)
  assert.match(rendered, /"kind":"decision"/)
  assert.match(rendered, /"verification":"verified"/)
  assert.match(rendered, /"source":"user"/)
  assert.doesNotMatch(rendered, /transcriptEvents|rawTranscript/)
})

test('superseded Task memory is excluded from automatic Session context', () => {
  const task = {
    id: 'task-superseded', key: 'TASK-000003', title: 'Current plan', objective: 'Use only active memory.',
    acceptanceCriteria: '', owner: '', status: 'open', boardStatus: 'in_progress', revision: 3,
    entries: [
      {
        id: 'memory-old', revision: 2, kind: 'decision', verification: 'superseded',
        text: 'OLD_DECISION_MUST_NOT_BE_INJECTED', source: { kind: 'user' }, createdAt: now - 1,
      },
      {
        id: 'memory-current', revision: 3, kind: 'decision', verification: 'verified',
        text: 'Use the current decision.', source: { kind: 'user' }, createdAt: now,
      },
    ],
    createdAt: now - 10,
    updatedAt: now,
  }
  const rendered = renderTaskContext(task, 4096)
  assert.match(rendered, /Use the current decision/)
  assert.doesNotMatch(rendered, /OLD_DECISION_MUST_NOT_BE_INJECTED/)
  assert.match(rendered, /"omittedUpdates":0/)
})

test('Task context remains inside its complete UTF-8 byte budget', () => {
  const task = {
    id: 'task-2', key: 'TASK-000002', title: '界面验证', objective: '目标'.repeat(500),
    acceptanceCriteria: '', owner: '', status: 'open', boardStatus: 'backlog', revision: 1,
    entries: [], createdAt: now, updatedAt: now,
  }
  const rendered = renderTaskContext(task, 512)
  assert.ok(Buffer.byteLength(rendered, 'utf8') <= 512)
})
