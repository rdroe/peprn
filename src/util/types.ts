import { CliApps } from "../evaluator"
import { ParsedCli } from "./cliParser"
export type ModuleFn<ArgFormat extends ParsedCli = ParsedCli, Ret = unknown> = (args: ArgFormat, childCalls?: any, appId?: string, appsSingleton?: CliApps) => Promise<Ret>
export interface Module {
    help?: ModuleHelp
    fn: ModuleFn
    validate?: (arg: unknown) => boolean
    yargs?: {
        [optName: string]: {
            alias: string
            array?: boolean
            type?: 'string' | 'number' | 'boolean'
        }
    }
    submodules?: {
        [subcommand: string]: Module
    }
}

export type Modules = Record<string, Module>


export interface ModuleHelp {
    description: string,
    options?: object,
    examples?: object
}

export interface ModuleHelper {
    (name: string, fn: ModuleFn, submodules?: [string, Module][], help?: string | ModuleHelp): Modules
}
