/**
 * Renders the social sharing card to `src/app/opengraph-image.png`.
 *
 *   npm run og:build
 *
 * Next serves any `opengraph-image.png` next to a route and writes the meta
 * tags for it, so this produces a static asset with no runtime cost. The
 * alternative — generating it per request with next/og — means shipping a
 * font and running Satori on a crawler's request, for a picture that changes
 * about once a year.
 *
 * Playwright is already a development dependency for the smoke tests, and
 * rendering real HTML means the card is styled with CSS rather than by
 * fighting an image library. Re-run it whenever the wording or crest changes;
 * the generated PNG is committed.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "src/app/opengraph-image.png";

// Facebook, WhatsApp, LinkedIn, Slack and X all read 1200x630.
const WIDTH = 1200;
const HEIGHT = 630;

const BRAND = "#023223"; // green-900
const ACCENT = "#A0E7C6";
const CREAM = "#EBFAF2";

function card(logoDataUri: string): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${WIDTH}px; height: ${HEIGHT}px;
      display: flex; flex-direction: column; justify-content: center;
      padding: 84px;
      background:
        radial-gradient(1100px 520px at 88% -12%, #0a5c3f 0%, transparent 62%),
        ${BRAND};
      color: ${CREAM};
      font-family: "Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .row { display: flex; align-items: center; gap: 32px; }
    .crest {
      width: 132px; height: 132px; flex: none;
      border-radius: 26px; background: #ffffff;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 18px 50px rgba(0,0,0,.28);
    }
    .crest img { width: 108px; height: 108px; object-fit: contain; }
    h1 { font-size: 66px; line-height: 1.04; letter-spacing: -.022em; font-weight: 700; }
    .kicker {
      margin-top: 14px; font-size: 21px; font-weight: 600;
      letter-spacing: .22em; text-transform: uppercase; color: ${ACCENT};
    }
    p {
      margin-top: 40px; max-width: 900px;
      font-size: 29px; line-height: 1.45; color: #cfeee0;
    }
    .foot {
      margin-top: 52px; display: flex; align-items: center; gap: 18px;
      font-size: 23px; color: ${ACCENT};
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: ${ACCENT}; opacity: .65; }
  </style></head>
  <body>
    <div class="row">
      <div class="crest"><img src="${logoDataUri}" alt=""></div>
      <div>
        <h1>BCJ Healthy Living</h1>
        <div class="kicker">12-week challenge</div>
      </div>
    </div>
    <p>Twelve weeks of small daily habits, run by Bhatkal Community Jeddah.
       Fill in your day in under a minute and watch your score build.</p>
    <div class="foot"><span>health.bcjed.com</span><span class="dot"></span><span>bcjed.com</span></div>
  </body>
</html>`;
}

async function main() {
  const logo = readFileSync("public/logo.png").toString("base64");
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  await page.setContent(card(`data:image/png;base64,${logo}`), {
    waitUntil: "load",
  });
  const png = await page.screenshot({ type: "png" });
  await browser.close();

  writeFileSync(OUT, png);
  console.log(`${OUT} written — ${WIDTH}x${HEIGHT}, ${(png.length / 1024).toFixed(0)} kB`);
}

main();
