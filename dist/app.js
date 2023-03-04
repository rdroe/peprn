"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = exports.apps = void 0;
exports.apps = {};
const createApp = (taSelector, dataSelector) => {
    const cliEl = document.querySelector(taSelector);
    const dataEl = document.querySelector(dataSelector);
    if (!cliEl)
        throw new Error(`Could not initialize app; selector was ${taSelector}`);
    if (!dataEl)
        throw new Error(`Could not initialize data recipient; selector was ${dataSelector}`);
    cliEl.onkeyup = (ev) => {
        console.log(ev);
        dataEl.innerHTML += (ev.key + '\n');
    };
};
exports.createApp = createApp;
//# sourceMappingURL=app.js.map