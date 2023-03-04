"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = exports.appResolvers = exports.apps = void 0;
const evaluator_1 = require("./evaluator");
exports.apps = {};
exports.appResolvers = {};
const makeFinalCallback = (id, res) => async (err, result) => {
    if (err)
        throw new Error(`Error intercepted; `, err);
    res();
    if (result) {
    }
    exports.apps[id].restarter = makeProm(id);
};
const genericDataHandler = (id, data, params) => {
    const zodStore = exports.apps[id].zodStore;
    zodStore[params.time] = data;
    const dataEl = exports.apps[id].dataEl;
    dataEl.innerHTML = `${dataEl.innerHTML}\n${JSON.stringify(data, null, 2)}`;
};
const createApp = async (id) => {
    exports.apps[id] = {
        el: document.querySelector(`textarea`),
        dataEl: document.querySelector('pre'),
        evaluator: (0, evaluator_1.makeRunner)({ id }),
        zodStore: {},
        dataHandler: (input, data) => {
            genericDataHandler(id, data, { time: Date.now() });
        },
        restarter: null
    };
    exports.apps[id].restarter = makeProm(id);
};
exports.createApp = createApp;
function makeProm(id) {
    return new Promise((res) => {
        exports.apps[id].el.onkeyup = (ev) => {
            if (ev.key === 'Enter') {
                const t = exports.apps[id].el.value;
                exports.apps[id].el.value = '';
                exports.apps[id].evaluator(t, exports.apps[id].dataHandler, makeFinalCallback(id, res));
            }
            else {
                console.log('asdf', exports.apps[id].el.value);
            }
        };
    });
}
//# sourceMappingURL=browser.js.map