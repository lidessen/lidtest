import fs from "fs";
import * as esbuild from "esbuild";

const code = fs.readFileSync("./cli.ts", "utf-8");

const result = await esbuild.transform(code, {
  platform: "node",
  loader: "ts",
  format: "esm",
  banner: "#!/usr/bin/env node\n",
});

fs.writeFileSync("./dist/cli.js", result.code);
