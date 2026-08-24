import { createNodeApp } from '../../dist/node/index.js'
import match from '../../dist/modules/match/index.js'
createNodeApp({ id: 'cli', modules: { match } })
