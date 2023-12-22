import { Module } from '../util'
export const foo: Module = {
    // note that a "fn" property is optional. this means a branch may be purely syntactic
    submodules: {
        'job': {

            fn: async () => {
                return "i should run"
            }
        },
        '$': {
            fn: async (parsedCli) => {
                return `foo.$ ; subcommand args: ${parsedCli["$"]}`

            },
            submodules: {
                'bar': {
                    fn: async ({ $: dollar }) => {
                        return `foo.$.bar; your dyna command is ${dollar[0]}`
                    }
                }
            }
        }
    }
}
