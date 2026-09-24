// A game postponed into a later week.
//
// The AFL moves a game and it keeps its round number: round 3's Essendon v
// Richmond is played the Tuesday after round 4. Every rule in getSeasonState
// that asks "has round 3 finished?" then answers no for ten days, and the
// review found what that does - the day before round 4 the app said "Round 3
// has started - selections are locked", and round 4 could not be tipped at all.
// That was scenario B17. The same game with no date yet (B18) happened to work.
//
// It was more than the one rule. The postponed game was also the next fixture
// on the calendar once round 4 finished, so the app would have pointed at
// round 3 again from Sunday night until the Tuesday siren - with round 5
// unable to be tipped. And the ladder gate measured "a day since round 3's
// last game" from the postponed game's new date, so it never gave up waiting.
//
// A game rescheduled to on or after the next round's first bounce has left its
// week, and belongs to the round for scoring only. Runs against its own
// database, which it creates and drops.

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const db = require("../models");
const season = require("./season");

const URI =
  process.env.SEASON_POSTPONED_TEST_URI ||
  "mongodb://localhost/twin-tips-test-seasonpostponed";
const YEAR = 2095;

// Thursday night and Saturday afternoon games, a week apart. Round 3's third
// game was Sunday; it is the one that moves.
const R = {
  2: ["2095-03-17T09:20:00Z", "2095-03-19T05:40:00Z"],
  3: ["2095-03-24T09:20:00Z", "2095-03-26T05:40:00Z"],
  4: ["2095-03-31T09:20:00Z", "2095-04-02T05:40:00Z"],
  5: ["2095-04-07T09:20:00Z", "2095-04-09T05:40:00Z"],
  6: ["2095-04-14T09:20:00Z", "2095-04-16T05:40:00Z"],
};
const MOVED_TO = new Date("2095-04-05T09:20:00Z"); // the Tuesday after round 4

const at = (iso) => new Date(iso);

test("a game postponed into a later week", async (t) => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
  } catch {
    t.skip("no local MongoDB listening");
    return;
  }
  assert.match(mongoose.connection.name, /test/);

  t.after(async () => {
    if (mongoose.connection.readyState !== 1) return;
    await mongoose.disconnect();
    const { MongoClient } = require("mongodb");
    const client = await MongoClient.connect(URI);
    await client.db().dropDatabase();
    await client.close();
  });

  let id = 950000;
  const fixture = (round, date, complete) => ({
    id: id++,
    year: YEAR,
    round,
    roundname: `Round ${round}`,
    is_final: 0,
    hteam: `Home ${id}`,
    ateam: `Away ${id}`,
    date,
    complete,
    ...(complete === 100
      ? { hscore: 90, ascore: 80, winner: `Home ${id}` }
      : {}),
  });

  const ladder = async (round, provisional = false) => {
    const rows = [];
    for (let rank = 1; rank <= 18; rank += 1) {
      rows.push({
        year: YEAR,
        round,
        id: rank,
        name: `Team ${rank}`,
        rank,
        provisional,
      });
    }
    await db.Standing.insertMany(rows);
  };

  // Rounds 2 and 3 played, apart from the postponed game; the rest to come.
  // `played` marks every game up to that round as finished.
  const seed = async ({
    moved = MOVED_TO,
    movedComplete = 0,
    played = 3,
  } = {}) => {
    await db.Fixture.deleteMany({ year: YEAR });
    await db.Standing.deleteMany({ year: YEAR });
    const rows = [];
    for (const [round, dates] of Object.entries(R)) {
      for (const iso of dates) {
        rows.push(
          fixture(Number(round), at(iso), Number(round) <= played ? 100 : 0)
        );
      }
    }
    rows.push(fixture(3, moved, movedComplete));
    await db.Fixture.insertMany(rows);
    await ladder(2);
    season.forgetFixtures();
  };

  const stateAt = (iso) => season.getSeasonState(YEAR, at(iso));

  // --- the week before round 4 ---------------------------------------------

  // The review's B17. What the sync now writes for a round like this: a
  // ladder taken once the games that were played are finished, marked
  // provisional because one is still to come.
  await t.test("the day before round 4, round 4 is open to tip", async () => {
    await seed();
    await ladder(3, true);

    const s = await stateAt("2095-03-30T12:00:00Z");

    assert.equal(s.currentRound, 4);
    assert.equal(s.lockout, false);
    assert.equal(s.tippingOpen, true);
    assert.equal(
      s.ladderProvisional,
      true,
      "with a word that the top 8 can still move"
    );
    assert.equal(s.message, null);
  });

  // The review's B18, which worked and has to keep working.
  await t.test("and the same with the game not yet rescheduled", async () => {
    await seed({ moved: null });
    await ladder(3, true);

    const s = await stateAt("2095-03-30T12:00:00Z");

    assert.equal(s.currentRound, 4);
    assert.equal(s.tippingOpen, true);
  });

  // The sync is behind and there is no round-3 ladder at all. The gate gives
  // up a day after round 3's last game - the last one actually played, not the
  // one that has not happened yet - and says the ladder is out of date.
  await t.test(
    "without a round-3 ladder, the wait still ends a day after the games played",
    async () => {
      await seed();

      const s = await stateAt("2095-03-30T12:00:00Z");

      assert.equal(s.ladderReady, true);
      assert.equal(s.tippingOpen, true);
      assert.equal(
        s.ladderStale,
        true,
        "judged on round 2's ladder, and it says so"
      );
    }
  );

  // --- after round 4 ---------------------------------------------------------

  // Round 4 is done and the postponed game is the next thing on the calendar.
  // It is not the next round.
  await t.test(
    "between round 4 and the postponed game, round 5 is open to tip",
    async () => {
      await seed({ played: 4 });
      await ladder(3, true);
      await ladder(4);

      const s = await stateAt("2095-04-04T00:00:00Z");

      assert.equal(s.currentRound, 5);
      assert.equal(s.lockout, false);
      assert.equal(s.tippingOpen, true);
    }
  );

  await t.test("and while the postponed game is being played", async () => {
    await seed({ played: 4, movedComplete: 40 });
    await ladder(3, true);
    await ladder(4);

    const s = await stateAt("2095-04-05T10:00:00Z");

    assert.equal(s.currentRound, 5);
    assert.equal(s.tippingOpen, true);
    assert.equal(s.roundStarted, false, "nothing in round 5 has bounced");
  });

  // --- what has not changed --------------------------------------------------

  // A game played late in its own week is still that round being played. Only
  // a game that has crossed into the next round's week has moved.
  await t.test(
    "a game moved to earlier in the week still holds its round",
    async () => {
      await seed({ moved: at("2095-03-29T09:20:00Z"), movedComplete: 40 });
      await ladder(3, true);

      const s = await stateAt("2095-03-29T10:00:00Z");

      assert.equal(s.currentRound, 3);
      assert.equal(s.lockout, true);
      assert.equal(s.tippingOpen, false);
    }
  );

  await t.test("round 4's own first bounce still locks it", async () => {
    await seed();
    await ladder(3, true);

    const s = await stateAt("2095-03-31T09:30:00Z");

    assert.equal(s.currentRound, 4);
    assert.equal(s.lockout, true);
    assert.equal(s.tippingOpen, false);
  });
});
