"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCli = exports.single = exports.passivelyParsed = exports.parseable = exports.allToNum = exports.allNum = exports.num = exports.isNumber = void 0;
const zod_1 = require("zod");
const isNumber = (arg) => {
    return arg.match(/^(\-{0,1}[0-9]*\.[0-9]+|^\-{0,1}[0-9]+)$/) !== null;
};
exports.isNumber = isNumber;
exports.num = zod_1.z.number().or(zod_1.z.string().refine((val) => {
    return (0, exports.isNumber)(val);
})).transform((val) => {
    return parseFloat(val);
});
const allNum = (arg) => {
    let anyIsUndefined = false;
    const firstNonNum = arg.find((anArg) => {
        if (!anyIsUndefined) {
            anyIsUndefined = (anArg === undefined);
        }
        return !anyIsUndefined && !(0, exports.isNumber)(anArg);
    });
    if (anyIsUndefined)
        return false;
    if (firstNonNum === undefined)
        return true;
    return false;
};
exports.allNum = allNum;
const allToNum = (arg) => {
    return arg.map((anArg) => {
        const num1 = exports.num.parse(anArg);
        if (isNaN(num1))
            throw new Error(`Parsing ${arg} turned up NaN`);
        return num1;
    });
};
exports.allToNum = allToNum;
const hasBracket = (str) => {
    return str.includes('{') || str.includes('[');
};
exports.parseable = zod_1.z.string().refine((val) => {
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
const passivelyParsed = (val) => {
    const parseableResult = exports.parseable.safeParse(val);
    if (parseableResult.success) {
        return parseableResult;
    }
    return zod_1.z.string().parse(val);
};
exports.passivelyParsed = passivelyParsed;
exports.single = exports.num.or(exports.parseable.transform((val) => {
    return JSON.parse(val);
})).nullable().or(zod_1.z.string());
exports.parseCli = zod_1.z.array(exports.single);
//# sourceMappingURL=validation.js.map