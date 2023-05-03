System.register("util/types", [], function (exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("util/validation", ["zod"], function (exports_2, context_2) {
    "use strict";
    var zod_1, isNumber, num, allNum, allToNum, hasBracket, parseable, passivelyParsed, single, parseCli;
    var __moduleName = context_2 && context_2.id;
    return {
        setters: [
            function (zod_1_1) {
                zod_1 = zod_1_1;
            }
        ],
        execute: function () {
            exports_2("isNumber", isNumber = (arg) => {
                return arg.match(/^(\-{0,1}[0-9]*\.[0-9]+|^\-{0,1}[0-9]+)$/) !== null;
            });
            exports_2("num", num = zod_1.z.number().or(zod_1.z.string().refine((val) => {
                return isNumber(val);
            })).transform((val) => {
                return parseFloat(val);
            }));
            exports_2("allNum", allNum = (arg) => {
                let anyIsUndefined = false;
                const firstNonNum = arg.find((anArg) => {
                    if (!anyIsUndefined) {
                        anyIsUndefined = (anArg === undefined);
                    }
                    return !anyIsUndefined && !isNumber(anArg);
                });
                if (anyIsUndefined)
                    return false;
                if (firstNonNum === undefined)
                    return true;
                return false;
            });
            exports_2("allToNum", allToNum = (arg) => {
                return arg.map((anArg) => {
                    const num1 = num.parse(anArg);
                    if (isNaN(num1))
                        throw new Error(`Parsing ${arg} turned up NaN`);
                    return num1;
                });
            });
            hasBracket = (str) => {
                return str.includes('{') || str.includes('[');
            };
            exports_2("parseable", parseable = zod_1.z.string().refine((val) => {
                if (['null', 'true', 'false'].includes(val.trim())) {
                    return true;
                }
                if (!hasBracket(val))
                    return false;
                try {
                    JSON.parse(val);
                    return true;
                }
                catch (e) {
                    return false;
                }
            }));
            exports_2("passivelyParsed", passivelyParsed = (val) => {
                const parseableResult = parseable.safeParse(val);
                if (parseableResult.success) {
                    return parseableResult;
                }
                return zod_1.z.string().parse(val);
            });
            exports_2("single", single = num.or(parseable.transform((val) => {
                return JSON.parse(val);
            })).nullable().or(zod_1.z.string()));
            exports_2("parseCli", parseCli = zod_1.z.array(single));
        }
    };
});
System.register("util/cliParser", ["string-argv", "util/validation"], function (exports_3, context_3) {
    "use strict";
    var string_argv_1, validation_1, yargsOptions, getIsModuleName, parse, getMatchingModules;
    var __moduleName = context_3 && context_3.id;
    return {
        setters: [
            function (string_argv_1_1) {
                string_argv_1 = string_argv_1_1;
            },
            function (validation_1_1) {
                validation_1 = validation_1_1;
            }
        ],
        execute: function () {
            exports_3("yargsOptions", yargsOptions = {
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
            });
            getIsModuleName = (modules) => (str) => {
                if (!modules)
                    return false;
                return !!Object.keys(modules).includes(str);
            };
            exports_3("parse", parse = (modules, rawOpts, rawIn) => {
                const opts = { ...rawOpts, ...yargsOptions };
                const input = typeof rawIn === 'string' ? string_argv_1.default(rawIn) : rawIn;
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
                    else if (curr.startsWith('-') && !validation_1.isNumber(curr)) {
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
            });
            exports_3("getMatchingModules", getMatchingModules = (moduleObj) => (str) => {
                if (!moduleObj)
                    return;
                const asArgs = string_argv_1.default(str);
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
            });
        }
    };
});
System.register("util/awaitAll", [], function (exports_4, context_4) {
    "use strict";
    var isProm;
    var __moduleName = context_4 && context_4.id;
    async function awaitAll(allProperties) {
        let props = [];
        let vals = [];
        Object.entries(allProperties).forEach(([p, v]) => {
            if (isProm(v)) {
                vals.push(v);
            }
            else {
                vals.push(Promise.resolve(v));
            }
            props.push(p);
        });
        const completions = await Promise.all(vals);
        const cb = (accum, prop, idx) => {
            return { ...accum, [prop]: completions[idx] };
        };
        return props.reduce(cb, {});
    }
    exports_4("default", awaitAll);
    return {
        setters: [],
        execute: function () {
            isProm = (arg1) => {
                if (arg1 === null)
                    return false;
                if (arg1 === undefined)
                    return false;
                if (typeof arg1 === 'function')
                    return false;
                const isFunc = (propVal) => typeof propVal === 'function';
                return ['catch', 'finally', 'then'].reduce((tOrF, fnName) => {
                    if (tOrF === false) {
                        return false;
                    }
                    return arg1[fnName] !== undefined && isFunc(arg1[fnName]);
                }, true);
            };
        }
    };
});
System.register("match/scalar", [], function (exports_5, context_5) {
    "use strict";
    var cm;
    var __moduleName = context_5 && context_5.id;
    return {
        setters: [],
        execute: function () {
            cm = {
                help: {
                    description: 'test whether the supplied scalar pairs are equal',
                    examples: {
                        '-l 1 2 3 -r 1 2 4': 'test whether 1 equals 1, 2 equals 2, and 3 equals 4; output contains a map and list of equalities.',
                        '--left 1 2 3 --right 1 2 4': 'test whether 1 equals 1, 2 equals 2, and 3 equals 4; output contains a map and list of equalities.'
                    }
                },
                validate: (arg) => {
                    console.log('result:', arg);
                    return true;
                },
                fn: async function scalarMatch(argv) {
                    let left;
                    let right;
                    const { l, r } = argv;
                    if (!Array.isArray(l)) {
                        left = [l];
                    }
                    else {
                        left = l;
                    }
                    if (!Array.isArray(r)) {
                        right = [r];
                    }
                    else {
                        right = r;
                    }
                    return left.map((ll, idx) => {
                        const rt = right[idx];
                        return {
                            index: idx,
                            match: ll === rt,
                            left: ll,
                            right: rt
                        };
                    });
                },
                yargs: {
                    l: {
                        alias: 'left',
                        array: true
                    },
                    r: {
                        alias: 'right',
                        array: true
                    }
                }
            };
            exports_5("default", cm);
        }
    };
});
System.register("match/index", ["match/scalar"], function (exports_6, context_6) {
    "use strict";
    var scalar_1, cm;
    var __moduleName = context_6 && context_6.id;
    return {
        setters: [
            function (scalar_1_1) {
                scalar_1 = scalar_1_1;
            }
        ],
        execute: function () {
            cm = {
                help: {
                    description: 'test whether specified option values are equal',
                    options: {
                        'l (left)': 'comparison value',
                        'r (right)': 'comparison value'
                    },
                },
                fn: async function match(_, y) {
                    if (!y)
                        return null;
                    const childResults = await Promise.all(Object.values(y));
                    return childResults.flat().length;
                },
                submodules: {
                    scalar: scalar_1.default
                }
            };
            exports_6("default", cm);
        }
    };
});
System.register("evaluator", ["util/cliParser", "util/awaitAll", "match/index"], function (exports_7, context_7) {
    "use strict";
    var cliParser_1, awaitAll_1, match_1, makeRunner;
    var __moduleName = context_7 && context_7.id;
    return {
        setters: [
            function (cliParser_1_1) {
                cliParser_1 = cliParser_1_1;
            },
            function (awaitAll_1_1) {
                awaitAll_1 = awaitAll_1_1;
            },
            function (match_1_1) {
                match_1 = match_1_1;
            }
        ],
        execute: function () {
            exports_7("makeRunner", makeRunner = (opts, appsSingleton) => {
                const { modules = { match: match_1.default }, id } = opts;
                return async (inputRaw, dataCallback, finalCallback) => {
                    const input = opts.preprocessInput ? opts.preprocessInput(inputRaw, id, appsSingleton) : inputRaw;
                    const parsed = cliParser_1.parse({ match: match_1.default, ...modules }, cliParser_1.yargsOptions, input);
                    const matched = cliParser_1.getMatchingModules({ match: match_1.default, ...modules })(input);
                    const effects = Object.values(appsSingleton).map((app1) => app1.userEffects).reduce((fns, currFns) => {
                        return fns.concat(currFns);
                    }, []);
                    if (matched.length) {
                        matched.reverse();
                        const modNames = [...parsed.moduleNames];
                        modNames.reverse();
                        let n = 0;
                        const successiveCalls = {};
                        do {
                            const o = n;
                            const moduleName = modNames[o];
                            successiveCalls[moduleName] = ((async () => {
                                const results = await matched[o].fn.call(null, parsed, successiveCalls, id, appsSingleton);
                                const singletonPackage = { appId: id, apps: appsSingleton, args: parsed };
                                const callbackResults = await dataCallback(moduleName, results, singletonPackage);
                                await Promise.all(effects.map((fn1) => fn1(moduleName, id, singletonPackage)));
                                return callbackResults;
                            })());
                            n += 1;
                        } while (!!matched[n]);
                        const allData = await awaitAll_1.default(successiveCalls);
                        if (finalCallback) {
                            finalCallback(null, allData);
                        }
                    }
                    else {
                        finalCallback(null, null);
                    }
                };
            });
        }
    };
});
System.register("browser-default-history", ["dexie"], function (exports_8, context_8) {
    "use strict";
    var dexie_1, HistoryDatabase, histDb, history, makeHistory;
    var __moduleName = context_8 && context_8.id;
    return {
        setters: [
            function (dexie_1_1) {
                dexie_1 = dexie_1_1;
            }
        ],
        execute: function () {
            HistoryDatabase = class HistoryDatabase extends dexie_1.default {
                history;
                constructor() {
                    super("HistoryDatabase");
                    this.version(1).stores({
                        history: "++id,cliId"
                    });
                }
            };
            histDb = new HistoryDatabase();
            exports_8("history", history = {
                fn: async () => { },
                submodules: {
                    delete: {
                        fn: async (_, __, appId, apps) => {
                            if (!appId || typeof appId !== 'string')
                                return "Argument appId is required and must be a string";
                            const storedHistIds = (await histDb.history.where('cliId').equals(appId).toArray()).map(({ id }) => id);
                            const deletion = await histDb.history.bulkDelete(storedHistIds);
                            apps[appId].historyData = [];
                            apps[appId].histCursor = 0;
                            return {
                                deleted: deletion
                            };
                        }
                    }
                }
            });
            exports_8("makeHistory", makeHistory = async (apps, id) => {
                if (!apps[id].historyData) {
                    const storedHist = (await histDb.history.where('cliId').equals(id).toArray());
                    const texts = storedHist.map(({ text }) => text) || [];
                    apps[id].historyData = texts;
                }
                apps[id].histCursor = apps[id].historyData.length;
                return async (key, evalResponse = 'not-called') => {
                    if (evalResponse === 'called') {
                        apps[id].histCursor = apps[id].historyData.length;
                        const val = apps[id].el.value.replace(/[\n\s]+$/g, '');
                        if (val && val.startsWith('history delete') === false) {
                            if (apps[id].historyData[apps[id].historyData.length - 1] !== val) {
                                apps[id].historyData[apps[id].histCursor] = val;
                                apps[id].histCursor = apps[id].historyData.length;
                                histDb.history.add({
                                    cliId: id,
                                    text: val,
                                });
                            }
                        }
                    }
                    else if (key.key === 'ArrowDown' && key.altKey) {
                        if (typeof apps[id].historyData[apps[id].histCursor + 1] === 'string') {
                            apps[id].histCursor += 1;
                            apps[id].el.value = apps[id].historyData[apps[id].histCursor];
                        }
                    }
                    else if (key.key === 'ArrowUp' && key.altKey) {
                        if (undefined !== apps[id].historyData[apps[id].histCursor - 1]) {
                            apps[id].histCursor -= 1;
                            apps[id].el.value = apps[id].historyData[apps[id].histCursor];
                        }
                    }
                };
            });
        }
    };
});
System.register("browser", ["browser-default-history", "evaluator"], function (exports_9, context_9) {
    "use strict";
    var browser_default_history_1, evaluator_1, apps, makeFinalCallback, genericDataHandler, createApp;
    var __moduleName = context_9 && context_9.id;
    function makeProm(id) {
        return new Promise((res) => {
            apps[id].el.onkeyup = async (ev) => {
                let evalInter = 'not-called';
                const t = apps[id].el.value;
                if (ev.key === 'Enter' && !ev.shiftKey) {
                    await apps[id].evaluator(t, apps[id].dataHandler, makeFinalCallback(id, res));
                    evalInter = 'called';
                }
                if (apps[id].history) {
                    await apps[id].history(ev, evalInter);
                }
                if (ev.key === 'Enter' && !ev.shiftKey) {
                    apps[id].el.value = '';
                }
            };
        });
    }
    return {
        setters: [
            function (browser_default_history_1_1) {
                browser_default_history_1 = browser_default_history_1_1;
            },
            function (evaluator_1_1) {
                evaluator_1 = evaluator_1_1;
            }
        ],
        execute: function () {
            exports_9("apps", apps = {});
            makeFinalCallback = (id, res) => async (err, result) => {
                if (err)
                    throw new Error(`Error intercepted; `, err);
                res();
                apps[id].restarter = makeProm(id);
            };
            genericDataHandler = async (input, data, { args: ParsedCli, appId: uniqueAppId, apps: CliApps }) => {
                const zodStore = apps[uniqueAppId].zodStore;
                zodStore[Date.now()] = data;
                const dataEl = apps[uniqueAppId].dataEl;
                dataEl.innerHTML = `${dataEl.innerHTML}\n${JSON.stringify(data, null, 2)}`;
                return data;
            };
            exports_9("createApp", createApp = async (opts, runner) => {
                const { id, modules, history } = opts;
                const combinedModules = { ...modules };
                if (!history) {
                    combinedModules.history = combinedModules.history || browser_default_history_1.history;
                }
                const outputSelector = `#${id}-out`;
                apps[id] = {
                    el: document.querySelector(`#${id}`),
                    dataEl: document.querySelector(outputSelector),
                    evaluator: runner ? runner : evaluator_1.makeRunner({ ...opts, modules: combinedModules }, apps),
                    zodStore: {},
                    dataHandler: opts.dataHandler ? opts.dataHandler : genericDataHandler,
                    restarter: null,
                    userEffects: opts.userEffects ?? []
                };
                console.log('apps', apps);
                apps[id].restarter = makeProm(id);
                apps[id].history = history ? history : await browser_default_history_1.makeHistory(apps, id);
                if (opts.init) {
                    opts.init(id, apps);
                }
            });
        }
    };
});
System.register("util/index", [], function (exports_10, context_10) {
    "use strict";
    var isNode;
    var __moduleName = context_10 && context_10.id;
    return {
        setters: [],
        execute: function () {
            exports_10("isNode", isNode = () => {
                try {
                    const fn = new Function("try { return window.document === undefined } catch(e) { return true; }");
                    return fn();
                }
                catch (e) {
                    console.log('presuming browser environment because isNode() errored out');
                    return false;
                }
            });
        }
    };
});
System.register("util/strlog", [], function (exports_11, context_11) {
    "use strict";
    var __moduleName = context_11 && context_11.id;
    return {
        setters: [],
        execute: function () {
            exports_11("default", (arg) => console.log(JSON.stringify(arg, null, 2)));
        }
    };
});
System.register("node", ["evaluator", "util/index"], function (exports_12, context_12) {
    "use strict";
    var evaluator_2, util_1, apps, genericDataHandler, createApp;
    var __moduleName = context_12 && context_12.id;
    return {
        setters: [
            function (evaluator_2_1) {
                evaluator_2 = evaluator_2_1;
            },
            function (util_1_1) {
                util_1 = util_1_1;
            }
        ],
        execute: function () {
            exports_12("apps", apps = {});
            genericDataHandler = async (id, data, { args: ParsedCli, appId: string, apps: CliApps }) => {
                const zodStore = apps[id].zodStore;
                zodStore[Date.now()] = data;
                return data;
            };
            exports_12("createApp", createApp = async (opts, runner) => {
                const { id } = opts;
                if (util_1.isNode()) {
                    const { default: repl } = await context_12.import('node:repl');
                    apps[id] = {
                        evaluator: runner ? runner : evaluator_2.makeRunner({ ...opts }, apps),
                        zodStore: {},
                        dataHandler: opts.dataHandler ?? genericDataHandler,
                        userEffects: opts.userEffects ?? []
                    };
                    repl.start({
                        prompt: '> ',
                        eval: async (input, _, __, cb) => {
                            apps[id].evaluator(input, genericDataHandler, cb);
                        }
                    });
                    if (opts.init) {
                        opts.init(id, apps);
                    }
                }
            });
        }
    };
});
System.register("index", ["util/index", "node", "browser", "evaluator"], function (exports_13, context_13) {
    "use strict";
    var index_1, browser_1;
    var __moduleName = context_13 && context_13.id;
    var exportedNames_1 = {
        "createServerApp": true,
        "createBrowserApp": true
    };
    function exportStar_1(m) {
        var exports = {};
        for (var n in m) {
            if (n !== "default" && !exportedNames_1.hasOwnProperty(n)) exports[n] = m[n];
        }
        exports_13(exports);
    }
    return {
        setters: [
            function (index_1_1) {
                index_1 = index_1_1;
            },
            function (node_1_1) {
                exports_13({
                    "createServerApp": node_1_1["createApp"]
                });
            },
            function (browser_1_1) {
                browser_1 = browser_1_1;
            },
            function (evaluator_3_1) {
                exportStar_1(evaluator_3_1);
            }
        ],
        execute: function () {
            exports_13("createBrowserApp", browser_1.createApp);
            if (!index_1.isNode()) {
                window.createBrowserApp = browser_1.createApp;
            }
        }
    };
});
System.register("testable/app", ["index", "match/index"], function (exports_14, context_14) {
    "use strict";
    var __1, match;
    var __moduleName = context_14 && context_14.id;
    return {
        setters: [
            function (__1_1) {
                __1 = __1_1;
            },
            function (match_2) {
                match = match_2;
            }
        ],
        execute: function () {
            console.log('testing repl-experiment', match);
            __1.createBrowserApp({
                id: 'cli', modules: {
                    match: match.default
                }
            });
        }
    };
});
System.register("util/predicates", [], function (exports_15, context_15) {
    "use strict";
    var __moduleName = context_15 && context_15.id;
    return {
        setters: [],
        execute: function () {
            exports_15("default", {});
        }
    };
});
System.register("util/exports", ["util/cliParser", "util/types", "util/validation", "util/index", "util/strlog", "util/predicates", "util/awaitAll"], function (exports_16, context_16) {
    "use strict";
    var __moduleName = context_16 && context_16.id;
    var exportedNames_2 = {
        "strlog": true,
        "awaitAll": true
    };
    function exportStar_2(m) {
        var exports = {};
        for (var n in m) {
            if (n !== "default" && !exportedNames_2.hasOwnProperty(n)) exports[n] = m[n];
        }
        exports_16(exports);
    }
    return {
        setters: [
            function (cliParser_2_1) {
                exportStar_2(cliParser_2_1);
            },
            function (types_1_1) {
                exportStar_2(types_1_1);
            },
            function (validation_2_1) {
                exportStar_2(validation_2_1);
            },
            function (index_2_1) {
                exportStar_2(index_2_1);
            },
            function (strlog_1_1) {
                exports_16({
                    "strlog": strlog_1_1["default"]
                });
            },
            function (predicates_1_1) {
                exportStar_2(predicates_1_1);
            },
            function (awaitAll_2_1) {
                exports_16({
                    "awaitAll": awaitAll_2_1["default"]
                });
            }
        ],
        execute: function () {
        }
    };
});
//# sourceMappingURL=repl-experiment.umd.js.map