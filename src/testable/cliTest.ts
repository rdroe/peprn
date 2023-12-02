import { fakeCli } from "../evaluator";
import { Module } from "../util";
import { apps } from "../node";
export const cliTest: Module = {
    fn: async () => {

    },
    submodules: {
        one: {
            fn: async () => {

                const fromTwo = await fakeCli(`cliTest two`, 'cli')
                console.log('got fromTwo', fromTwo)
                return { one: fromTwo }
            }
        },
        two: {
            fn: async () => {

                const cliDat = await fakeCli(`match scalar -l 1 -r 1 --serial`, "cli").then((data) => {
                    return data
                })

                console.log('cli data in fakce', cliDat)
                return { fromTwo: cliDat }
            }
        }
    }
}
