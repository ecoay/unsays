# unsays

**Things you can't unsay.** A fast multiplayer acronym game in the style of Acrophobia. Everyone gets the same letters and writes a line for the round's topic. Then everyone votes, and the round winner picks the next topic.

It runs entirely on Cloudflare:

- **Static client** (`public/`): one page with a WebGL background. `shared.js` holds the topics, letter weights and answer checking, and the server uses the same file.
- **Worker** (`src/worker.js`): routes `/ws/lobby` and `/api/*` to the lobby, `/ws/table/<id>` to that table, and everything else to the static files.
- **Lobby Durable Object** (`src/lobby.js`): table settings, the live table list pushed to lobby viewers, and table creation. Custom tables are removed after 10 minutes empty.
- **Table Durable Object** (`src/table.js`): one per room. It runs the clock, scoring, topic picks, face-off and bots, and sends each player their own view of the game. Bots fill seats up to 5 players and leave as people join. A disconnected player keeps their seat and score for 60 seconds. It also relays emoji and gifts, and writes ranked points to D1.
- **D1 database** (`src/db.js`): players, sessions, purchases, guilds, monthly scores, gifts and the Hall of Fame. The Worker creates the tables on first use.
- **Accounts** (`src/auth.js`): every player gets a guest account held by an HttpOnly cookie. Google or an email link (sent with Resend) attaches an identity so the account follows them to other devices. The Worker passes the signed-in player id to the Table and Lobby, so nobody can claim another player's account.
- **Store** (`src/stripe.js`, `public/catalog.js`): Stripe Checkout with prices sent inline from the catalog, and a signed webhook that unlocks packs, adds gifts and switches Guild Passes on and off.
- **Content pages** (`src/pages.js`, `public/site.css`): how to play, 16 topic pages, FAQ, leaderboards, Hall of Fame, Guild Pass, shop, privacy and terms, plus `robots.txt`, `sitemap.xml`, `llms.txt` and `llms-full.txt`. All carry canonical URLs, Open Graph tags and JSON-LD. Hosts other than `SITE_URL` (workers.dev, previews) are kept out of search.
- **Client extras** (`public/meta.js`): the profile, locker, store and guild sheet in the lobby.

## Money and leaderboards

- **Global leaderboard:** points from public tables count when at least 3 real people played the round (2 at a guild table). Bots never count. Boards reset monthly.
- **Hall of Fame:** at 00:10 UTC on the 1st, a cron trigger seals last month's top 3 players, top guild and most-gifted line, and gives champions a title. Opening `/hall-of-fame` does the same if the cron hasn't run.
- **Guild Pass** ($2.99 a month or $24 a year): the owner creates a guild, then subscribes. Active guilds get a members-only table in the lobby, a tag next to members' names, a guild board at `/g/<slug>` and no ads for the owner. Members join by invite link (`/join/<code>`).
- **Flair, emoji and gift packs:** one-time purchases from `public/catalog.js`. Emoji float over the table while people write and land on a line only after the votes are revealed. Gifts can be sent after the votes, to real players only.

## Launch setup

Each feature switches on when its keys exist, so the game keeps working with none of them. Add secrets in the Cloudflare dashboard under Workers & Pages, unsays, Settings, Variables and Secrets (type: Secret).

| What | Secrets | Where to get them |
| --- | --- | --- |
| Store | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe dashboard. Add a webhook endpoint at `https://unsays.com/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` and `charge.refunded`. Turn on the customer portal (Settings, Billing, Customer portal) so guild owners can cancel. |
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud console, OAuth client (Web). Authorized redirect URI: `https://unsays.com/auth/google/callback` (add the workers.dev one too if you test there). |
| Email sign-in | `RESEND_API_KEY` | resend.com. Verify the `unsays.com` domain so mail can come from `login@unsays.com` (change `EMAIL_FROM` in `wrangler.jsonc` otherwise). |

When sign-in is set up, buying needs a signed-in account so purchases follow the player. Without any sign-in method, purchases attach to the browser's guest account.

`SITE_URL`, `EMAIL_FROM` and `CONTACT_EMAIL` are plain variables in `wrangler.jsonc`. The D1 database is created on the first deploy. If the deploy log says it couldn't provision it, create a D1 database named `unsays` in the dashboard and add its `database_id` to `wrangler.jsonc`.

## Rules (from the design doc)

- Acronyms run 3, 4, 5, 6, 7 letters, then repeat.
- Turbo tables give 30s to write and 15s to vote. Classic tables give 60s and 20s. Six-letter rounds get 1.5x the writing time and seven-letter rounds get 2x (Classic: 90s and 120s).
- Each vote is worth 1 point. The winner earns 1 point per letter. The first answer to get a vote earns +2 for speed. Everyone who voted for the winner gets +1. A player who doesn't vote loses that round's points.
- The round winner picks the next topic in 5 seconds from 3 topics plus General. General is used if nobody picks, and topics don't repeat within 3 rounds.
- The first player to reach the target (30, or 15 on Sprint tables) sends the top two into a face-off of 3 rounds (3, 4 and 4 letters, General only).

## Develop

```sh
npm install
echo 'TIME_SCALE=0.15' > .dev.vars   # optional: shortens every phase for testing
# Add STRIPE_WEBHOOK_SECRET=whsec_test to .dev.vars to post signed test events to /api/stripe/webhook.
npm run dev                          # http://localhost:8787
npm test                             # unit tests
```

Open the page in two browsers, create a table, and use **Copy invite link** to join it from the other one.

## Deploy

Use either of these:

- **From GitHub (recommended):** in the Cloudflare dashboard, go to Workers & Pages, then Create, then Import a repository. Pick this repo and keep the default build settings (the deploy command is `npx wrangler deploy`). Every push to `main` deploys.
- **From your machine:** run `npx wrangler login`, then `npm run deploy`.

To use your domain, add `unsays.com` to Cloudflare, then add it under the Worker's Settings, Domains & Routes. If you also want `www.unsays.com`, add a Cloudflare Redirect Rule that sends it to `https://unsays.com`. Then submit `https://unsays.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools.

Durable Objects use the SQLite backend, which is available on the Workers free plan.
