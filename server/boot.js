// kodo - THE ENTRY THAT SPEAKS BEFORE IT CAN FAIL.
//
// an empty deploy log is the hardest fault there is to read: it cannot
// distinguish "the host ran the wrong command" from "the process crashed
// while loading" from "nothing was ever started". and it is easy to
// produce by accident, because ES modules hoist their imports — a line at
// the top of index.js still runs AFTER every module it imports has been
// evaluated, so an import that throws prints nothing of ours at all.
//
// this file imports nothing at module scope. it announces itself, installs
// handlers that make a quiet death impossible, and only then loads the
// service dynamically. if a deploy log is still empty after this, the
// process was never run and the fault is the host's start command — which
// is a different repair, and now a distinguishable one.

process.stdout.write(
  `[market] booting · node ${process.version} · pid ${process.pid} · cwd ${process.cwd()} · PORT=${process.env.PORT ?? "unset"}\n`
);

process.on("uncaughtException", (e) => {
  console.error("[market] uncaught exception:", e?.stack ?? e);
});
process.on("unhandledRejection", (e) => {
  console.error("[market] unhandled rejection:", e?.stack ?? e);
});
process.on("exit", (code) => {
  process.stdout.write(`[market] process exiting with code ${code}\n`);
});

try {
  await import("./index.js");
} catch (e) {
  console.error("[market] the service failed to load:", e?.stack ?? e);
  // STAY UP AND SAY WHY. exiting here hands the host a bare restart loop
  // and the operator another empty log; a process that holds the port and
  // answers /health with the reason can be diagnosed from outside.
  const { createServer } = await import("node:http");
  const port = Number(process.env.PORT ?? 8787);
  createServer((req, res) => {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, boot: "failed to load", error: String(e?.message ?? e) }));
  }).listen(port, "0.0.0.0", () =>
    console.error(`[market] holding :${port} to report the load failure`)
  );
}
