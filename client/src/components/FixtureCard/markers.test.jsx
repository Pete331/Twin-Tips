// The two things a card says once there is nothing left to pick.
//
// Before the bounce this card is a form: two checkboxes, one per side. After
// it, the checkboxes go and what is left is a record - and it was a record
// missing both of the facts you would open it for. Who won was stated only in
// the centre panel, as an abbreviation ("BRI by 24") against full names on the
// cards either side of it, so reading a round meant matching one to the other
// nine times. And what you yourself had tipped was not on the page at all: the
// checkbox that held it disappeared at lockout, and the only way back to your
// own picks was the leaderboard's round view.
//
// So: weight on the winner, and "Your pick" on the side you took.
//
// It used to be a tick - "✓ Your tip" - and that was the trap. A tick is what a
// correct answer gets, so on a side three points up in the third quarter it
// read as "correct" with the game still on (UX audit finding #14). The pick is
// named in words alone now, and only the final siren adds a verdict: Correct,
// Wrong, or a draw's half a win.

import { describe, test, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { withTheme } from "../../testTheme";
import FixtureCard from "./index";

// A finished round-11 fixture. The page is showing round 11 while round 12 is
// the one being tipped, which is the ordinary way to look back at a result.
const card = (over = {}) => ({
  id: 101,
  venue: "Adelaide Oval",
  hteam: "Adelaide",
  ateam: "Melbourne",
  habrev: "ADEL",
  aabrev: "MELB",
  hteamrank: 3,
  ateamrank: 14,
  complete: 100,
  hscore: 95,
  ascore: 71,
  winner: "ADEL",
  date: "2026-06-06T09:20:00.000Z",
  round: 11,
  currentRound: 12,
  lockout: false,
  handleSelectionChange: () => {},
  ...over,
});

const draw = (over) => render(withTheme(<FixtureCard {...card(over)} />));

// The team's own name as it sits on its card.
//
// Reached through the logo's alt text to find the right card, then by the name
// as rendered text rather than by tag or position. Asking for the first span
// in the panel was the obvious way and the wrong one: it depends on nothing
// else ever rendering a span above it, so the day something does, this reads
// the weight of the wrong element and reports it as a pass.
const nameOn = (team) =>
  within(screen.getByAltText(team).closest(".MuiCardContent-root")).getByText(
    team
  );

const weightOf = (team) => getComputedStyle(nameOn(team)).fontWeight;

describe("the winning side", () => {
  test("is the one carrying the weight", () => {
    draw();

    expect(weightOf("Adelaide")).toBe("700");
    expect(weightOf("Melbourne")).toBe("400");
  });

  test("and it follows the score, not the winner prop", () => {
    // The prop is built as `winner === hteam ? home.abbrev : away.abbrev`, so
    // it names the away side whenever winner is empty - for a draw, and for
    // every game not yet played. Reading it here would have marked Melbourne.
    draw({ hscore: 71, ascore: 95, winner: "" });

    expect(weightOf("Melbourne")).toBe("700");
    expect(weightOf("Adelaide")).toBe("400");
  });

  // complete counts up through the game rather than flagging the end of it, so
  // a side ahead at three-quarter time is leading and not winning. The centre
  // panel marks that state with a star for the same reason.
  test("is nobody while the game is still on", () => {
    draw({ complete: 87, hscore: 74, ascore: 52 });

    expect(weightOf("Adelaide")).toBe("400");
    expect(weightOf("Melbourne")).toBe("400");
  });

  test("and nobody in a draw", () => {
    draw({ hscore: 80, ascore: 80 });

    expect(weightOf("Adelaide")).toBe("400");
    expect(weightOf("Melbourne")).toBe("400");
  });
});

describe("your own tip", () => {
  test("is marked on the side you took", () => {
    draw({ tippedTopEight: "Adelaide", tippedBottomTen: "Carlton" });

    const panel = screen
      .getByAltText("Adelaide")
      .closest(".MuiCardContent-root");
    expect(panel).toHaveTextContent("Your pick");

    const other = screen
      .getByAltText("Melbourne")
      .closest(".MuiCardContent-root");
    expect(other).not.toHaveTextContent("Your pick");
  });

  // Both groups against both sides, because the two have nothing to do with
  // each other: which side is at home comes from the draw, which group it falls
  // in comes from the ladder. Checking only the top-eight pick against the home
  // side passes for exactly as long as every home side is a top-eight one.
  test("on a bottom-ten pick just the same", () => {
    draw({ tippedTopEight: "Carlton", tippedBottomTen: "Melbourne" });

    expect(
      screen.getByAltText("Melbourne").closest(".MuiCardContent-root")
    ).toHaveTextContent("Your pick");
  });

  test("including a bottom-ten side playing at home", () => {
    draw({
      hteamrank: 14,
      ateamrank: 3,
      tippedTopEight: "Carlton",
      tippedBottomTen: "Adelaide",
    });

    expect(
      screen.getByAltText("Adelaide").closest(".MuiCardContent-root")
    ).toHaveTextContent("Your pick");
  });

  test("and a top-eight side playing away", () => {
    draw({
      hteamrank: 14,
      ateamrank: 3,
      tippedTopEight: "Melbourne",
      tippedBottomTen: "Carlton",
    });

    expect(
      screen.getByAltText("Melbourne").closest(".MuiCardContent-root")
    ).toHaveTextContent("Your pick");
  });

  test("and on neither side when you did not tip the game", () => {
    draw({ tippedTopEight: "Carlton", tippedBottomTen: "Essendon" });

    expect(screen.queryByText("Your pick")).not.toBeInTheDocument();
  });

  test("or when the round was never tipped at all", () => {
    draw({ tippedTopEight: undefined, tippedBottomTen: undefined });

    expect(screen.queryByText("Your pick")).not.toBeInTheDocument();
  });

  // A tick is what a correct answer gets, so the pick itself carries none.
  test("says so in words, with no tick on it", () => {
    draw({ tippedTopEight: "Adelaide" });

    const marker = screen.getByText("Your pick");
    expect(marker).toBeInTheDocument();
    expect(marker.querySelector("svg")).toBeNull();
  });

  // Before the bounce the checkbox already says this, and says it better,
  // because it is also the control that changes it. Two marks for one fact on
  // one card is one mark too many.
  test("stays off while the checkboxes are still there", () => {
    draw({
      round: 12,
      currentRound: 12,
      lockout: false,
      tippedTopEight: "Adelaide",
    });

    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.queryByText("Your pick")).not.toBeInTheDocument();
  });

  // The moment it starts mattering: the round you are tipping, once it has
  // bounced. The checkbox is gone and the tip is still yours to see.
  test("and appears on the current round once it locks out", () => {
    draw({
      round: 12,
      currentRound: 12,
      lockout: true,
      tippedTopEight: "Adelaide",
    });

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText("Your pick")).toBeInTheDocument();
  });
});

