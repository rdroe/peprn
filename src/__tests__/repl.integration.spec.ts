import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// These drive the *built* node example as a real subprocess. The in-process
// specs never touch dist/ or the repl shell, which is how the `--man` and
// `match: 4` regressions survived a green suite.
const ENTRY = join(__dirname, '..', '..', 'dist', 'testable', 'node', 'index.js')
const BUILT = existsSync(ENTRY)

const runtimes = ['node', ...(process.env.PEPRN_TEST_BUN ? ['bun'] : [])]

function repl(runtime: string, input: string, waitMs = 2500): Promise<string> {
    return new Promise((resolve) => {
        const proc = spawn(runtime, [ENTRY])
        let out = ''
        proc.stdout.on('data', (d) => { out += d })
        proc.stderr.on('data', (d) => { out += d })
        const writeAt = setTimeout(() => proc.stdin.write(`${input}\n`), 300)
        const killAt = setTimeout(() => proc.kill('SIGKILL'), waitMs)
        proc.on('close', () => {
            clearTimeout(writeAt)
            clearTimeout(killAt)
            resolve(out)
        })
        proc.on('error', () => resolve(''))
    })
}

const maybe = BUILT ? describe : describe.skip

maybe.each(runtimes)('built repl (%s)', (runtime) => {
    it('prints the README example, child-result count included', async () => {
        const out = await repl(runtime, 'match scalar -l 1 a hellllllo world -r 1 b hellllllllllo world')
        expect(out).toContain('hellllllllllo')
        // the parent command's flattened child-result count
        expect(out).toMatch(/match:\s*4/)
    }, 20000)

    it('answers --man when it is the final token', async () => {
        const out = await repl(runtime, 'match --man')
        expect(out).toContain('match scalar')
        expect(out).toContain('test whether the supplied scalar pairs are equal')
    }, 20000)

    it('survives a blank line without a stack trace', async () => {
        const out = await repl(runtime, '')
        expect(out).not.toMatch(/Uncaught|at REPLServer|raw user input/)
    }, 20000)

    it('recovers the prompt after an error inside a module fn', async () => {
        const out = await repl(runtime, 'match scalar')
        // one report, and the prompt comes back rather than the process dying
        expect(out).toMatch(/>/)
        expect(out.match(/Cannot read properties of undefined|is not an object/g)?.length ?? 1)
            .toBeLessThanOrEqual(1)
    }, 20000)
})
