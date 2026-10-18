import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { readStylesheet } from "./read-stylesheet";

export async function buildInventoryPhotoFixture() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const result = await build({ absWorkingDir: root, entryPoints: ["tests/e2e/fixtures/inventory-photo-pan-zoom.tsx"], outfile: "fixture.js", bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "next-dynamic-fixture", setup(builder) {
      builder.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: "dynamic", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `import React,{lazy,Suspense} from 'react';export default function dynamic(load,options={}){const Component=lazy(()=>load().then(value=>({default:value.default??value})));return function Dynamic(props){const Loading=options.loading;return <Suspense fallback={Loading?<Loading/>:null}><Component {...props}/></Suspense>}}`, loader: "tsx", resolveDir: root }));
    } }],
  });
  return { script: result.outputFiles.find((file) => file.path.endsWith(".js"))!.text,
    css: readStylesheet(new URL("../../src/app/globals.css", import.meta.url)) + result.outputFiles.find((file) => file.path.endsWith(".css"))!.text };
}
