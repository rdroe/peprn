import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileHistory } from '../src/node/fileHistory.js'

let dir: string
let n = 0
const freshPath = (): string => join(dir, `history-${n++}.json`)

describe('createFileHistory', () => {
    before(async () => {
        dir = await mkdtemp(join(tmpdir(), 'peprn-history-'))
    })

    after(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    test('1. append then load returns entries in order', async () => {
        const store = createFileHistory(freshPath())
        await store.append('app', 'a')
        await store.append('app', 'b')
        assert.deepEqual(await store.load('app'), ['a', 'b'])
    })

    test('2. appIds are isolated within one file', async () => {
        const store = createFileHistory(freshPath())
        await store.append('one', 'a')
        await store.append('two', 'b')
        assert.deepEqual(await store.load('one'), ['a'])
        assert.deepEqual(await store.load('two'), ['b'])
    })

    test('3. clear returns the number removed and empties the app', async () => {
        const store = createFileHistory(freshPath())
        await store.append('app', 'a')
        await store.append('app', 'b')
        assert.equal(await store.clear('app'), 2)
        assert.deepEqual(await store.load('app'), [])
    })

    test('4. missing file loads as empty', async () => {
        const store = createFileHistory(join(dir, 'nope', 'missing.json'))
        assert.deepEqual(await store.load('app'), [])
    })

    test('5. corrupt file loads as empty', async () => {
        const path = freshPath()
        await mkdir(dir, { recursive: true })
        await writeFile(path, '{ not json at all', 'utf8')
        const store = createFileHistory(path)
        assert.deepEqual(await store.load('app'), [])
    })
})
