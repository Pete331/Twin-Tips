// The two halves of the ladder a tip is made from: one team from the top eight
// and one from the bottom ten.
//
// Their own colours, not the result tints in utils/resultTint. Those are green
// for a tip that came off or money ahead and red for one that did not or money
// owed - and the fixture cards used the same two for the halves, so every
// bottom-ten side sat on the colour of a wrong answer (UX audit finding #27). A
// side in the bottom ten has done nothing wrong; it is the half your bottom-ten
// tip comes from.
//
// Blue and amber, each as a pale tint for the card behind a team and a stronger
// accent for the edge beside the pick in the tip bar. The accents clear 3:1
// against white (4.9:1 and 3.6:1), the minimum for a mark that carries meaning;
// the tints stay behind the text at about 14:1, like the result tints.
//
// Never the only channel: the cards and the tip bar say "Top 8" and "Bottom 10"
// in words, which is where the label lives.
export const TOP_EIGHT = {
  label: "Top 8",
  tint: "#e6edf8",
  accent: "#3b6fc0",
};

export const BOTTOM_TEN = {
  label: "Bottom 10",
  tint: "#f8efdf",
  accent: "#b7791f",
};

// Which half a ladder position is in, or null where there is no position.
//
// Squiggle stops reporting ranks once the finals begin, and a finals side not
// yet decided has none. A plain `rank <= 8` put null in the top eight, since
// null compares as 0.
export const ladderHalf = (rank) =>
  !Number.isFinite(rank) || rank <= 0
    ? null
    : rank <= 8
      ? TOP_EIGHT
      : BOTTOM_TEN;
