"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeRunner = void 0;
const cliParser_1 = require("./util/cliParser");
const awaitAll_1 = __importDefault(require("./util/awaitAll"));
const match_1 = __importDefault(require("./match"));
const makeRunner = (opts) => {
    return async (input, dataCallback, finalCallback) => {
        const parsed = (0, cliParser_1.parse)({ match: match_1.default }, cliParser_1.yargsOptions, input);
        const matched = (0, cliParser_1.getMatchingModules)({ match: match_1.default })(input);
        if (matched.length) {
            matched.reverse();
            const modNames = [...parsed.moduleNames];
            modNames.reverse();
            let n = 0;
            const successiveCalls = {};
            do {
                const o = n;
                const moduleName = modNames[o];
                successiveCalls[moduleName] = ((() => {
                    return matched[o].fn.call(null, parsed, successiveCalls);
                })());
                n += 1;
            } while (!!matched[n]);
            const allData = await (0, awaitAll_1.default)(successiveCalls);
            dataCallback(null, allData);
            if (finalCallback) {
                finalCallback(null, allData);
            }
        }
        else {
            finalCallback(null, null);
        }
    };
};
exports.makeRunner = makeRunner;
//# sourceMappingURL=evaluator.js.map