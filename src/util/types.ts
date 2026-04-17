import { CliApps } from "../evaluator"
import { ParsedCli } from "./cliParser"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ModuleFn<ArgFormat extends ParsedCli = ParsedCli, Ret = unknown> = (args: ArgFormat, childCalls?: any, appId?: string, appsSingleton?: CliApps) => Promise<Ret>
export interface Module<ArgFormat extends ParsedCli = ParsedCli, Ret = unknown> {
    help?: ModuleHelp
    fn?: ModuleFn<ArgFormat, Ret>
    validate?: (arg: unknown) => boolean
    yargs?: {
        [optName: string]: {
            alias: string
            array?: boolean
            type?: 'string' | 'number' | 'boolean'
        }
    }
    submodules?: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [subcommand: string]: Module<any, any>
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Modules<ModuleNames extends string | number | symbol = any> = Record<ModuleNames, Module>


export interface ModuleHelp {
    description: string,
    options?: object,
    examples?: object
}

export interface ModuleHelper {
    (name: string, fn: ModuleFn, submodules?: [string, Module][], help?: string | ModuleHelp): Modules
}
