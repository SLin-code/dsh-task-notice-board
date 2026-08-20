import assert from 'node:assert/strict'
import test from 'node:test'
import { Buffer } from 'node:buffer'
import { projectTaskTranscript, projectTaskTranscriptPage } from '../dist/task/index.mjs'

function event(type, seq, data) {
  return { type, seq, time: 1_700_000_000_000 + seq, data }
}

test('archived transcript keeps only user-authored prompts and visible assistant output', () => {
  const projected = projectTaskTranscript([
    event('user/message', 1, {
      id: 'message-user',
      role: 'user',
      source: { kind: 'user' },
      content: [
        { type: 'text', text: 'Human prompt' },
        { type: 'image', attachment: { id: 'image-1' } },
      ],
    }),
    event('user/message', 2, {
      id: 'message-plugin',
      role: 'user',
      source: { kind: 'plugin', plugin: 'task-context-sync' },
      content: [{ type: 'text', text: 'PRIVATE_INJECTED_CONTEXT' }],
    }),
    event('assistant/message', 3, {
      turn: 1,
      step: 1,
      message: {
        id: 'message-assistant',
        role: 'assistant',
        source: { kind: 'model', provider: 'test-provider', model: 'test-model' },
        content: [
          { type: 'reasoning', text: 'PRIVATE_REASONING' },
          { type: 'text', text: 'Visible answer' },
          { type: 'tool-call', id: 'call-1', name: 'read_file', arguments: '{"secret":"PRIVATE_TOOL_ARGUMENT"}' },
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            content: [{ type: 'text', text: 'PRIVATE_TOOL_RESULT' }],
          },
        ],
      },
    }),
  ])

  assert.equal(projected.length, 2)
  assert.deepEqual(projected.map(item => item.role), ['user', 'assistant'])
  assert.equal(projected[0].text, 'Human prompt')
  assert.equal(projected[0].imageCount, 1)
  assert.equal(projected[1].text, 'Visible answer')
  assert.deepEqual(projected[1].toolNames, ['read_file'])
  assert.equal(projected[1].provider, 'test-provider')
  assert.equal(projected[1].model, 'test-model')

  const serialized = JSON.stringify(projected)
  assert.doesNotMatch(serialized, /PRIVATE_INJECTED_CONTEXT/)
  assert.doesNotMatch(serialized, /PRIVATE_REASONING/)
  assert.doesNotMatch(serialized, /PRIVATE_TOOL_ARGUMENT/)
  assert.doesNotMatch(serialized, /PRIVATE_TOOL_RESULT/)
})

test('archived transcript bounds unusually long visible messages', () => {
  const projected = projectTaskTranscript([
    event('user/message', 1, {
      id: 'message-long',
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'x'.repeat(40_001) }],
    }),
  ])

  assert.equal(projected.length, 1)
  assert.equal(projected[0].text.length, 40_000)
  assert.equal(projected[0].textTruncated, true)
})

test('empty internal-only events do not create transcript rows', () => {
  const projected = projectTaskTranscript([
    event('user/message', 1, {
      id: 'message-plugin',
      role: 'user',
      source: { kind: 'plugin', plugin: 'context' },
      content: [{ type: 'text', text: 'hidden' }],
    }),
    event('assistant/message', 2, {
      turn: 1,
      step: 1,
      message: {
        id: 'message-reasoning',
        role: 'assistant',
        source: { kind: 'model', provider: 'test', model: 'test' },
        content: [{ type: 'reasoning', text: 'hidden' }],
      },
    }),
  ])

  assert.deepEqual(projected, [])
})

test('transcript pagination returns at most 60 messages with a stable older cursor', () => {
  const events = Array.from({ length: 65 }, (_, index) => event('user/message', index + 1, {
    id: `message-${index + 1}`,
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text: `Prompt ${index + 1}` }],
  }))

  const newest = projectTaskTranscriptPage(events)
  assert.equal(newest.items.length, 60)
  assert.equal(newest.items[0].seq, 6)
  assert.equal(newest.items.at(-1).seq, 65)
  assert.equal(newest.hasMore, true)
  assert.equal(newest.nextBeforeSeq, 6)

  const older = projectTaskTranscriptPage(events, newest.nextBeforeSeq)
  assert.deepEqual(older.items.map(item => item.seq), [1, 2, 3, 4, 5])
  assert.equal(older.hasMore, false)
  assert.equal(older.nextBeforeSeq, undefined)
})

test('transcript pagination applies a page byte budget before the count limit', () => {
  const events = Array.from({ length: 20 }, (_, index) => event('user/message', index + 1, {
    id: `large-message-${index + 1}`,
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text: String(index).repeat(40_000) }],
  }))

  const page = projectTaskTranscriptPage(events)
  assert.ok(page.items.length < 20)
  assert.equal(page.hasMore, true)
  assert.equal(page.nextBeforeSeq, page.items[0].seq)
  assert.ok(Buffer.byteLength(JSON.stringify(page.items), 'utf8') < 520_000)
})
