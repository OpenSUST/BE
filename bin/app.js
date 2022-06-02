#!/usr/bin/env node

const fs = require('fs-extra');
const esbuild = require('esbuild');

const major = +process.version.split('.')[0].split('v')[1];
const minor = +process.version.split('.')[1];

function transform(filename) {
    const code = fs.readFileSync(filename, 'utf-8');
    const result = esbuild.transformSync(code, {
        sourcefile: filename,
        format: 'cjs',
        loader: 'tsx',
        target: `node${major}.${minor}`,
        jsx: 'transform',
    });
    if (result.warnings.length) console.warn(result.warnings);
    return result.code;
}
require.extensions['.js'] = function loader(module, filename) {
    const content = fs.readFileSync(filename, 'utf-8');
    return module._compile(content, filename);
};
require.extensions['.ts'] = require.extensions['.tsx'] = function loader(module, filename) {
    return module._compile(transform(filename), filename);
};
require('../app');
