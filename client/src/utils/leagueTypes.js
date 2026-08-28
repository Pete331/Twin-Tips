// The two ways a league can score, in the words members actually see.
//
// The stored values stay "weekly" and "season" - no member ever sees those,
// and renaming them would mean migrating every league document to change
// nothing on screen. Only the display names live here.
//
// Full names where someone meets the type cold: the create form, the league
// list, an invite. Short names inside a league, where the page has already
// told you which one you are looking at.
//
// "Round" is doing real work on the pool, and is not there for symmetry.
// Everywhere else in footy tipping a prize pool is a single season-long pot,
// funded by one entry fee paid up front and paid out at the end. Ours is
// refilled and emptied every round. Called just "Pool" it would read as the
// season kind, and quietly promise the wrong thing about money - which is the
// worst thing to be vague about in a league where people actually pay.
export const WEEKLY = "weekly";
export const SEASON = "season";

export const isPool = (type) => type === WEEKLY;

// For dropdowns, lists and anywhere the reader has no other clue.
export const typeName = (type) => (isPool(type) ? "Round Pool" : "Season Ladder");

// For inside a league, where the name above already carries the context.
export const typeShortName = (type) => (isPool(type) ? "Pool" : "Ladder");

// The mechanic spelled out. Since the round-by-round buy-in is the unusual
// part, this says it in full rather than gesturing at it - the name alone
// cannot stop someone assuming they pay once for the season.
// The amount is optional, because the create form asks for the type before it
// asks for the buy-in - and "$0 from everyone each round" is a worse thing to
// show while someone is still filling the form in than not naming a figure.
export const typeBlurb = (type, buyIn) => {
  if (!isPool(type)) {
    return "Points build across the season, ranked on correct tips then closest margin.";
  }
  return buyIn
    ? `$${buyIn} from everyone each round. Best tips that round split it.`
    : "Everyone pays in each round. Best tips that round split it.";
};
