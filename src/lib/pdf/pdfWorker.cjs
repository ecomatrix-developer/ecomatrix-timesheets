// Runs as a genuinely separate Node child process (see renderInChildProcess.ts).
//
// WHY THIS EXISTS: Next.js's server runtime (dev AND production — confirmed
// via a full `next build && next start` test) substitutes its own internal
// React 19 canary for every `require("react")` call made inside the server
// process, to support the App Router's RSC pipeline. @react-pdf/renderer
// bundles a reconciler built against React 18's element shape, and throws
// "Minified React error #31" on literally any render (even a bare
// `<Document><Page><Text>hello</Text></Page></Document>`) when it receives
// elements from that substituted React 19 instance. Forking a plain Node
// child process is the only reliable escape — this process never loads
// Next's server runtime, so `require("react")` here resolves to the real
// react@18.3.1 in node_modules.
//
// The actual report documents are authored as normal .tsx (JSX) files so
// they stay in sync with the rest of the app; esbuild compiles/bundles them
// in-memory here, once per render, before requiring them.

const path = require("node:path");
const esbuild = require("esbuild");
const Module = require("node:module");

const PROJECT_ROOT = path.join(__dirname, "..", "..", "..");
const SRC_ROOT = path.join(PROJECT_ROOT, "src");

async function loadRendererModule(entryPath) {
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    target: "node18",
    jsx: "automatic",
    external: ["react", "react-dom", "@react-pdf/renderer"],
    plugins: [
      {
        name: "alias-and-stub",
        setup(build) {
          // Resolve the project's "@/x" -> "src/x" alias.
          build.onResolve({ filter: /^@\// }, (args) => {
            const rel = args.path.slice(2);
            return { path: path.join(SRC_ROOT, rel) };
          });
          // "server-only" is a no-op guard import; it has no CJS build
          // reachable from here, so stub it out.
          build.onResolve({ filter: /^server-only$/ }, () => ({
            path: "server-only-stub",
            namespace: "stub",
          }));
          build.onLoad({ filter: /^server-only-stub$/, namespace: "stub" }, () => ({
            contents: "",
            loader: "js",
          }));
        },
      },
    ],
  });

  const outFile = result.outputFiles[0];
  const mod = new Module(entryPath, module);
  mod.filename = entryPath;
  mod.paths = Module._nodeModulePaths(path.dirname(entryPath));
  mod._compile(outFile.text, entryPath);
  return mod.exports;
}

process.on("message", async (msg) => {
  const { rendererModulePath, exportName, props } = msg;
  try {
    const React = require("react");
    const { renderToBuffer } = require("@react-pdf/renderer");

    const entryPath = path.join(SRC_ROOT, rendererModulePath);
    const rendererMod = await loadRendererModule(entryPath);
    const Component = rendererMod[exportName];
    if (!Component) {
      throw new Error(`Export "${exportName}" not found in ${rendererModulePath}`);
    }

    const el = React.createElement(Component, props);
    const buffer = await renderToBuffer(el);
    process.send({ ok: true, base64: buffer.toString("base64") });
  } catch (err) {
    process.send({ ok: false, error: err && err.stack ? err.stack : String(err) });
  }
});
