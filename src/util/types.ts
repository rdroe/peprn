import { CliApps } from "../evaluator"
import { ParsedCli } from "./cliParser"
export type ModuleFn<ArgFormat extends ParsedCli = ParsedCli, Ret = unknown> = (args: ArgFormat, childCalls?: any, appId?: string, appsSingleton?: CliApps) => Promise<Ret>
export interface Module<ArgFormat extends ParsedCli = ParsedCli, Ret = unknown> {
    help?: ModuleHelp
    fn: ModuleFn<ArgFormat, Ret>
    validate?: (arg: unknown) => boolean
    yargs?: {
        [optName: string]: {
            alias: string
            array?: boolean
            type?: 'string' | 'number' | 'boolean'
        }
    }
    submodules?: {
        [subcommand: string]: Module<any, any>
    }
}

export type Modules<ModuleNames extends string | number | symbol = any> = Record<ModuleNames, Module>


export interface ModuleHelp {
    description: string,
    options?: object,
    examples?: object
}

export interface ModuleHelper {
    (name: string, fn: ModuleFn, submodules?: [string, Module][], help?: string | ModuleHelp): Modules
}
