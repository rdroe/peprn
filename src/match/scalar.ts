import { Module } from '../utils/types'

type Matchable = object | null | undefined | number | boolean | string
type Matchables = Matchable[]

interface MatchResult {
    index: number
    match: boolean
    left: Matchable
    right: Matchable
}

const cm: Module<{ l: Matchable | Matchables, r: Matchable | Matchables }, MatchResult[]> = {
    help: {
        description: 'test whether the supplied scalar pairs are equal',
        examples: {
            '-l 1 2 3 -r 1 2 4': 'test whether 1 equals 1, 2 equals 2, and 3 equals 4; output contains a map and list of equalities.',
            '--left 1 2 3 --right 1 2 4': 'test whether 1 equals 1, 2 equals 2, and 3 equals 4; output contains a map and list of equalities.'
        }
    },
    fn: async function scalarMatch(argv) {
        let left: Matchables
        let right: Matchables
        const { l, r } = argv
        if (!Array.isArray(l)) {
            left = [l]
        } else {
            left = l
        }
        if (!Array.isArray(r)) {
            right = [r]
        } else {
            right = r
        }

        return left.map((ll, idx) => {
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
