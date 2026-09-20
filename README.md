# Nata Laundry — website

The landing site for natalaundry.az. Informational only: it shows the services
and explains the business. **Nothing is sold here** — orders happen in the
mobile app, and the footer says so in all three languages.

Vue 3 + Vite, three routes, no backend.

## Why this exists twice

The original site was lost with the machine it was written on. The deployed
build was still live, so this rebuild recovered its copy verbatim from the
served HTML rather than reinventing it — the landing page, the Terms and the
Privacy Policy are the same text the business already published.

**So: commit and push this repository somewhere off this machine.** That is the
one lesson the last loss paid for.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview  # serve the built dist/
```

## Deploying to Hostinger

The output is static files; there is no Node process to run.

1. `npm run build`
2. Open **hPanel → Files → File Manager**, go to `public_html`
3. Delete the old site's files
4. Upload **everything inside `dist/`** — the *contents*, not the folder itself.
   `index.html` has to land at `public_html/index.html`
5. Confirm `.htaccess` came across. File Manager hides dotfiles until you
   enable *Show hidden files*, and it is the file that makes `/privacy` work

FTP works too, if you prefer: hPanel → Files → FTP Accounts for the host and
username. Upload `dist/*` to `public_html/`.

### The `.htaccess` is not optional

`/privacy` and `/terms` are client-side routes. Without the rewrite rule,
Apache looks for files by those names, does not find them, and returns 404 —
and Google fetches the privacy URL **directly**, with no prior navigation, so
that 404 blocks the Play listing on its own. It also redirects the old
`/privacy.html` and `/terms.html` URLs so links already handed out keep working.

## DNS — an outstanding problem this site does not fix

```
natalaundry.az       A / AAAA / CNAME  ->  none   (NS at dns-parking.com)
www.natalaundry.az   resolves
```

The bare domain has no address record, which is exactly the "DNS name not
found" Google Play reported against `https://natalaundry.az/privacy`. Until an
`A` record is added for the apex pointing at the same host as `www`, **use the
`www` host in anything you hand to Google or Apple**:

```
https://www.natalaundry.az/privacy
```

`.htaccess` already redirects apex → www, so adding the record later changes
nothing else.

## Things to check before this goes live

- `src/site.js` → `playLive` is `false`. The Play listing has never been
  published, so the Android store URL 404s and the download button falls back
  to the App Store. Flip it to `true` the day the listing goes live.
- The recovered legal text names **Stripe** as the payment processor. The app
  uses Kapital. Carried over as-is rather than silently rewritten — it is legal
  copy, and correcting it is a business decision.
- The old policy gave `privacy@laundary.com` as the privacy contact, on a
  domain this business does not own. Changed to `info@natalaundry.az`: a
  privacy contact that cannot receive mail is a compliance problem by itself.
- Terms referred to a **CleanPass** subscription. The app calls it Nata Plus.
  Neutralised to "subscription" here; decide which name is real.
- `public/loader.mp4` is a generated clip. Deleting it is supported — the SVG
  mark underneath is a complete animation, not a placeholder.

## Layout

```
public/          .htaccess, robots, sitemap, favicons, loader.mp4
src/
  content/       az.js · ru.js · en.js — all copy, AZ is the source of truth
  components/    LogoMark, Preloader, SiteHeader, SiteFooter, LangSwitch,
                 Icon, LegalPage
  views/         Home, Terms, Privacy
  styles/base.css   design tokens, carried from the app's theme/tokens.ts
  i18n.js        three dictionaries and a ref; no library
  reveal.js      v-reveal scroll animation
  site.js        phone, e-mail, store links — one source for all of them
```

## Two things that will look like bugs later

**Inter is load-bearing.** Plus Jakarta Sans is the app's typeface and covers
the full Azerbaijani alphabet, but it carries **no Cyrillic at all**. CSS does
not fall back per glyph the way iOS and Android do, so with a bare family name
the Russian copy drops to the default *serif* — which is exactly how the app's
price list once shipped set in Times. Inter is in the stack to catch those
glyphs. Do not remove it.

**Scroll reveals hide in JS, never in CSS.** `reveal.js` applies the hidden
class itself, so if the script never runs nothing was ever hidden and the page
reads normally. Declaring `opacity: 0` in the stylesheet is how this pattern
ships a blank page to the one visitor whose browser did not cooperate. The
observer also reveals anything that was scrolled *past* — a fast wheel jump can
carry an element from below the viewport to above it between two frames without
ever firing `isIntersecting`, and those elements stay invisible forever. That
bug was in the first build of this site and is what the `passed` check fixes.
