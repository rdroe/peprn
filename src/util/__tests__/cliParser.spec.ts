import { parse, getMatchingModules } from '../cliParser'
import type { Modules } from '../types'

const modules: Modules = {
    greet: {
        help: { description: 'say hello' },
        fn: async () => 'hello',
        yargs: {
            name: { alias: 'n', type: 'string' },
            verbose: { alias: 'v', type: 'boolean' },
        },
    },
    calc: {
        fn: async () => {},
        submodules: {
            add: {
                fn: async () => {},
                yargs: {
                    vals: { alias: 'x', array: true },
                },
            },
        },
    },
}

describe('parse', () => {
    it('parses a simple command', () => {
        const result = parse(modules, 'greet')
        expect(result.commands).toEqual(['greet'])
        expect(result.moduleNames).toContain('greet')
    })

    it('parses command with subcommand', () => {
        const result = parse(modules, 'calc add')
        expect(result.commands).toEqual(['calc', 'add'])
        expect(result.moduleNames).toContain('calc add')
    })

    it('parses a string option and its alias', () => {
        const result = parse(modules, 'greet --name Alice')
        expect(result['name']).toBe('Alice')
        expect(result['n']).toBe('Alice')
    })

    it('parses a boolean option', () => {
        const result = parse(modules, 'greet --verbose')
        expect(result['verbose']).toBe(true)
        expect(result['v']).toBe(true)
    })

    it('parses array options via alias', () => {
        const result = parse(modules, 'calc add -x 1 2 3')
        expect(Array.isArray(result['x'])).toBe(true)
        expect(result['x']).toEqual([1, 2, 3])
    })

    it('parses array options via full name', () => {
        const result = parse(modules, 'calc add --vals a b c')
        expect(result['vals']).toEqual(['a', 'b', 'c'])
    })

    it('handles rawIn as an array of strings', () => {
        const result = parse(modules, ['greet', '--name', 'Bob'])
        expect(result.commands).toContain('greet')
        expect(result['name']).toBe('Bob')
    })

    it('parses numeric positional arguments', () => {
        const result = parse(modules, 'greet 42')
        expect(result.positionalNonCommands).toContain(42)
    })

    it('stores rawIn on the result', () => {
        const result = parse(modules, 'greet --name Alice')
        expect(result.rawIn).toBe('greet --name Alice')
    })

    it('accumulates _ array with positionals', () => {
        const result = parse(modules, 'greet hello world')
        expect(result._).toContain('hello')
        expect(result._).toContain('world')
    })

    it('throws when a submodule name is encountered after lastCommandReached', () => {
        // After an option sets lastCommandReached=true, encountering a submodule name is an invariant violation
        expect(() => parse(modules, 'calc --unknown add')).toThrow()
    })
})

describe('getMatchingModules', () => {
    it('returns empty array when moduleObj is null', () => {
        expect(getMatchingModules(null)('greet')).toEqual([])
    })

    it('returns the matching top-level module', () => {
        const matched = getMatchingModules(modules)('greet')
        expect(matched.length).toBeGreaterThan(0)
        expect(matched[0]).toBe(modules.greet)
    })

    it('returns parent and child modules for subcommand', () => {
        const matched = getMatchingModules(modules)('calc add')
        expect(matched.length).toBe(2)
    })

    it('returns empty array when no module matches', () => {
        const matched = getMatchingModules(modules)('unknown')
        expect(matched).toEqual([])
    })

    it('returns empty array for empty input', () => {
        const matched = getMatchingModules(modules)('')
        expect(matched).toEqual([])
    })
})
