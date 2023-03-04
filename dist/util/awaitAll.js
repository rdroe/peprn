"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const isProm = (arg1) => {
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
exports.default = awaitAll;
//# sourceMappingURL=awaitAll.js.map