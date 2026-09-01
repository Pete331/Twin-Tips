// Formatting for displayed prices.
//
// Pure, and separate from the component, because these are the parts with a
// right answer that can be checked without rendering anything.

// $1.45, always two decimals.
//
// Decimal odds are money and read as money: a price stored as 1.4 is $1.40 on
// every bookmaker's own site, and "$1.4" looks like a bug. toFixed also keeps
// the column aligned, which is the other half of why prices are always written
// this way.
export const formatPrice = (price) => {
  if (!Number.isFinite(price)) return null;
  return `$${price.toFixed(2)}`;
};

// The line under the price, and the reason there is more than one number.
//
// An average across three bookmakers is a different claim from an average
// across eleven, and early in the week it is often three - so the count is
// stated rather than implied. The spread is there for the same reason: an
// average pulled about by one book that has not moved can be seen for what it
// is instead of guessed at.
export const priceDetail = (side) => {
  if (!side || !Number.isFinite(side.average)) return null;

  const parts = [`Average ${formatPrice(side.average)}`];

  if (Number.isFinite(side.count)) {
    parts.push(`across ${side.count} ${side.count === 1 ? "bookmaker" : "bookmakers"}`);
  }

  // Only when the books actually disagree. "Range $1.46 to $1.46" is noise.
  if (
    Number.isFinite(side.low) &&
    Number.isFinite(side.high) &&
    side.low !== side.high
  ) {
    parts.push(`(${formatPrice(side.low)} to ${formatPrice(side.high)})`);
  }

  return parts.join(" ");
};

// How stale a price is, in words.
//
// The cron polls between 8am and 10pm Melbourne time, so a price seen at
// breakfast can be ten hours old, and one seen in the off-season older still.
// Saying so is the difference between a number that is wrong and a number that
// is honestly out of date.
export const freshness = (fetchedAt, now = new Date()) => {
  if (!fetchedAt) return null;

  const at = new Date(fetchedAt);
  if (Number.isNaN(at.getTime())) return null;

  const minutes = Math.floor((now - at) / 60000);

  if (minutes < 0) return "just now";
  if (minutes < 90) return minutes < 2 ? "just now" : `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hours ago`;

  return `${Math.round(hours / 24)} days ago`;
};
