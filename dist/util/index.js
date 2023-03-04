"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNode = void 0;
const isNode = () => {
    try {
        const fn = new Function("try { return window.document === undefined } catch(e) { return true; }");
        return fn();
    }
    catch (e) {
        console.log('presuming browser environment because isNode() errored out');
        return false;
    }
};
exports.isNode = isNode;
//# sourceMappingURL=index.js.map