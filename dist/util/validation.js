import { z } from 'zod';
export var isNumber = function (arg) {
    return arg.match(/^(\-{0,1}[0-9]*\.[0-9]+|^\-{0,1}[0-9]+)$/) !== null;
};
export var num = z.number().or(z.string().refine(function (val) {
    return isNumber(val);
})).transform(function (val) {
    return parseFloat(val);
});
export var allNum = function (arg) {
    var anyIsUndefined = false;
    var firstNonNum = arg.find(function (anArg) {
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
};
export var allToNum = function (arg) {
    return arg.map(function (anArg) {
        var num1 = num.parse(anArg);
        if (isNaN(num1))
            throw new Error("Parsing ".concat(arg, " turned up NaN"));
        return num1;
    });
};
var hasBracket = function (str) {
    return str.includes('{') || str.includes('[');
};
export var parseable = z.string().refine(function (val) {
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
});
export var passivelyParsed = function (val) {
    var parseableResult = parseable.safeParse(val);
    if (parseableResult.success) {
        return parseableResult;
    }
    return z.string().parse(val);
};
export var single = num.or(parseable.transform(function (val) {
    return JSON.parse(val);
})).nullable().or(z.string());
export var parseCli = z.array(single);
//# sourceMappingURL=validation.js.map