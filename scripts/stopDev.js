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
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    // A tool that finds nothing exits non-zero. That is not a failure here.
    return "";
  }
};

// The pids listening on a port, from what Windows' netstat -ano prints:
// Proto, Local Address, Foreign Address, State, PID.
//
// Both address families. This used to ask for "-p TCP", which is IPv4 only,
// and Vite binds [::1] on Windows - so the script said "port 3000: nothing
// listening" while Vite was serving on it (review finding #23). Plain netstat
// -ano lists IPv6 as TCP too, with the address in brackets. Deduplicated,
// because a dual-stack listener appears once for each.
const listeningPids = (netstatOutput, port) => {
  const pids = String(netstatOutput)
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(
      ([proto, local, , state]) =>
        /^TCP$/i.test(proto || "") &&
        state === "LISTENING" &&
        Boolean(local) &&
        local.endsWith(`:${port}`)
    )
    .map((cols) => cols[cols.length - 1])
    .filter((pid) => pid && pid !== "0");
  return [...new Set(pids)];
};

const listenersOn = (port) => {
  if (isWindows) return listeningPids(run("netstat -ano"), port);

  return [
    ...new Set(
      run(`lsof -ti tcp:${port} -sTCP:LISTEN`).split("\n").filter(Boolean)
    ),
  ];
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

const main = () => {
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
        console.log(
          `  port ${port}: held by ${name} (pid ${pid}) - left alone`
        );
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
    console.log(
      "  Something other than node is on a port - check before starting."
    );
  }
};

// Run as `npm run stop`; required, as by its test, it only hands over the
// parsing.
if (require.main === module) main();

module.exports = { listeningPids };
