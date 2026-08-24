import type { Module } from '../../core/types.js'
import scalar from './scalar.js'

/**
 * `match` — the parent command. Its own fn reports how many rows the deeper
 * modules in the chain produced, giving the README's `{ 'match scalar': [...], match: 4 }`.
 */
const match: Module = {
    help: {
        description: 'test whether specified option values are equal',
        options: {
            'l (left)': 'comparison value',
            'r (right)': 'comparison value'
        }
    },
    fn: (ctx) => Object.values(ctx.children).flat().length,
    submodules: { scalar }
}

export { scalar }
export default match
