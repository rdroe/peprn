export var isNode = function () {
    try {
        var fn = new Function("try { return window.document === undefined } catch(e) { return true; }");
        return fn();
    }
    catch (e) {
        console.log('presuming browser environment because isNode() errored out');
        return false;
    }
};
//# sourceMappingURL=index.js.map