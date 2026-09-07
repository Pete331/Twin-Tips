// Money, for the two pages that show it.
//
// Winnings and entries are stored in buy-in units rather than dollars - see the
// note on poolShare in services/leagueRounds.js. One entrant's stake is 1, so a
// pool of three paid to one winner is 3, and the buy-in turns it into an
// amount. Storing points keeps the division exact for as long as possible and
// stops today's buy-in being baked into history a later change could not
// correct.
//
// The consequence for a page is that every figure has to be multiplied before
// it is shown, and the home page's league lines were not: a league with a $10
// buy-in reported "won 3" for what is $30.

// A number with at most two decimal places, and no trailing ".00".
export const money = (amount) => {
  const value = Math.round((Number(amount) || 0) * 100) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

// The same figure with its dollar sign in front of it, and the minus in front
// of that.
//
// The balance column read "$-15". The "$" was literal text in the JSX and
// money() returned the minus with the number, so the sign landed between them -
// which is not how anyone writes a negative amount.
//
// The sign is taken from what money() actually produced rather than from the
// number passed in, so the symbol can never disagree with the digits beside it.
// It also means -0.004 prints as "$0" rather than "-$0": money rounds it to
// zero, and a sign is decided on the rounded value.
export const currency = (amount) => {
  const text = money(amount);
  return text.startsWith("-") ? `-$${text.slice(1)}` : `$${text}`;
};

// Buy-in units as an amount. Returns null where there is no buy-in to multiply
// by, so a caller can say nothing rather than print "$0" or "$NaN" - a season
// league has no pool and may carry no buy-in at all.
export const inDollars = (units, buyIn) => {
  if (!Number.isFinite(Number(buyIn))) return null;
  return currency(Number(units || 0) * Number(buyIn));
};
