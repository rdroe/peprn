import { Module } from '../util'
export const foo: Module = {
    fn: async () => {
        return 'foo'
    },
    submodules: {
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
