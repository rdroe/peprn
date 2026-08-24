import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { buildProgram, collectDeps, extractHandle } from '../src/core/program.js'
import { UnknownCommandError } from '../src/core/errors.js'
import { fixtures } from './fixtures/modules.js'
import type { ParsedLine, ParsedTask, Program } from '../src/core/types.js'

function build(text: string): Program {
    return buildProgram(text, fixtures)
}

/** Narrow a task's spec to the 'task' variant. */
function taskSpec(t: ParsedTask): Extract<ParsedTask['spec'], { kind: 'task' }> {
    assert.equal(t.spec.kind, 'task')
    if (t.spec.kind !== 'task') throw new Error('unreachable')
    return t.spec
}

/** Narrow a task's spec to the 'invalid' variant. */
function invalidSpec(t: ParsedTask): Extract<ParsedTask['spec'], { kind: 'invalid' }> {
    assert.equal(t.spec.kind, 'invalid')
    if (t.spec.kind !== 'invalid') throw new Error('unreachable')
    return t.spec
}

function parsedOf(t: ParsedTask): ParsedLine {
    assert.ok(t.parsed !== null)
    return t.parsed
}

describe('buildProgram', () => {
    test('1. plain line: one task, no handle, no deps', () => {
        const prog = build('pass 1')
        assert.equal(prog.tasks.length, 1)
        const spec = taskSpec(prog.tasks[0]!)
        assert.equal(spec.handle, null)
        assert.deepEqual(spec.deps, [])
        assert.deepEqual(parsedOf(prog.tasks[0]!).pathKeys, ['pass'])
    })

    test('2. as suffix sets handle and is stripped from args.raw only', () => {
        const prog = build('pass 1 as a')
        assert.equal(prog.tasks.length, 1)
        const task = prog.tasks[0]!
        const spec = taskSpec(task)
        assert.equal(spec.handle, 'a')
        assert.deepEqual(parsedOf(task).args.positional, [1])
        assert.equal(parsedOf(task).args.raw, 'pass 1')
        assert.equal(spec.raw, 'pass 1 as a')
    })

    test('3. quoted "as" is inert', () => {
        const prog = build('pass "as"')
        const task = prog.tasks[0]!
        assert.equal(taskSpec(task).handle, null)
        assert.deepEqual(parsedOf(task).args.positional, ['as'])
    })

    test('4. trailing lone bare as is a literal token', () => {
        const prog = build('pass as')
        const task = prog.tasks[0]!
        assert.equal(taskSpec(task).handle, null)
        assert.deepEqual(parsedOf(task).args.positional, ['as'])
    })

    test('5. as suffix after a positional', () => {
        const prog = build('pass save as db')
        const task = prog.tasks[0]!
        assert.equal(taskSpec(task).handle, 'db')
        assert.deepEqual(parsedOf(task).args.positional, ['save'])
    })

    test('6. non-NAME handle is invalid', () => {
        const prog = build('pass 1 as 9bad')
        assert.equal(prog.tasks.length, 1)
        const spec = invalidSpec(prog.tasks[0]!)
        assert.equal(spec.error.message, 'Invalid handle name "9bad"')
        assert.equal(prog.tasks[0]!.parsed, null)
    })

    test('7. bare "as name" line is invalid', () => {
        const prog = build('as a')
        assert.equal(prog.tasks.length, 1)
        assert.equal(invalidSpec(prog.tasks[0]!).error.message, 'Missing command before "as"')
    })

    test('8. deps are unique refs in first-appearance order', () => {
        const prog = build('pass @a @b @a')
        assert.deepEqual(taskSpec(prog.tasks[0]!).deps, ['a', 'b'])
    })

    test('9. blank lines produce no task but still count lineIndex', () => {
        const prog = build('pass 1\n\n  \npass 2')
        assert.equal(prog.tasks.length, 2)
        assert.equal(prog.tasks[0]!.spec.lineIndex, 0)
        assert.equal(prog.tasks[1]!.spec.lineIndex, 3)
    })

    test('10. unknown command becomes a task carrying UnknownCommandError', () => {
        const prog = build('frobnicate 9')
        assert.equal(prog.tasks.length, 1)
        assert.ok(prog.tasks[0]!.error instanceof UnknownCommandError)
    })

    test('11. a broken line does not affect its siblings', () => {
        const prog = build('echo "unterminated\npass 1')
        assert.equal(prog.tasks.length, 2)
        assert.equal(prog.tasks[0]!.spec.kind, 'invalid')
        assert.equal(prog.tasks[1]!.spec.kind, 'task')
        assert.equal(prog.tasks[1]!.error, null)
        assert.deepEqual(parsedOf(prog.tasks[1]!).args.positional, [1])
    })
})

describe('extractHandle / collectDeps', () => {
    test('extractHandle leaves a short token list alone', () => {
        const tokens = [{ kind: 'word' as const, text: 'as', quoted: false }]
        assert.deepEqual(extractHandle(tokens), { tokens, handle: null })
    })

    test('collectDeps ignores words', () => {
        assert.deepEqual(collectDeps([
            { kind: 'word', text: 'pass', quoted: false },
            { kind: 'ref', name: 'b' },
            { kind: 'ref', name: 'b' },
            { kind: 'ref', name: 'a' },
        ]), ['b', 'a'])
    })
})
