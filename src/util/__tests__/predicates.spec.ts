import { makeModule, makeSubmodule } from '../predicates'

describe('makeModule', () => {
    const noop = async () => {}

    it('creates a module keyed by name', () => {
        const result = makeModule('foo', noop)
        expect(result.foo).toBeDefined()
        expect(typeof result.foo.fn).toBe('function')
    })

    it('attaches default help when none is provided', () => {
        const result = makeModule('foo', noop)
        expect(result.foo.help).toBeDefined()
        expect(result.foo.help?.description).toContain('foo')
    })

    it('attaches custom string help', () => {
        const result = makeModule('foo', noop, [], 'Custom help text')
        expect(result.foo.help?.description).toBe('Custom help text')
    })

    it('attaches custom object help', () => {
        const help = { description: 'A description', examples: { '--flag': 'example' } }
        const result = makeModule('foo', noop, [], help)
        expect(result.foo.help).toEqual(help)
    })

    it('attaches submodules when provided', () => {
        const sub = makeSubmodule('bar', noop)
        const result = makeModule('foo', noop, [sub])
        expect(result.foo.submodules).toBeDefined()
        expect(result.foo.submodules?.bar).toBeDefined()
    })

    it('omits submodules property when none provided', () => {
        const result = makeModule('foo', noop)
        expect(result.foo.submodules).toBeUndefined()
    })
})

describe('makeSubmodule', () => {
    const noop = async () => {}

    it('returns a tuple [name, module]', () => {
        const result = makeSubmodule('bar', noop)
        expect(result[0]).toBe('bar')
        expect(typeof result[1].fn).toBe('function')
    })

    it('can be used directly as a submodule entry', () => {
        const sub = makeSubmodule('child', noop)
        const parent = makeModule('parent', noop, [sub])
        expect(parent.parent.submodules?.child).toBeDefined()
    })

    it('accepts optional help string', () => {
        const result = makeSubmodule('bar', noop, 'Help text')
        expect(result[1].help?.description).toBe('Help text')
    })

    it('accepts nested submodules', () => {
        const deepSub = makeSubmodule('deep', noop)
        const result = makeSubmodule('bar', noop, undefined, [deepSub])
        expect(result[1].submodules?.deep).toBeDefined()
    })
})
