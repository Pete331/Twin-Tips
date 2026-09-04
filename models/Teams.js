const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const teamSchema = new Schema({
  // Squiggle's team id. Stable, and what fixtures join on - unlike abbrev,
  // which is a display string they are free to change.
  id: {
    type: Number,
  },
  name: {
    type: String,
  },
  // Picks the logo file in client/public/assets/team-logos. Squiggle changed
  // Gold Coast from GC to GCS at some point, which silently broke that logo,
  // so FixtureCard hides the image when the file is missing.
  abbrev: {
    type: String,
  },
  // Squiggle sends a path like "/wp-content/themes/squiggle/assets/images/
  // Adelaide.png". It is relative to squiggle.com.au, so rendering it resolves
  // against our own domain and 404s. Stored only because it arrives in their
  // payload; the app uses the local SVGs. Do not render this.
  logo: {
    type: String,
  },
  // Seasons the club was active - retirement is 9999 for current clubs. Worth
  // keeping now that historical seasons are stored, since a club that had not
  // debuted yet should not appear in an old season's ladder.
  debut: {
    type: Number,
  },
  retirement: {
    type: Number,
  },
});

// Every lookup is by Squiggle's id - the sync upserts on it, the fixture
// virtuals join on it, and a profile resolves a favourite team through it -
// and there was no index on it at all, so each of those scanned the collection.
//
// Eighteen documents makes that free today. It is here because the field is
// this collection's real key: leaving the only index on _id says otherwise,
// and it means the sync's eighteen upserts each scanned to find that out.
teamSchema.index({ id: 1 }, { unique: true });

const Team = mongoose.model("Team", teamSchema);

module.exports = Team;
