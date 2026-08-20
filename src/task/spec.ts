/** Durable storage-domain declaration for Task records and Session assignments. */

import { z } from 'zod'
import { CallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { TaskContextEntryId, TaskId } from './types.ts'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positiveSafeInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const taskIdSchema = z.string().min(1).transform(value => value as TaskId)
const entryIdSchema = z.string().min(1).transform(value => value as TaskContextEntryId)
const memoryKindSchema = z.union([
  z.literal('summary'), z.literal('decision'), z.literal('finding'),
  z.literal('blocker'), z.literal('evidence'), z.literal('handoff'),
])
const memoryVerificationSchema = z.union([
  z.literal('unverified'), z.literal('verified'), z.literal('superseded'),
])

/** Durable schema for one advisory Session update. */
export const taskContextEntryRecordSchema = z.object({
  id: entryIdSchema,
  revision: positiveSafeInteger,
  kind: memoryKindSchema.optional(),
  verification: memoryVerificationSchema.optional(),
  text: z.string(),
  source: z.union([
    z.object({
      kind: z.literal('session'),
      sessionId: z.string().min(1).transform(SessionId),
      sessionCreatedAt: nonNegativeSafeInteger,
      callId: z.string().min(1).transform(CallId),
    }),
    z.object({ kind: z.literal('user') }),
  ]),
  createdAt: nonNegativeSafeInteger,
})

/** Stored advisory context entry. */
export type TaskContextEntryRecord = z.infer<typeof taskContextEntryRecordSchema>

/** Durable Task row with its bounded retained context. */
export const taskRecordSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  title: z.string(),
  objective: z.string(),
  acceptanceCriteria: z.string().optional(),
  owner: z.string().optional(),
  status: z.union([z.literal('open'), z.literal('closed')]),
  boardStatus: z.union([
    z.literal('backlog'), z.literal('in_progress'), z.literal('review'), z.literal('done'),
  ]).optional(),
  archivedAt: nonNegativeSafeInteger.optional(),
  revision: positiveSafeInteger,
  entries: z.array(taskContextEntryRecordSchema),
  createdAt: nonNegativeSafeInteger,
  updatedAt: nonNegativeSafeInteger,
}).superRefine((record, ctx) => {
  if (record.updatedAt < record.createdAt) {
    ctx.addIssue({ code: 'custom', path: ['updatedAt'], message: 'task updatedAt must not precede createdAt' })
  }
  const ids = new Set<string>()
  const publications = new Set<string>()
  record.entries.forEach((entry, index) => {
    if (entry.revision > record.revision) {
      ctx.addIssue({ code: 'custom', path: ['entries', index, 'revision'], message: 'entry revision exceeds task revision' })
    }
    if (ids.has(entry.id)) {
      ctx.addIssue({ code: 'custom', path: ['entries', index, 'id'], message: `duplicate task context entry id '${entry.id}'` })
    }
    ids.add(entry.id)
    if (entry.source.kind === 'session') {
      const publication = `${entry.source.sessionId}\u0000${entry.source.sessionCreatedAt}\u0000${entry.source.callId}`
      if (publications.has(publication)) {
        ctx.addIssue({ code: 'custom', path: ['entries', index, 'source'], message: 'duplicate task context publication source' })
      }
      publications.add(publication)
    }
  })
})

/** Stored Task row. */
export type TaskRecord = z.infer<typeof taskRecordSchema>

/** Durable Session-to-Task assignment fenced to one Session lifecycle. */
export const taskAssignmentRecordSchema = z.object({
  taskId: taskIdSchema,
  sessionCreatedAt: nonNegativeSafeInteger,
  assignedAt: nonNegativeSafeInteger,
})

/** Stored assignment row keyed by Session id. */
export type TaskAssignmentRecord = z.infer<typeof taskAssignmentRecordSchema>

/** One Task table and one independently keyed Session assignment table. */
export const taskDomainSpec = defineDomain({
  name: 'task',
  version: 0,
  tables: {
    tasks: domainTable<TaskId, TaskRecord>(taskRecordSchema),
    assignments: domainTable<SessionId, TaskAssignmentRecord>(taskAssignmentRecordSchema),
  },
})
