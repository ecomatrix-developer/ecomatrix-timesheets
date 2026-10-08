import "server-only";
import { fork } from "node:child_process";
import path from "node:path";

/**
 * Next.js's dev/RSC server process substitutes its own internal React 19
 * canary for every `require("react")` call process-wide (not just inside
 * the webpack/RSC module graph) — this breaks @react-pdf/renderer, whose
 * bundled reconciler expects a React 18-shaped element and throws
 * "Minified React error #31" on literally any render, even a bare
 * `<Document><Page><Text>hello</Text></Page></Document>`.
 *
 * The only reliable escape is running the actual PDF render in a separate
 * Node child process that never loads next/React's RSC runtime, so
 * `require("react")` there resolves to the real react@18.3.1 from
 * node_modules. We serialize just the plain-data props across the process
 * boundary and let the child require the renderer module by name.
 */
export function renderPdfInChildProcess<TProps>(
  rendererModulePath: string,
  exportName: string,
  props: TProps
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(process.cwd(), "src", "lib", "pdf", "pdfWorker.cjs");
    const child = fork(workerPath, [], {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      execArgv: [],
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("PDF render child process timed out"));
    }, 30_000);

    child.once("message", (msg: { ok: boolean; base64?: string; error?: string }) => {
      clearTimeout(timeout);
      child.kill();
      if (msg.ok && msg.base64) {
        resolve(Buffer.from(msg.base64, "base64"));
      } else {
        reject(new Error(msg.error ?? "Unknown PDF render error"));
      }
    });

    child.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.send({ rendererModulePath, exportName, props });
  });
}
