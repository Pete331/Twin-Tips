// Which processes `npm run stop` finds listening on the dev ports.
//
// It asked netstat for IPv4 only, and Vite binds [::1] on Windows - so it
// reported "port 3000: nothing listening" while Vite was serving on it
// (review finding #23). The sample below is netstat -ano as Windows prints it,
// with a Vite on IPv6 and an API on both families.

const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("net");
const { execSync } = require("child_process");

const { listeningPids } = require("./stopDev");

const NETSTAT = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1144
  TCP    0.0.0.0:3001           0.0.0.0:0              LISTENING       5120
  TCP    127.0.0.1:3001         127.0.0.1:52011        ESTABLISHED     5120
  TCP    127.0.0.1:52011        127.0.0.1:3001         ESTABLISHED     9001
  TCP    [::]:3001              [::]:0                 LISTENING       5120
  TCP    [::1]:3000             [::]:0                 LISTENING       7777
  TCP    [::1]:30000            [::]:0                 LISTENING       4242
  UDP    0.0.0.0:3000           *:*                                    6666
`;

test("finds a listener on IPv6 only - Vite on Windows", () => {
  assert.deepEqual(listeningPids(NETSTAT, 3000), ["7777"]);
});

test("counts a dual-stack listener once", () => {
  assert.deepEqual(listeningPids(NETSTAT, 3001), ["5120"]);
});

// The client side of a connection to the port is not listening on it, and
// neither is a port that merely starts with the same digits, or UDP.
test("ignores connections, longer port numbers and UDP", () => {
  assert.equal(listeningPids(NETSTAT, 3000).includes("9001"), false);
  assert.equal(listeningPids(NETSTAT, 3000).includes("4242"), false);
  assert.equal(listeningPids(NETSTAT, 3000).includes("6666"), false);
});

test("nothing listening is an empty list", () => {
  assert.deepEqual(listeningPids(NETSTAT, 4000), []);
  assert.deepEqual(listeningPids("", 3000), []);
});

// And against the real netstat, where there is one: a server on [::1] only,
// the way Vite binds. Defined only on Windows rather than skipped elsewhere -
// CI runs on Linux and fails any run with a skipped test in it
// (scripts/test/failOnSkip.mjs).
if (process.platform === "win32") {
  test("finds a real IPv6-only listener", async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, "::1", resolve));
    try {
      const { port } = server.address();
      const pids = listeningPids(execSync("netstat -ano", { encoding: "utf8" }), port);
      assert.deepEqual(pids, [String(process.pid)]);
    } finally {
      server.close();
    }
  });
}
