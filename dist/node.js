"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = exports.apps = void 0;
const evaluator_1 = require("./evaluator");
const strlog_1 = __importDefault(require("./util/strlog"));
const util_1 = require("./util");
const id = 'CLI';
exports.apps = {};
const genericDataHandler = (zodStore, data, params) => {
    zodStore[params.time] = data;
    (0, strlog_1.default)(zodStore);
};
const createApp = async (id) => {
    if ((0, util_1.isNode)()) {
        const { default: repl } = await Promise.resolve().then(() => __importStar(require('node:repl')));
        exports.apps['CLI'] = { evaluator: (0, evaluator_1.makeRunner)({ id }), zodStore: {} };
        const appDataHandler = (input, data) => {
            genericDataHandler(exports.apps['CLI'].zodStore, data, { time: Date.now() });
        };
        repl.start({
            prompt: '> ',
            eval: async (input, cyx, fn, cb) => {
                exports.apps['CLI'].evaluator(input, appDataHandler, cb);
            }
        });
    }
};
exports.createApp = createApp;
(0, exports.createApp)(id);
//# sourceMappingURL=node.js.map