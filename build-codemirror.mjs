import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'scripts/vendor/codemirror-entry.mjs',
  output: {
    file: 'scripts/vendor/codemirror.mjs',
    format: 'es'
  },
  plugins: [nodeResolve()]
};
