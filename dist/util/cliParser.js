"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMatchingModules = exports.parse = exports.yargsOptions = void 0;
const string_argv_1 = __importDefault(require("string-argv"));
const validation_1 = require("./validation");
exports.yargsOptions = {
    'commands': {
        array: true,
        alias: 'c:c',
    },
    'names': {
        array: true,
        alias: 'c:n',
    },
    'help': {
        type: 'bool'
    }
};
const getIsModuleName = (modules) => (str) => {
    if (!modules)
        return false;
    return !!Object.keys(modules).includes(str);
};
const parse = (modules, rawOpts, rawIn) => {
    const opts = { ...rawOpts, ...exports.yargsOptions };
    const input = typeof rawIn === 'string' ? (0, string_argv_1.default)(rawIn) : rawIn;
    let currSubmodules = modules;
    let currModuleName = '';
    const ret = input.reduce((accum, curr) => {
        const isModuleName = getIsModuleName(currSubmodules);
        const { temp } = accum;
        if (isModuleName(curr)) {
            if (temp.lastCommandReached)
                throw new Error(`Invariant violated; last command should be surpassed if module names are still being encountered.`);
            if (undefined === currSubmodules[curr])
                throw new Error(`Invariant violated; as a module name "${curr}" should be a property name in the current submodules being analyzed.`);
            if (!temp.lastCommandReached) {
                currModuleName = `${currModuleName} ${curr}`.trim();
                currSubmodules = currSubmodules[curr].submodules;
                const und = accum['_'] ?? [];
                const uInGood = und.concat([curr]);
                accum.moduleNames.push(currModuleName);
                return {
                    ...accum,
                    _: uInGood
                };
            }
            else
                throw new Error(`A command /subcommand name cannot be repeated as an option name `);
        }
        else if (curr.startsWith('-') && !(0, validation_1.isNumber)(curr)) {
            const newCursOptName = curr.replace(/\-/g, '');
            let newCursOpt = opts[newCursOptName] || {
                array: false,
            };
            let newCursAlias = newCursOpt.alias ?? null;
            if (newCursAlias === null) {
                const aliasOwner = Object.entries(opts).find(([ownerNm, ownerOpt]) => {
                    return ownerOpt.alias === newCursOptName;
                });
                if (aliasOwner) {
                    newCursAlias = aliasOwner[0];
                    newCursOpt = aliasOwner[1];
                }
            }
            if (newCursOpt.type === 'bool' || newCursOpt.type === 'boolean') {
                const ret = {
                    ...accum,
                    temp: {
                        ...temp ?? {},
                        lastCommandReached: true
                    }
                };
                ret[newCursOptName] = true;
                if (newCursAlias !== null) {
                    ret[newCursAlias] = true;
                }
                return ret;
            }
            const newCursNames = newCursAlias ? [newCursOptName, newCursAlias] : [newCursOptName];
            return {
                ...accum,
                temp: {
                    lastCommandReached: true,
                    cursor: [newCursNames, newCursOpt]
                }
            };
        }
        else if (temp.lastCommandReached && temp?.cursor?.length) {
            const nms = temp.cursor[0];
            const opt = temp.cursor[1];
            const ret = {
                ...accum
            };
            const parsed = validation_1.single.parse(curr);
            const newVal = parsed;
            const currValuation = Object.entries(accum).find(([optName, currVal]) => {
                if (temp.cursor[0].includes(optName)) {
                    return true;
                }
                else {
                    return false;
                }
            });
            if (opt.array) {
                let currArr = currValuation ? currValuation[1] : [];
                if (!Array.isArray(currArr))
                    throw new Error(`Valuation of an array:true option should be an array at all times`);
                nms.forEach((optName) => {
                    ret[optName] = [
                        ...currArr,
                        newVal
                    ];
                });
                return ret;
            }
            nms.forEach((optName) => {
                if (undefined !== ret[optName] && ['c:c', 'commands', 'c:n', 'names'].includes(optName)) {
                    if (!Array.isArray(ret[optName])) {
                        const msg = `value of opt: ${JSON.stringify(opt)}; "ret": ${JSON.stringify(ret)}; failed invariant; info ${JSON.stringify({
                            temp,
                            optName,
                            ret,
                            nms,
                            opts
                        }, null, 2)} `;
                        console.warn(`Options name ${optName} in ${curr}; Attempted to supply multiple values to non - array option; or used an alias twice for different options; ${msg}; forcing non-array to be treated as array.`);
                    }
                }
                if (undefined === ret[optName]) {
                    ret[optName] = newVal;
                }
                else {
                    ret[optName] = Array.isArray(ret[optName]) ? [...ret[optName], newVal] : [ret[optName], newVal];
                }
            });
            return ret;
        }
        else {
            const { _: und, positionalNonCommands = [] } = accum;
            return {
                ...accum,
                positionalNonCommands: (positionalNonCommands ?? []).concat([curr]),
                _: (und ?? []).concat([curr])
            };
        }
    }, {
        positionalNonCommands: null,
        'c:c': [],
        'c:n': [],
        commands: [],
        names: [],
        moduleNames: [],
        temp: {
            lastCommandReached: false,
            cursor: null
        }
    });
    return ret;
};
exports.parse = parse;
const getMatchingModules = (moduleObj) => (str) => {
    console.log('get matching module', moduleObj, str);
    if (!moduleObj)
        return;
    const asArgs = (0, string_argv_1.default)(str);
    let modulesAndSubmodules = [];
    let curs = asArgs.shift();
    let currSubmodules = moduleObj;
    while (curs && currSubmodules[curs]) {
        const foundModule = currSubmodules[curs] ?? null;
        if (foundModule) {
            modulesAndSubmodules.push(foundModule);
        }
        currSubmodules = foundModule && foundModule.submodules ? foundModule.submodules : {};
        curs = asArgs.shift();
    }
    return modulesAndSubmodules;
};
exports.getMatchingModules = getMatchingModules;
//# sourceMappingURL=cliParser.js.map