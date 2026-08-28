// Frees the ports the dev servers use:
//
//   npm run stop
//
// Ctrl+C is not enough on Windows. The chain is PowerShell -> npm ->
// concurrently -> nodemon -> node server.js, and the interrupt does not
// reliably reach the last of those. The orphan goes on holding port 3001, so
// the next `npm start` cannot bind it - and because the dev proxy keeps
// working against the survivor, the app looks fine while ignoring the server
// just started, TIME_TRAVEL and all.
//
// Only kills processes that are actually listening on these ports, and only
// node ones. Anything else holding a port is reported rather than killed -
// port 3000 is popular, and this should not be a tool that ends whatever it
// finds there.

const { execSync } = require("child_process");

const PORTS = [3000, 3001];
const isWindows = process.platform === "win32";

const run = (cmd) => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    // A tool that finds nothing exits non-zero. That is not a failure here.
    return "";
  }
};

// The pids listening on a port, deduplicated - a dual-stack listener shows up
// once for IPv4 and again for IPv6.
const listenersOn = (port) => {
  if (isWindows) {
    const rows = run("netstat -ano -p TCP").split("\n");
    const pids = rows
      .filter((line) => /LISTENING/.test(line) && new RegExp(`[:.]${port}\\s`).test(line))
      .map((line) => line.trim().split(/\s+/).pop())
      .filter((pid) => pid && pid !== "0");
    return [...new Set(pids)];
  }

  return [...new Set(run(`lsof -ti tcp:${port} -sTCP:LISTEN`).split("\n").filter(Boolean))];
};

const nameOf = (pid) => {
  if (isWindows) {
    const row = run(`tasklist /FI "PID eq ${pid}" /NH /FO CSV`).trim();
    const match = row.match(/^"([^"]+)"/);
    return match ? match[1] : "unknown";
  }
  return run(`ps -p ${pid} -o comm=`).trim() || "unknown";
};

const kill = (pid) =>
  run(isWindows ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`);

let killed = 0;
let skipped = 0;

for (const port of PORTS) {
  const pids = listenersOn(port);

  if (!pids.length) {
    console.log(`  port ${port}: nothing listening`);
    continue;
  }

  for (const pid of pids) {
    const name = nameOf(pid);

    if (!/^node(\.exe)?$/i.test(name)) {
      console.log(`  port ${port}: held by ${name} (pid ${pid}) - left alone`);
      skipped += 1;
      continue;
    }

    kill(pid);
    console.log(`  port ${port}: stopped ${name} (pid ${pid})`);
    killed += 1;
  }
}

console.log(
  `\n  ${killed} stopped` + (skipped ? `, ${skipped} left alone` : "") + "."
);

if (skipped) {
  console.log("  Something other than node is on a port - check before starting.");
}
