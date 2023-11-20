
import { ParsedCli } from '../util'
import { Module } from '../util/types'

type Matchable = object | null | undefined | number | boolean | string
type Matchables = Matchable[]

const cm: Module<ParsedCli & { l: Matchables, r: Matchables }> = {
    help: {
        description: 'test whether the supplied scalar pairs are equal',
        examples: {
            '-l 1 2 3 -r 1 2 4': 'test whether 1 equals 1, 2 equals 2, and 3 equals 4; output contains a map and list of equalities.',
            '--left 1 2 3 --right 1 2 4': 'test whether 1 equals 1, 2 equals 2, and 3 equals 4; output contains a map and list of equalities.'
        }
    },
    fn: async function scalarMatch(argv: { l: Matchables, r: Matchables }) {
        const { l, r: right } = argv

        return l.map((ll, idx) => {
            const rt = right[idx]
            return {
                index: idx,
                match: ll === rt,
                left: ll,
                right: rt
            }
        })
    },
    yargs: {
        l: {
            alias: 'left',
            array: true
        },
        r: {
            alias: 'right',
            array: true
        }
    }
}

export default cm
