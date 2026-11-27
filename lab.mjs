import http from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const base = "http://127.0.0.1:5186";
const automation = "http://127.0.0.1:19897/api";
const require = createRequire(import.meta.url);
const binaryName = process.platform === "win32" ? "evenhub-simulator.exe" : "evenhub-simulator";
const simulator = require.resolve(`@evenrealities/sim-${process.platform}-${process.arch}/bin/${binaryName}`);
const files = new Map([["/", [path.join(dir, "lab.html"), "text/html"]], ["/app/", [path.join(dir, "dist/index.html"), "text/html"]]]);
files.set("/wallet-ui.js", [path.join(dir, "wallet-ui.js"), "text/javascript"]);
const types={css:"text/css",js:"text/javascript",png:"image/png",woff2:"font/woff2",txt:"text/plain"};
let child;
const server = http.createServer(async (request, response) => {
  try {
    if (request.headers.host !== new URL(base).host) { response.writeHead(403).end(); return; }
    const route = new URL(request.url, base).pathname;
    const asset=route.match(/^\/app\/(assets|fonts)\/([\w-]+\.(css|js|png|woff2|txt))$/);
    const resource=files.get(route)??(asset&&[path.join(dir,"dist",asset[1],asset[2]),types[asset[3]]]);
    if (request.method === "GET" && resource) {
      const [file, type] = resource;
      response.writeHead(200, {"content-type": type + "; charset=utf-8", "cache-control":"no-store"}).end(await readFile(file));
      return;
    }
    if (request.method === "GET" && (route === "/frame" || route === "/phone-frame")) {
      const r = await fetch(automation + "/screenshot/"+(route==="/frame"?"glasses":"webview"), {signal: AbortSignal.timeout(10000)});
      if (!r.ok) throw Error("frame unavailable");
      response.writeHead(200, {"content-type":"image/png", "cache-control":"no-store"}).end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    const gesture={"/tap":"click","/prev":"up","/next":"down","/back":"double_click","/home":"long_press"}[route];
    if (request.method === "POST" && gesture && request.headers.origin === base && request.headers["x-lab"] === "tap") {
      const r = await fetch(automation + "/input", {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({action:gesture}), signal:AbortSignal.timeout(3000)});
      response.writeHead(r.ok ? 204 : 502).end(); return;
    }
    response.writeHead(404).end();
  } catch {
    response.writeHead(503).end("Simulator unavailable");
  }
});
const { createServer } = await import("node:net");
const probe = createServer();
await new Promise((resolve, reject) => probe.once("error", reject).listen(19897, "127.0.0.1", () => probe.close(resolve)));
server.listen(5186, "127.0.0.1", () => {
  child = spawn(simulator, [base + "/app/", "--automation-port", "19897"], {windowsHide:true, stdio:"ignore"});
  child.once("exit", () => server.close());
  console.log("G2 + R1 lab: " + base);
});
process.on("exit", () => child?.kill());
for (const sig of ["SIGINT","SIGTERM"]) process.on(sig, () => process.exit());
