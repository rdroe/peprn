"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const scalar_1 = __importDefault(require("./scalar"));
const cm = {
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
exports.default = cm;
//# sourceMappingURL=index.js.map