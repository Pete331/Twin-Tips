# Brand build assets

`archivo-black.woff2` is the display face used by the wordmark. It is
embedded in `client/public/assets/logo.svg` as a data URI, which is a
redistribution, so the licence travels with it: Archivo Black is under the SIL
Open Font License 1.1 - see `OFL.txt`. That licence permits embedding and
redistribution provided the font is not sold on its own and the notice is kept.

The app icon needs no font: `scripts/buildIcons.js` draws its two T's from
rectangles, so the icon can be regenerated with nothing but Node.

    node scripts/buildIcons.js   # icon-512/256/192, apple-touch-icon, favicon.ico
    node scripts/buildLogo.js    # logo.svg
