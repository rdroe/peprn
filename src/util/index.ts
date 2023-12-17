export * from './cliParser'
export * from './types'
export * from './validation'
export { default as strlog } from './strlog'
export * from './predicates'
export { default as awaitAll } from './awaitAll'

export const PEPRN_AUTO = `peprn:automated`
export const PEPRN_MULTILINE_INDEX = `peprn:multilineIndex`
export const PEPRN_MULTILINE_TOTAL = `peprn:multilineTotal`
export const PEPRN_MULTILINE = 'peprn:multiline'
export const PEPRN_MULTILINE_TRUE = `--${PEPRN_MULTILINE} true`
export const PEPRN_AUTO_TRUE = `--${PEPRN_AUTO} true`
export const cleanHistory = (cli?: string) => cli?.replace(/[\n\s]+$/g, '') ?? ""
