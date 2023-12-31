import { Module } from '../util/types'
import scalar from './scalar'

const cm: Module = {
    help: {
        description: 'test whether specified option values are equal',
        options: {
            'l (left)': 'comparison value',
            'r (right)': 'comparison value'
        },
    },
    fn: async function match(_, y: {

        [childNamespace: string]: Promise<any>
    }) {
        return 
    },
    submodules: {
        scalar // child command
    }
}

export default cm
