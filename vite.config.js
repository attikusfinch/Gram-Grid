import {realpathSync} from "node:fs";
import {defineConfig} from "vite";
import {nodePolyfills} from "vite-plugin-node-polyfills";
export default defineConfig({root:realpathSync(process.cwd()),build:{target:"es2022"},plugins:[nodePolyfills({include:["buffer","events","stream","util","process","crypto","assert","string_decoder"]})]});
