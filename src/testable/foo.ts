import { Module } from '../util'
export const foo: Module = {
    fn: async () => {
        return 'foo'
    },
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
                    fn: async () => {

                        return 'bar'
                    }
                }
            }
        }
    }
}
