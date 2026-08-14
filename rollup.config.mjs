"use strict";

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import clear from 'rollup-plugin-clear';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import screeps from 'rollup-plugin-screeps';

const require = createRequire(import.meta.url);

function destConfig(dest) {
  if (process.env.SCREEPS_TOKEN) {
    return {
      token: process.env.SCREEPS_TOKEN,
      protocol: process.env.SCREEPS_PROTOCOL || 'https',
      hostname: process.env.SCREEPS_HOSTNAME || 'screeps.com',
      port: Number(process.env.SCREEPS_PORT || 443),
      path: process.env.SCREEPS_PATH || '/',
      branch: process.env.SCREEPS_BRANCH || dest
    };
  }

  if (!existsSync('./screeps.json')) {
    throw new Error(
      `No upload credentials. Set SCREEPS_TOKEN or copy screeps.sample.json to screeps.json.`
    );
  }

  const fileCfg = require('./screeps.json')[dest];
  if (!fileCfg) {
    throw new Error(`Invalid upload destination: ${dest}`);
  }
  return fileCfg;
}

let cfg;
const dest = process.env.DEST;
if (!dest) {
  console.log('No destination specified - code will be compiled but not uploaded');
} else {
  cfg = destConfig(dest);
}

export default {
  input: 'src/main.ts',
  output: {
    file: 'dist/main.js',
    format: 'cjs',
    sourcemap: true
  },

  plugins: [
    clear({ targets: ['dist'] }),
    resolve({
      extensions: ['.mjs', '.js', '.ts', '.json'],
      rootDir: 'src'
    }),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json', noEmitOnError: true }),
    screeps({ config: cfg, dryRun: cfg == null })
  ]
}
