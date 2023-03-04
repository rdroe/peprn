var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import stringArgv from "string-argv";
import { single, isNumber } from './validation';
export var yargsOptions = {
    'commands': {
        array: true,
        alias: 'c:c'
    },
    'names': {
        array: true,
        alias: 'c:n'
    },
    'help': {
        type: 'bool'
    }
};
var getIsModuleName = function (modules) { return function (str) {
    if (!modules)
        return false;
    return !!Object.keys(modules).includes(str);
}; };
export var parse = function (modules, rawOpts, rawIn) {
    var opts = __assign(__assign({}, rawOpts), yargsOptions);
    var input = typeof rawIn === 'string' ? stringArgv(rawIn) : rawIn;
    var currSubmodules = modules;
    var currModuleName = '';
    var ret = input.reduce(function (accum, curr) {
        var _a, _b, _c;
        var isModuleName = getIsModuleName(currSubmodules);
        var temp = accum.temp;
        if (isModuleName(curr)) {
            if (temp.lastCommandReached)
                throw new Error("Invariant violated; last command should be surpassed if module names are still being encountered.");
            if (undefined === currSubmodules[curr])
                throw new Error("Invariant violated; as a module name \"".concat(curr, "\" should be a property name in the current submodules being analyzed."));
            if (!temp.lastCommandReached) {
                currModuleName = "".concat(currModuleName, " ").concat(curr).trim();
                currSubmodules = currSubmodules[curr].submodules;
                var und = (_a = accum['_']) !== null && _a !== void 0 ? _a : [];
                var uInGood = und.concat([curr]);
                accum.moduleNames.push(currModuleName);
                return __assign(__assign({}, accum), { _: uInGood });
            }
            else
                throw new Error("A command /subcommand name cannot be repeated as an option name ");
        }
        else if (curr.startsWith('-') && !isNumber(curr)) {
            var newCursOptName_1 = curr.replace(/\-/g, '');
            var newCursOpt = opts[newCursOptName_1] || {
                array: false
            };
            var newCursAlias = (_b = newCursOpt.alias) !== null && _b !== void 0 ? _b : null;
            if (newCursAlias === null) {
                var aliasOwner = Object.entries(opts).find(function (_a) {
                    var ownerNm = _a[0], ownerOpt = _a[1];
                    return ownerOpt.alias === newCursOptName_1;
                });
                if (aliasOwner) {
                    newCursAlias = aliasOwner[0];
                    newCursOpt = aliasOwner[1];
                }
            }
            if (newCursOpt.type === 'bool' || newCursOpt.type === 'boolean') {
                var ret_1 = __assign(__assign({}, accum), { temp: __assign(__assign({}, temp !== null && temp !== void 0 ? temp : {}), { lastCommandReached: true }) });
                ret_1[newCursOptName_1] = true;
                if (newCursAlias !== null) {
                    ret_1[newCursAlias] = true;
                }
                return ret_1;
            }
            var newCursNames = newCursAlias ? [newCursOptName_1, newCursAlias] : [newCursOptName_1];
            return __assign(__assign({}, accum), { temp: {
                    lastCommandReached: true,
                    cursor: [newCursNames, newCursOpt]
                } });
        }
        else if (temp.lastCommandReached && ((_c = temp === null || temp === void 0 ? void 0 : temp.cursor) === null || _c === void 0 ? void 0 : _c.length)) {
            var nms_1 = temp.cursor[0];
            var opt_1 = temp.cursor[1];
            var ret_2 = __assign({}, accum);
            var parsed = single.parse(curr);
            var newVal_1 = parsed;
            var currValuation = Object.entries(accum).find(function (_a) {
                var optName = _a[0], currVal = _a[1];
                if (temp.cursor[0].includes(optName)) {
                    return true;
                }
                else {
                    return false;
                }
            });
            if (opt_1.array) {
                var currArr_1 = currValuation ? currValuation[1] : [];
                if (!Array.isArray(currArr_1))
                    throw new Error("Valuation of an array:true option should be an array at all times");
                nms_1.forEach(function (optName) {
                    ret_2[optName] = __spreadArray(__spreadArray([], currArr_1, true), [
                        newVal_1
                    ], false);
                });
                return ret_2;
            }
            nms_1.forEach(function (optName) {
                if (undefined !== ret_2[optName] && ['c:c', 'commands', 'c:n', 'names'].includes(optName)) {
                    if (!Array.isArray(ret_2[optName])) {
                        var msg = "value of opt: ".concat(JSON.stringify(opt_1), "; \"ret\": ").concat(JSON.stringify(ret_2), "; failed invariant; info ").concat(JSON.stringify({
                            temp: temp,
                            optName: optName,
                            ret: ret_2,
                            nms: nms_1,
                            opts: opts
                        }, null, 2), " ");
                        console.warn("Options name ".concat(optName, " in ").concat(curr, "; Attempted to supply multiple values to non - array option; or used an alias twice for different options; ").concat(msg, "; forcing non-array to be treated as array."));
                    }
                }
                if (undefined === ret_2[optName]) {
                    ret_2[optName] = newVal_1;
                }
                else {
                    ret_2[optName] = Array.isArray(ret_2[optName]) ? __spreadArray(__spreadArray([], ret_2[optName], true), [newVal_1], false) : [ret_2[optName], newVal_1];
                }
            });
            return ret_2;
        }
        else {
            var und = accum._, _d = accum.positionalNonCommands, positionalNonCommands = _d === void 0 ? [] : _d;
            return __assign(__assign({}, accum), { positionalNonCommands: (positionalNonCommands !== null && positionalNonCommands !== void 0 ? positionalNonCommands : []).concat([curr]), _: (und !== null && und !== void 0 ? und : []).concat([curr]) });
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
export var getMatchingModules = function (moduleObj) { return function (str) {
    var _a;
    console.log('get matching module', moduleObj, str);
    if (!moduleObj)
        return;
    var asArgs = stringArgv(str);
    var modulesAndSubmodules = [];
    var curs = asArgs.shift();
    var currSubmodules = moduleObj;
    while (curs && currSubmodules[curs]) {
        var foundModule = (_a = currSubmodules[curs]) !== null && _a !== void 0 ? _a : null;
        if (foundModule) {
            modulesAndSubmodules.push(foundModule);
        }
        currSubmodules = foundModule && foundModule.submodules ? foundModule.submodules : {};
        curs = asArgs.shift();
    }
    return modulesAndSubmodules;
}; };
//# sourceMappingURL=cliParser.js.map