import { makeRunner, CliApps, DataHandler } from '../evaluator'
import match from '../match'

function makeApps(id: string): CliApps {
    const apps: CliApps = {}
    apps[id] = {
        evaluator: async () => {},
        zodStore: {},
        dataHandler: async () => {},
        userEffects: [],
        userKeyEffects: [],
        rememberAutomated: false,
    }
    return apps
}

describe('match', () => {
    it('compares scalars pairwise', async () => {
        const results = await match.submodules!.scalar.fn!(
            { l: [1, 'a', 'world'], r: [1, 'b', 'world'] } as never,
            {},
            'test',
            {}
        )

        expect(results).toEqual([
            { index: 0, match: true, left: 1, right: 1 },
            { index: 1, match: false, left: 'a', right: 'b' },
            { index: 2, match: true, left: 'world', right: 'world' },
        ])
    })

    it('reports the flattened child-result count from the parent command', async () => {
        // This is the value the README's node example prints as `match: 4`.
        const apps = makeApps('test')
        const runner = makeRunner({ id: 'test', modules: { match } }, apps)
        apps.test.evaluator = runner

        // parsed.moduleNames is identical for every module in the chain, so key
        // by ancestral depth: 0 is the childmost (scalar), 1 its parent (match).
        const byDepth: Record<number, unknown> = {}
        const cb: DataHandler = jest.fn(async (parsed, data) => {
            byDepth[parsed['peprn:ancestralDepth'] as number] = data
        })

        await new Promise<void>((res) => {
            runner(
                'match scalar -l 1 a hellllllo world -r 1 b hellllllllllo world',
                cb,
                () => res()
            )
        })
        await new Promise((r) => setTimeout(r, 20))

        expect(byDepth[0]).toHaveLength(4)
        expect(byDepth[1]).toBe(4)
    })

    it('returns null when handed no child calls', async () => {
        expect(await match.fn!({} as never, undefined as never, 'test', {})).toBeNull()
    })
})
