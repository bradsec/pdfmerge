import js from "@eslint/js";
import globals from "globals";

export default [
    {
        ignores: ["js/vendor/**"],
    },
    js.configs.recommended,
    {
        files: ["js/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
                EXIF: "readonly",
                PDFLib: "readonly",
                fontkit: "readonly",
            },
        },
        rules: {
            eqeqeq: "error",
            "no-duplicate-imports": "error",
            "no-useless-return": "error",
            "no-var": "error",
            "prefer-const": "error",
        },
    },
    {
        files: ["tests/**/*.mjs"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: globals.node,
        },
    },
];
