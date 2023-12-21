import fakeCli from "../fakeCli";
import { Module } from "../util";

export const cliTest: Module = {
    help: {
        description: "Cli test facility hub",
        examples: {
            "--nonArg 77 88": "this arg is non-existent, for sure"
        }
    },
    fn: async () => {

    },
    submodules: {


        one: {
            help: {
                description: "Cli test facility numero uno: infra test",
                examples: {
                    "--someOpt 42": "this arg is a no-op, for sure"
                }
            },
            fn: async () => {
                const fromTwo = await fakeCli(`cliTest two`, 'cli')
                const fakeCliResult = await fakeCli(`match scalar -l 99 -r 100`)
                console.log('fake cli result in one', fakeCliResult)
                return { one: fromTwo }
            }
        },
        two: {
            help: { description: "Cli test facility...number two." },
            fn: async () => {

                const cliDat = await fakeCli(`match scalar -l 1 -r 1 --serial`, "cli").then((data) => {
                    return data
                })
                return { fromTwo: cliDat }
            }
        }
    }
}
