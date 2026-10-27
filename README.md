# unsays

**Things you can't unsay.** A fast multiplayer acronym game in the style of Acrophobia. Everyone gets the same letters and writes a line for the round's topic. Then everyone votes, and the round winner picks the next topic.

It runs entirely on Cloudflare:

- **Static client** (`public/`): one page with a WebGL background. `shared.js` holds the topics, letter weights and answer checking, and the server uses the same file.
- **Worker** (`src/worker.js`): routes `/ws/lobby` and `/api/*` to the lobby, `/ws/table/<id>` to that table, and everything else to the static files.
- **Lobby Durable Object** (`src/lobby.js`): table settings, the live table list pushed to lobby viewers, and table creation. Custom tables are removed after 10 minutes empty.
- **Table Durable Object** (`src/table.js`): one per room. It runs the clock, scoring, topic picks, face-off and bots, and sends each player their own view of the game. Bots fill seats up to 5 players and leave as people join. A disconnected player keeps their seat and score for 60 seconds.

## Rules (from the design doc)

- Acronyms run 3, 4, 5, 6, 7 letters, then repeat.
- Turbo tables give 30s to write and 15s to vote. Classic tables give 60s and 20s. Six-letter rounds get 1.5x the writing time and seven-letter rounds get 2x (Classic: 90s and 120s).
- Each vote is worth 1 point. The winner earns 1 point per letter. The first answer to get a vote earns +2 for speed. Everyone who voted for the winner gets +1. A player who doesn't vote loses that round's points.
- The round winner picks the next topic in 5 seconds from 3 topics plus General. General is used if nobody picks, and topics don't repeat within 3 rounds.
- The first player to reach the target (30, or 15 on Sprint tables) sends the top two into a face-off of 3 rounds (3, 4 and 5 letters, General only).

## Develop

```sh
npm install
echo 'TIME_SCALE=0.15' > .dev.vars   # optional: shortens every phase for testing
npm run dev                          # http://localhost:8787
```

Open the page in two browsers, create a table, and use **Copy invite link** to join it from the other one.

## Deploy

Use either of these:

- **From GitHub (recommended):** in the Cloudflare dashboard, go to Workers & Pages, then Create, then Import a repository. Pick this repo and keep the default build settings (the deploy command is `npx wrangler deploy`). Every push to `main` deploys.
- **From your machine:** run `npx wrangler login`, then `npm run deploy`.

To use your domain, add `unsays.com` to Cloudflare, then add it under the Worker's Settings, Domains & Routes.

Durable Objects use the SQLite backend, which is available on the Workers free plan.
