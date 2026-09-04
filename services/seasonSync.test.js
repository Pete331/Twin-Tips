const test = require("node:test");
const assert = require("node:assert");

const { completedRounds, settledRounds, fixtureDate } = require("./seasonSync");

const NOW = new Date("2026-05-10T00:00:00Z");
const hoursAgo = (n) => new Date(NOW.getTime() - n * 3600e3);
const hoursAhead = (n) => new Date(NOW.getTime() + n * 3600e3);

const game = (round, complete, date) => ({ round, complete, date });

// --- completedRounds -----------------------------------------------------

test("a round is complete when every game in it is", () => {
  const rounds = completedRounds([
    game(1, 100, hoursAgo(200)),
    game(1, 100, hoursAgo(198)),
    game(2, 100, hoursAgo(100)),
    game(2, 50, hoursAgo(98)),
  ]);
  assert.deepEqual(rounds, [1]);
});

// --- settledRounds -------------------------------------------------------
//
// The rule that closes the postponed-game hole: a round nobody is still
// waiting on can have its ladder taken, finished or not.

test("a finished round is settled and not provisional", () => {
  const { rounds, provisional } = settledRounds(
    [game(1, 100, hoursAgo(200)), game(1, 100, hoursAgo(198))],
    NOW
  );
  assert.deepEqual(rounds, [1]);
  assert.equal(provisional.has(1), false);
});

// The case this exists for. Eight games played, one postponed and long past
// its slot - the round will never complete, and waiting for it means every
// later round is judged on an older ladder.
test("a round with one game long overdue is settled, provisionally", () => {
  const { rounds, provisional } = settledRounds(
    [
      game(4, 100, hoursAgo(80)),
      game(4, 100, hoursAgo(78)),
      game(4, 0, hoursAgo(76)),
    ],
    NOW
  );
  assert.deepEqual(rounds, [4]);
  assert.equal(provisional.has(4), true);
});

// Inside the day, the game might still be played - a late finish, a delayed
// feed. Taking a ladder here would be jumping the gun.
test("a game only a few hours overdue is not settled yet", () => {
  const { rounds } = settledRounds(
    [game(4, 100, hoursAgo(6)), game(4, 0, hoursAgo(3))],
    NOW
  );
  assert.deepEqual(rounds, []);
});

test("the day is the boundary", () => {
  const justInside = settledRounds([game(4, 0, hoursAgo(23))], NOW);
  const justPast = settledRounds([game(4, 0, hoursAgo(25))], NOW);
  assert.deepEqual(justInside.rounds, []);
  assert.deepEqual(justPast.rounds, [4]);
});

// An upcoming round has unfinished games too. It is not stuck, it simply has
// not happened, and its ladder does not exist yet.
test("a round that has not started is not settled", () => {
  const { rounds } = settledRounds(
    [game(6, 0, hoursAhead(48)), game(6, 0, hoursAhead(50))],
    NOW
  );
  assert.deepEqual(rounds, []);
});

test("a round part way through is not settled", () => {
  const { rounds } = settledRounds(
    [game(5, 100, hoursAgo(2)), game(5, 0, hoursAhead(24))],
    NOW
  );
  assert.deepEqual(rounds, []);
});

// A fixture with no date at all - a finals game whose teams are undecided.
// It cannot be judged overdue, so the round it belongs to stays open.
test("a fixture with no date does not make a round settled", () => {
  const { rounds } = settledRounds(
    [game(7, 100, hoursAgo(80)), game(7, 0, null)],
    NOW
  );
  assert.deepEqual(rounds, []);
});

test("rounds come back in order", () => {
  const { rounds } = settledRounds(
    [game(3, 100, hoursAgo(300)), game(1, 100, hoursAgo(400)), game(2, 100, hoursAgo(350))],
    NOW
  );
  assert.deepEqual(rounds, [1, 2, 3]);
});

// --- fixtureDate ---------------------------------------------------------
//
// unixtime is the only unambiguous field Squiggle sends. The others are bare
// local strings, and casting those parses them in whatever zone the server
// happens to run in - two hours out in Perth, ten on a UTC host.

test("unixtime is the instant used", () => {
  const d = fixtureDate({ unixtime: 1772928600, date: "2026-03-05 19:30:00", tz: "+11:00" });
  assert.equal(d.toISOString(), new Date(1772928600 * 1000).toISOString());
});

test("without unixtime, the local time plus the venue offset", () => {
  const d = fixtureDate({ date: "2026-03-05 19:30:00", tz: "+11:00" });
  assert.equal(d.toISOString(), "2026-03-05T08:30:00.000Z");
});

test("neither available is null rather than a guess", () => {
  assert.equal(fixtureDate({ date: "2026-03-05 19:30:00" }), null);
  assert.equal(fixtureDate({}), null);
});