// Whether the pick came off - said at the final siren and not before.
describe("the verdict on your pick", () => {
  const panel = (team) =>
    screen.getByAltText(team).closest(".MuiCardContent-root");

  test("a pick that won is Correct", () => {
    draw({ tippedTopEight: "Adelaide" });

    expect(panel("Adelaide")).toHaveTextContent("Correct");
    expect(panel("Adelaide")).not.toHaveTextContent("Wrong");
  });

  test("a pick that lost is Wrong", () => {
    draw({ tippedBottomTen: "Melbourne" });

    expect(panel("Melbourne")).toHaveTextContent("Wrong");
    expect(panel("Melbourne")).not.toHaveTextContent("Correct");
  });

  // Away sides too: which card is which comes from the draw.
  test("an away pick that won is Correct", () => {
    draw({ hscore: 71, ascore: 95, tippedBottomTen: "Melbourne" });

    expect(panel("Melbourne")).toHaveTextContent("Correct");
  });

  test("a home pick that lost is Wrong", () => {
    draw({ hscore: 71, ascore: 95, tippedTopEight: "Adelaide" });

    expect(panel("Adelaide")).toHaveTextContent("Wrong");
  });

  // Scoring counts a drawn game as half a win to whoever picked either side.
  test("a drawn game is neither, and says it is worth half", () => {
    draw({ hscore: 80, ascore: 80, tippedTopEight: "Adelaide" });

    expect(panel("Adelaide")).toHaveTextContent("Draw · ½");
    expect(panel("Adelaide")).not.toHaveTextContent(/Correct|Wrong/);
  });

  // The finding: Carlton three points up in the third quarter read as correct.
  test("nothing while the game is on, however it stands", () => {
    draw({ complete: 70, hscore: 58, ascore: 55, tippedTopEight: "Adelaide" });

    expect(panel("Adelaide")).toHaveTextContent("Your pick");
    expect(panel("Adelaide")).not.toHaveTextContent(/Correct|Wrong|Draw/);
    expect(panel("Adelaide").querySelector("svg")).toBeNull();
  });

  test("or before it has started", () => {
    draw({ complete: 0, hscore: 0, ascore: 0, tippedTopEight: "Adelaide" });

    expect(panel("Adelaide")).not.toHaveTextContent(/Correct|Wrong|Draw/);
  });

  // The word is the label; the icon beside it is only for the glance.
  test("the verdict is a word, and its icon is hidden from screen readers", () => {
    draw({ tippedTopEight: "Adelaide", tippedBottomTen: "Melbourne" });

    const correct = within(panel("Adelaide")).getByText("Correct");
    expect(correct.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    const wrong = within(panel("Melbourne")).getByText("Wrong");
    expect(wrong.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  test("and it is on the side you picked only", () => {
    draw({ tippedTopEight: "Adelaide" });

    expect(panel("Melbourne")).not.toHaveTextContent(/Correct|Wrong/);
  });
});

// The number you put on it.
//
// One margin a round, not one a pick: typing into either field on the tips
// page clears the other, and POST /api/tips refuses a tip holding both. So one
// of the two cards carries a number and the other does not, and which one is
// itself worth seeing - it is the game the tiebreak is riding on.
describe("the margin", () => {
  test("shows on the pick carrying it", () => {
    draw({
      tippedTopEight: "Adelaide",
      tippedBottomTen: "Melbourne",
      tippedMarginTopEight: 24,
      tippedMarginBottomTen: 0,
    });

    const home = screen
      .getByAltText("Adelaide")
      .closest(".MuiCardContent-root");
    expect(home).toHaveTextContent("Margin 24");
  });

  // Both sides of one game is not a legal tip, so these are two separate
  // fixtures in life. Here it is one card, which is the cheapest way to assert
  // that the number lands on one side and not the other.
  test("and not on the pick that is not", () => {
    draw({
      tippedTopEight: "Adelaide",
      tippedBottomTen: "Melbourne",
      tippedMarginTopEight: 24,
      tippedMarginBottomTen: 0,
    });

    const away = screen
      .getByAltText("Melbourne")
      .closest(".MuiCardContent-root");
    expect(away).toHaveTextContent("Your pick");
    expect(away).not.toHaveTextContent("Margin");
  });

  test("on a bottom-ten pick just as readily", () => {
    draw({
      tippedTopEight: "Adelaide",
      tippedBottomTen: "Melbourne",
      tippedMarginTopEight: 0,
      tippedMarginBottomTen: 9,
    });

    expect(
      screen.getByAltText("Melbourne").closest(".MuiCardContent-root")
    ).toHaveTextContent("Margin 9");
    expect(
      screen.getByAltText("Adelaide").closest(".MuiCardContent-root")
    ).not.toHaveTextContent("Margin");
  });

  // Zero is how the page says "not this one" rather than a prediction of a
  // drawn game, which is why scoring tests it with > 0 rather than for
  // presence. A card showing "Margin 0" would be reporting a tip nobody made.
  test("treats zero as no margin rather than as a number", () => {
    draw({
      tippedTopEight: "Adelaide",
      tippedBottomTen: "Melbourne",
      tippedMarginTopEight: 0,
      tippedMarginBottomTen: 0,
    });

    expect(screen.queryByText(/Margin/)).not.toBeInTheDocument();
    // The tick still stands - the tip was made, it just has no margin on it.
    expect(screen.getAllByText("Your pick")).toHaveLength(2);
  });

  // Tips written before the server enforced one margin do carry both. Scoring
  // resolves that in services/results.js by counting the top-eight one, and
  // this has to agree with it - otherwise the page shows two margins where
  // scoring used one, and the one it highlights may not be the one that paid.
  test("counts the top-eight one when an old tip carries both", () => {
    draw({
      tippedTopEight: "Adelaide",
      tippedBottomTen: "Melbourne",
      tippedMarginTopEight: 24,
      tippedMarginBottomTen: 9,
    });

    expect(
      screen.getByAltText("Adelaide").closest(".MuiCardContent-root")
    ).toHaveTextContent("Margin 24");
    expect(
      screen.getByAltText("Melbourne").closest(".MuiCardContent-root")
    ).not.toHaveTextContent("Margin");
  });

  // The difference scoring stores is deliberately not shown. It is
  // `won ? |margin - predicted| : margin + predicted`, so on a losing pick it
  // adds the prediction rather than subtracting it - a tiebreak penalty, not a
  // measure of how close the guess was. Rendering it as "out by" would be
  // false on exactly the tips somebody most wants to go back over.
  test("and never reports how far out it was", () => {
    draw({
      hscore: 95,
      ascore: 71,
      tippedTopEight: "Adelaide",
      tippedMarginTopEight: 24,
      topEightDifference: 0,
    });

    expect(screen.queryByText(/out by/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/difference/i)).not.toBeInTheDocument();
  });
});
