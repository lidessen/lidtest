import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["./cli.ts"],
  outfile: "./dist/cli.js",
  bundle: true,
  platform: "node",
  format: "esm",
  banner: {
    js: "#!/usr/bin/env node\n",
  },
  packages: "external",
});
