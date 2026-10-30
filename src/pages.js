import { GENERAL, TOPICS, PACKS as TOPIC_PACKS, clean } from '../public/shared.js';
import { PACKS, GUILD_PASS, GIFTS, EMOJI_FREE, DROP, money } from '../public/catalog.js';
import { logoImg } from '../public/guild-logo.js';
import { monthKey, monthLabel, prevMonth, archiveMonth, topPlayers, topGuilds, topGifted, guildBoard, hall, guildActive } from './db.js';

// Server-rendered pages for search engines and answer engines: how to play, topics, FAQ,
// leaderboards, Hall of Fame, Guild Pass and the store. The game itself stays at /.

export const canonicalHost = env => new URL(env.SITE_URL || 'https://unsays.com').hostname;
const site = env => (env.SITE_URL || 'https://unsays.com').replace(/\/$/, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = s => esc(clean(String(s || 'guest'), 'clean'));
const ld = obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const ALL_TOPICS = [GENERAL, ...TOPICS];
export const topicTitle = t => t.id === 'general' ? "Things you can't unsay" : `${t.pre.replace(/:$/, '')} ${t.subj}`;
const topicSlug = t => t.id;

// Example lines for each topic. The acronym is read off the line, so it always matches.
const EXAMPLES = {
  general: ['I licked it first', 'My browser history is art', "Pretty sure that's legal"],
  ex: ['Still have your Netflix', 'Your mom texts me', 'Kept the hoodie, obviously'],
  partner: ['Your mom cooks better', 'I googled divorce lawyers', 'Snoring? That was me'],
  mil: ["Linda, the gravy's dry", 'Your son cries a lot', 'Store-bought, every time'],
  boss: ['Bonus or I quit', 'Muted you on Zoom', 'Slack is my diary'],
  sports: ['Referee needs glasses, badly', 'Coach cried at halftime', 'Benched for snacking'],
  disney: ['Mickey owes me money', 'Elsa never let go', "Simba's uncle had points"],
  date: ['My therapist says hi', 'Venmo me half', 'Mom picked this restaurant'],
  kids: ['Santa is unemployed now', 'Dad picked your name', 'Homework? Do it yourself'],
  hr: ['Intern started the rumor', 'That policy is optional', 'Who reads the handbook'],
  cop: ['Fast is my brand', 'License? Never heard of it', 'Check the trunk later'],
  airport: ['This snow globe is sentimental', 'My shampoo has feelings', 'Knives? Only emotionally'],
  therapist: ["Mom says you're wrong", 'I made everything up', 'My dream had you'],
  doctor: ['WebMD disagrees with you', "It's itchy in places", "Google says I'm dying"],
  plane: ['Armrest is mine now', 'My feet need air', 'Parachute? Just in case'],
  weddings: ['Open bar was the vow', 'The cake tasted like regret', 'My ex catered'],
};
const acroOf = line => line.split(/\s+/).map(w => (w.match(/[a-z]/i) || [''])[0].toUpperCase()).join('');

export const FAQ = [
  ['What is Unsay?', 'Unsay is a free multiplayer party game you play in your browser. Everyone at the table gets the same random letters, like B-O-I-Q, and writes a phrase whose words start with those letters. Then everyone votes for the funniest line. The tagline is "Things you can\'t unsay": every round has a topic, such as things you can\'t say to your boss.'],
  ['How do you play Unsay?', 'Pick a name, join a table and write a line that fits the letters before the clock runs out. Each word has to start with the next letter, in order. When time is up, every line is shown without names and you vote for your favorite. The round winner picks the next topic, and the first player to 30 points goes to a three-round face-off for the win.'],
  ['Is Unsay free?', 'Yes. Every public table, private invite tables, the global leaderboard and the Hall of Fame are free. Optional purchases are the Guild Pass ($2.99 a month), flair packs, emoji packs and gift packs. None of them add points or votes.'],
  ['Is Unsay like Acrophobia?', 'Yes. Unsay is a modern take on Acrophobia, the acronym game from the late 1990s that people played on Mplayer and IRC. It keeps the core loop of write, vote and score, and adds topics, a face-off final, guilds and monthly leaderboards.'],
  ['How many people can play?', 'Up to 14 people can sit at a table. If fewer than 5 people are there, bots fill the empty seats so a game can always start, and they leave as real people join.'],
  ['How does scoring work?', 'Each vote your line gets is worth 1 point. The round winner gets a bonus of 1 point per letter. The first line to get a vote earns 2 extra points for speed, and everyone who voted for the winner gets 1 point. If you don\'t vote, you lose that round\'s points.'],
  ['How long is a game of Unsay?', 'A Turbo game to 30 points usually takes 10 to 15 minutes. Turbo rounds give 30 seconds to write and 15 to vote, Classic rounds give 60 and 20, and 6- and 7-letter rounds get extra time. Sprint tables play to 15 for a shorter game.'],
  ['Can I play Unsay with friends privately?', 'Yes. Choose Create table in the lobby, then send your friends the invite link. Your table waits in a waiting room until you press Start, and you can turn bots off.'],
  ['Is Unsay family friendly?', 'Tables marked Keep it clean blur common swear words in lines and chat. Tables marked Adult language don\'t. The game is meant for players 13 and older, and Adult tables for players 18 and older.'],
  ['Do I need an account or a download?', 'No download is needed, and it works on phones, tablets and computers. You can play as a guest right away. Signing in with Google or an email link keeps your points, purchases and guild on every device.'],
  ['What is the Unsay Guild Pass?', 'The Guild Pass costs $2.99 a month (or $24 a year). It gives your crew its own members-only 14-seat table in the lobby, a guild leaderboard with its own Hall of Fame, a guild tag next to every member\'s name, and no ads for the owner.'],
  ['How does the Unsay leaderboard work?', 'Points from public tables count on the global leaderboard when at least 3 real people played the round. Bots never count. Every board resets on the 1st of the month, and that month\'s top 3 players, top guild and most-gifted line go into the Hall of Fame for good, with a free champion title.'],
  ['What are flair, emoji and gift packs?', 'Flair packs change how your name and wins look: name styles, win animations, vote-reveal effects and titles. Emoji packs add reactions that float over the table. Gifts let you reward a line you loved after the votes are in. They are all cosmetic and never change the score.'],
  ['What is the Unsay gift drop?', 'The monthly gift drop costs $2.99 and adds 2 gifts to your account every day for 30 days, the cheapest way to get gifts. Each day\'s gifts arrive when you open the game, and a day you miss isn\'t carried over. Buying another adds 30 more days.'],
  ['How do daily check-ins work in Unsay?', 'Open the Daily tab once a day and check in for free gifts. Every day in a row adds to your streak: you get 1 gift a day in the first week, up to 4 a day later on, plus 3 extra every 7th day. Streaks of 3, 7, 30, 60, 100 and 365 days win titles like "Regular" and "No Life", and 14 days wins the Graffiti name style. Miss a day and the streak starts over, but you keep everything you won.'],
  ['What are friend streaks?', 'Finish a game at the same table as someone and you start a 🔥 streak with them. Play together again the next day to keep it going. A 7-day streak wins both of you the "Ride or Die" title, 30 days wins "Joined at the Hip" and 100 days wins "Partners in Crime".'],
  ['What is the Unsay Gift Exchange?', 'Gifts other players send to your lines are banked as received gifts. Spend them in the Gift Exchange on flair and emoji packs, or on titles and emoji you can only get there, like "The Gifted" and "They Love Me". Gifts you bought can\'t be exchanged, and gifts can\'t be traded between players.'],
];

const HOWTO = [
  ['Pick a name and a table', 'Enter a name, then use Quick join or pick a table from the lobby. Bots fill empty seats so you never wait.'],
  ['Read the topic and the letters', 'Every round shows a topic, like "Things you can\'t say to your boss", and 3 to 7 letters.'],
  ['Write your line', 'Type a phrase where each word starts with the next letter. Press Enter to lock it in. You can edit until time runs out.'],
  ['Vote for the best line', 'Lines are shown without names. Tap your favorite. You can\'t vote for your own, and skipping the vote costs you the round\'s points.'],
  ['Score and pick the next topic', 'Votes, the win bonus and the speed bonus are added up. The round winner picks the next topic from three choices or General.'],
  ['Win the face-off', 'The first player to 30 points (15 on Sprint tables) and the runner-up play three quick rounds. Whoever gets more votes wins the game.'],
];

/* ---------- layout ---------- */

const NAV = [['/how-to-play', 'How to play'], ['/topics', 'Topics'], ['/leaderboard', 'Leaderboard'], ['/hall-of-fame', 'Hall of Fame'], ['/guild-pass', 'Guild Pass'], ['/shop', 'Shop'], ['/faq', 'FAQ']];
const FOOTER_LINKS = [['/about', 'About'], ['/contact', 'Contact'], ['/privacy', 'Privacy'], ['/terms', 'Terms']];

function layout(env, { path, title, description, body, schema = [], noindex = false, status = 200, ogType = 'website' }) {
  const url = site(env) + path;
  const og = site(env) + '/og.png';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta name="google-adsense-account" content="ca-pub-8081136929405133">
<meta property="og:site_name" content="Unsay">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Unsay: things you can't unsay">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${og}">
<meta name="theme-color" content="#06050d">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;800&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;600&display=swap">
<link rel="stylesheet" href="/site.css">
${schema.map(ld).join('\n')}
</head>
<body>
<div class="wrap">
<header class="top">
  <a class="brand" href="/">Unsay<span>.</span></a>
  <nav aria-label="Site">${NAV.map(([h, l]) => `<a href="${h}"${path === h || (h !== '/' && path.startsWith(h + '/')) ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
  <a class="btn prime small" href="/">Play free</a>
</header>
<main>
${body}
</main>
<footer>
  <nav aria-label="More">${NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}${FOOTER_LINKS.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav>
  <p>Unsay is a free multiplayer acronym party game in your browser. Things you can't unsay. Contact: <a href="/contact">Contact us</a> or <a href="mailto:${esc(env.CONTACT_EMAIL || 'hello@unsays.com')}">${esc(env.CONTACT_EMAIL || 'hello@unsays.com')}</a></p>
</footer>
</div>
</body>
</html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': noindex ? 'no-store' : 'public, max-age=300' } });
}

const crumbs = (env, items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: site(env) + path })),
});
const faqSchema = items => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});
export const gameSchema = env => ({
  '@context': 'https://schema.org', '@type': 'VideoGame', name: 'Unsay', url: site(env) + '/',
  description: 'A free multiplayer acronym party game in the style of Acrophobia. Everyone gets the same letters, writes the line they can\'t unsay, and votes for the funniest.',
  genre: ['Party game', 'Word game'], gamePlatform: 'Web browser', applicationCategory: 'Game', operatingSystem: 'Any',
  playMode: 'MultiPlayer', numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 14 }, image: site(env) + '/og.png',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
});

const tiles = acro => `<div class="tiles" aria-label="Letters ${acro.split('').join(' ')}">${acro.split('').map(L => `<span class="tile">${L}</span>`).join('')}</div>`;
const orb = h => `<span class="orb" style="--h:${(h | 0) % 360}"></span>`;
const tag = t => t ? `<span class="gtag">[${esc(t)}]</span>` : '';

/* ---------- pages ---------- */

function howToPlay(env) {
  return layout(env, {
    path: '/how-to-play', title: 'How to Play Unsay: Rules, Timers, Scoring',
    description: 'Unsay rules: 3 to 7 letter acronyms, 30 or 60 second rounds, blind voting, +1 per vote, winner picks the topic, first to 30 starts the face-off.',
    schema: [
      { '@context': 'https://schema.org', '@type': 'HowTo', name: 'How to play Unsay', totalTime: 'PT15M', step: HOWTO.map(([name, text], i) => ({ '@type': 'HowToStep', position: i + 1, name, text })) },
      faqSchema(FAQ.filter(([q]) => /scoring|long|many/i.test(q))), crumbs(env, [['Unsay', '/'], ['How to play', '/how-to-play']]),
    ],
    body: `<section class="hero"><span class="label">Rules</span><h1>How to play <span class="holo">Unsay</span></h1>
      <p class="lede"><b>Everyone gets the same letters. You write a line whose words start with those letters, in order.</b> Then everyone votes for the funniest one, and the winner picks the next topic.</p>
      <div class="card ex"><span class="label">Example · Things you can't say to your boss</span>${tiles('BOIQ')}<q>Bonus or I quit</q></div></section>
    <section><h2>Step by step</h2><ol class="steps">${HOWTO.map(([n, t]) => `<li><b>${esc(n)}.</b> ${esc(t)}</li>`).join('')}</ol></section>
    <section><h2>Scoring</h2><ul class="list">
      <li><b>1 point per vote</b> your line gets.</li>
      <li><b>Win bonus:</b> the round winner gets 1 point per letter, so a 7-letter win is worth 7.</li>
      <li><b>Speed bonus:</b> the first line to get at least one vote earns +2.</li>
      <li><b>Good taste:</b> everyone who voted for the winning line gets +1.</li>
      <li><b>No vote, no points.</b> If you skip the vote, you lose what you scored that round.</li></ul></section>
    <section><h2>Rounds and timing</h2><ul class="list">
      <li>Acronyms run 3, 4, 5, 6 and 7 letters, then repeat.</li>
      <li><b>Turbo</b> tables give 30 seconds to write and 15 to vote. <b>Classic</b> tables give 60 and 20.</li>
      <li>6-letter rounds get 1.5 times the writing time and 7-letter rounds get double.</li>
      <li>The first player to 30 points (15 on Sprint tables) and the runner-up play a 3-round face-off on General. Only the other players vote.</li></ul></section>
    <section><h2>Tips from the tables</h2><ul class="list">
      <li>Short punchy words beat long clever ones. People vote fast.</li>
      <li>Topics are a suggestion. If a fart joke fits the letters, the table will probably vote for it.</li>
      <li>Lock in early for the speed bonus, then keep editing. You keep your original time.</li>
      <li>Vote every round. A skipped vote can cost more than a lost round.</li></ul></section>
    <section class="cta"><a class="btn prime" href="/">Play now, free</a><a class="btn" href="/topics">See all topics</a><a class="btn" href="/faq">FAQ</a></section>`,
  });
}

function topicsIndex(env) {
  const groups = Object.entries(TOPIC_PACKS).filter(([k]) => k !== 'all');
  return layout(env, {
    path: '/topics', title: 'Unsay topics: 15 things you can\'t unsay, plus General',
    description: 'Every Unsay round has a topic, from things you can\'t say to your boss or your ex to Disney and sports. See all 16 topics with example lines.',
    schema: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Unsay topics', itemListElement: ALL_TOPICS.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: topicTitle(t), url: `${site(env)}/topics/${topicSlug(t)}` })) },
      crumbs(env, [['Unsay', '/'], ['Topics', '/topics']])],
    body: `<section class="hero"><span class="label">Topics</span><h1>Things you <span class="holo">can't unsay</span></h1>
      <p class="lede">Each round has a topic. The round winner picks the next one from three choices or General, and General comes up most often. There are <b>15 topics plus General</b>.</p></section>
      <section><h2>General</h2><div class="grid">${topicCard(GENERAL)}</div></section>
      ${groups.map(([k, label]) => `<section><h2>${esc(label)}</h2><div class="grid">${TOPICS.filter(t => t.pack === k).map(topicCard).join('')}</div></section>`).join('')}
      <section class="cta"><a class="btn prime" href="/">Play a round</a></section>`,
  });
}
function topicCard(t) {
  const ex = EXAMPLES[t.id][0];
  return `<article class="card"><a class="stretch" href="/topics/${topicSlug(t)}"><h3>${esc(topicTitle(t))}</h3></a><span class="muted">${esc(acroOf(ex))}: “${esc(ex)}”</span></article>`;
}

function topicPage(env, t) {
  const title = topicTitle(t);
  const exs = EXAMPLES[t.id];
  const pack = t.id === 'general' ? 'every table' : `${TOPIC_PACKS[t.pack]} tables and tables with all topics`;
  const others = ALL_TOPICS.filter(x => x.id !== t.id).slice(0, 15);
  const words = t.w ? t.w.split(' ').slice(0, 12) : [];
  const desc = `Play "${title}" in Unsay, the free multiplayer acronym game. See example lines, how the topic works, and jump into a table.`;
  return layout(env, {
    path: `/topics/${topicSlug(t)}`, title: `${title}: Unsay topic and example lines`, description: desc,
    schema: [crumbs(env, [['Unsay', '/'], ['Topics', '/topics'], [title, `/topics/${topicSlug(t)}`]]),
      faqSchema([[`How does the "${title}" topic work in Unsay?`, `When "${title}" comes up, everyone gets the same letters and writes a line for it, with each word starting with the next letter. It shows up on ${pack}. The round winner chooses it from three topics or General.`]])],
    body: `<nav class="crumbs" aria-label="Breadcrumb"><a href="/topics">Topics</a> / ${esc(t.subj)}</nav>
      <section class="hero"><span class="label">${t.id === 'general' ? 'The default topic' : esc(TOPIC_PACKS[t.pack])}</span><h1>${t.id === 'general' ? 'Things you <span class="holo">can\'t unsay</span>' : `${esc(t.pre.replace(/:$/, ''))} <span class="holo">${esc(t.subj)}</span>`}</h1>
      <p class="lede">${t.id === 'general'
        ? 'General is the topic when nobody picks, and it comes up more than any other. <b>Anything regrettable that fits the letters counts.</b>'
        : `When this topic comes up, <b>write the line you'd never say ${t.style === 'aud' ? 'to ' + esc(t.subj) : 'about ' + esc(t.subj)}</b>, using the round's letters in order.`}</p></section>
      <section><h2>Example lines</h2><div class="grid">${exs.map(l => `<div class="card ex">${tiles(acroOf(l))}<q>${esc(l)}</q></div>`).join('')}</div></section>
      <section><h2>How it works</h2><p>Everyone at the table gets the same 3 to 7 letters. You have 30 seconds on Turbo tables (60 on Classic) to write a line where each word starts with the next letter. Then the lines are shown without names, everyone votes, and the winner picks the next topic. ${t.id === 'general' ? 'General is always one of the choices, and it\'s used whenever the winner doesn\'t pick in time.' : `This topic appears on ${esc(pack)}, and it won't come up again for 3 rounds after it's played.`}</p>
      ${words.length ? `<p class="muted">Words the bots like for this topic: ${words.map(esc).join(', ')}.</p>` : ''}</section>
      <section class="cta"><a class="btn prime" href="/">Play now</a><a class="btn" href="/how-to-play">Full rules</a></section>
      <section><h2>More topics</h2><div class="chips">${others.map(o => `<a class="chip" href="/topics/${topicSlug(o)}">${esc(o.subj)}</a>`).join('')}</div></section>`,
  });
}

function faqPage(env) {
  return layout(env, {
    path: '/faq', title: 'Unsay FAQ: Games Like Acrophobia, Answered',
    description: 'Is Unsay free? How many can play? Can you vote for yourself? Answers about the Acrophobia-style acronym game, Clean vs Adult tables and the Guild Pass.',
    schema: [faqSchema(FAQ), crumbs(env, [['Unsay', '/'], ['FAQ', '/faq']])],
    body: `<section class="hero"><span class="label">FAQ</span><h1>Questions, <span class="holo">answered</span></h1></section>
      <section>${FAQ.map(([q, a], i) => `<details${i < 3 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
      <section class="cta"><a class="btn prime" href="/">Play free</a><a class="btn" href="/how-to-play">How to play</a></section>`,
  });
}

function about(env) {
  return layout(env, {
    path: '/about', title: 'About Unsay: Why We Rebuilt Acrophobia',
    description: 'Unsay is a free multiplayer acronym game from Tenacié LLC, built to bring back the write-a-line-and-vote fun of the 90s classic. No paid wins.',
    schema: [crumbs(env, [['Unsay', '/'], ['About', '/about']])],
    body: `<section class="hero"><span class="label">About</span><h1>About <span class="holo">Unsay</span></h1>
      <p class="lede">Unsay is a free multiplayer acronym game from Tenacié LLC. It exists because Acrophobia, the late-90s game where a room full of strangers turned random letters into phrases and voted on the best, basically disappeared. Nothing since has scratched the same itch.</p></section>
      <section><h2>The longer version</h2>
      <p>You know the laugh you get when somebody takes three random letters and turns them into a sentence that should not exist? Not a joke printed on a card. Not a punchline someone wrote years ago. A thing your friend came up with ten seconds ago, under a clock, that's both stupid and perfect.</p>
      <p>That laugh is the whole point of Unsay.</p>
      <p>Most party games hand you the jokes. You pick a card, the card is funny, you get the credit. Fine. Unsay flips it. You get letters and a topic. You write the line. Every answer is original because it came out of somebody's head mid-round.</p>
      <p>Then the lines show up with no names on them and everybody votes. No algorithm decides what's funny. People do. You can't vote for yourself, and you can't buy points. If you win, you earned it.</p></section>
      <section><h2>What we built in</h2><ul class="list">
        <li><b>Topics that bite.</b> "Things you can't say to your boss." "Things you can't say on a first date." "Things you can't say to airport security." The letters are random. The topic gives them teeth.</li>
        <li><b>A real ending.</b> First to the target score sets up a three-round face-off between the top two. The rest of the room decides the champion.</li>
        <li><b>Clean and Adult tables.</b> Clean tables star out rude words automatically. Adult tables are 18+.</li>
        <li><b>Bots so you never wait.</b> Empty seats fill with bots up to five players, and they leave the moment real people show up.</li>
        <li><b>Leaderboards that reset monthly,</b> plus a Hall of Fame for each month's top players, top guild and most-gifted line.</li>
        <li><b>A shop that can't buy wins.</b> Name styles, win animations, emoji and gifts. None of it adds points or votes.</li></ul></section>
      <section><h2>Who's behind it</h2>
      <p>Unsay is built and owned by Tenacié LLC, a small independent company. It's small on purpose: decisions get made fast, feedback gets read by the person who builds the game, and when something breaks, that same person fixes it.</p></section>
      <section class="cta"><h2>Talk to us</h2><p>Pack ideas, bug reports, complaints about losing to your little brother: <a href="/contact">Contact</a> or ${esc(env.CONTACT_EMAIL || 'hello@unsays.com')}.</p>
      <a class="btn prime" href="/">Play free</a><a class="btn" href="/contact">Contact</a></section>`,
  });
}

function contact(env) {
  const contact = esc(env.CONTACT_EMAIL || 'hello@unsays.com');
  return layout(env, {
    path: '/contact', title: 'Contact Unsay | Tenacié LLC',
    description: 'Report a bug, pitch a topic, fix a purchase or delete your data. Email hello@unsays.com and a real person at Tenacié LLC will answer.',
    schema: [crumbs(env, [['Unsay', '/'], ['Contact', '/contact']])],
    body: `<section class="hero"><span class="label">Contact</span><h1>Contact <span class="holo">Unsay</span></h1>
      <p class="lede">Got a bug, a topic idea, a business question, or a grudge about the last face-off? We read everything.</p>
      <p><b>Email:</b> <a href="mailto:${contact}">${contact}</a><br><b>Company:</b> Tenacié LLC</p></section>
      <section><h2>What to send</h2><ul class="list">
        <li><b>Bugs:</b> your device and browser, the table you were at, what you tapped and what went wrong. A screenshot helps a lot.</li>
        <li><b>Topic ideas:</b> the topic ("Things you can't say to...") and three acronyms with your best lines. Good ones might ship.</li>
        <li><b>Purchase problems:</b> if something you bought doesn't work, email within 14 days and we'll fix it or refund you. Include your player name.</li>
        <li><b>Delete my data:</b> email from the address on your account, or tell us your player name, and we'll delete your account and records. See <a href="/privacy">Privacy</a>.</li>
        <li><b>Reporting a player:</b> the table name, the player name and what happened. Hate, threats and other people's private info get removed.</li>
        <li><b>Press and partnerships:</b> who you are and what you have in mind.</li></ul></section>
      <section><h2>What to expect</h2><p>Replies come from a real person, not a ticket robot. It's a small shop, so give us a few days.</p></section>
      <section class="cta"><a class="btn prime" href="/">Play free</a><a class="btn" href="mailto:${contact}">Email us</a></section>`,
  });
}

async function leaderboard(env, DB, url) {
  const board = ['players', 'guilds', 'gifted'].includes(url.searchParams.get('board')) ? url.searchParams.get('board') : 'players';
  const m = monthKey();
  let rows = [];
  if (DB) rows = board === 'guilds' ? await topGuilds(DB, m) : board === 'gifted' ? await topGifted(DB, m) : await topPlayers(DB, m);
  const list = rows.length ? rows.map((r, i) => board === 'guilds'
    ? `<div class="row"><span class="pos">${i + 1}</span><span class="who">${logoImg(r, 18)}${tag(r.tag)}<a href="/g/${esc(r.slug)}">${nameOf(r.name)}</a><small>${r.members} member${r.members === 1 ? '' : 's'}</small></span><span class="pts">${r.points}</span></div>`
    : board === 'gifted'
      ? `<div class="row"><span class="pos">${i + 1}</span><span class="who">${orb(r.hue)}${nameOf(r.name)}</span><span class="pts">👑 ${r.gifts}</span></div>`
      : `<div class="row"><span class="pos">${i + 1}</span><span class="who">${orb(r.hue)}${tag(r.tag)}${nameOf(r.name)}<small>${r.game_wins ? `${r.game_wins} win${r.game_wins === 1 ? '' : 's'}` : ''}</small></span><span class="pts">${r.points}</span></div>`).join('')
    : `<div class="empty">Nobody has scored yet this month. Points count when at least 3 real people play a round.</div>`;
  const tabs = [['players', 'Players'], ['guilds', 'Guilds'], ['gifted', 'Most gifted']];
  return layout(env, {
    path: '/leaderboard' + (board === 'players' ? '' : `?board=${board}`), title: `Unsay leaderboard: ${monthLabel(m)}`,
    description: `The top Unsay players, guilds and most-gifted writers for ${monthLabel(m)}. Boards reset on the 1st of every month.`,
    noindex: board !== 'players', schema: [crumbs(env, [['Unsay', '/'], ['Leaderboard', '/leaderboard']])],
    body: `<section class="hero"><span class="label">${esc(monthLabel(m))} season</span><h1>Global <span class="holo">leaderboard</span></h1>
      <p class="lede">Points from public tables, counted when <b>at least 3 real people</b> play the round. Bots never count. Every board resets on the 1st, and the top 3 go into the <a href="/hall-of-fame">Hall of Fame</a>.</p></section>
      <section><nav class="tabs" aria-label="Boards">${tabs.map(([k, l]) => `<a href="/leaderboard${k === 'players' ? '' : '?board=' + k}"${k === board ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
      <div class="board">${list}</div>
      <p class="muted">${board === 'guilds' ? 'Guilds rank by their members\' points at public tables. Guild-table games count on each guild\'s own board.' : board === 'gifted' ? 'Gifts are sent after the votes, to lines people loved. They never add points.' : 'Ties go to the player with more game wins.'}</p></section>
      <section class="cta"><a class="btn prime" href="/">Play for points</a><a class="btn" href="/guild-pass">Start a guild</a></section>`,
  });
}

async function hallOfFame(env, DB) {
  if (DB) await archiveMonth(DB, prevMonth(monthKey())).catch(e => console.error('archive', e));
  const months = DB ? await hall(DB) : [];
  const body = months.length ? months.map(m => `<section class="card hof"><h2>${esc(m.label)}</h2>
      <div class="board">${m.players.map(r => `<div class="row"><span class="pos">${['🥇', '🥈', '🥉'][r.rank - 1] || r.rank}</span><span class="who">${tag(r.tag)}${nameOf(r.name)}</span><span class="pts">${r.value}</span></div>`).join('') || '<div class="empty">No ranked players that month.</div>'}</div>
      ${m.guild ? `<p><span class="label">Top guild</span><br>${tag(m.guild.tag)}${nameOf(m.guild.name)} · ${m.guild.value} points</p>` : ''}
      ${m.line ? `<p><span class="label">Most-gifted line</span><br>“${nameOf(m.line.line)}” by ${nameOf(m.line.name)} · 👑 ${m.line.value}</p>` : ''}</section>`).join('')
    : `<section class="card"><p>The first season is underway. On the 1st of next month, its top 3 players, top guild and most-gifted line will be sealed here for good.</p></section>`;
  return layout(env, {
    path: '/hall-of-fame', title: 'Unsay Hall of Fame: monthly champions',
    description: 'Every month\'s top 3 Unsay players, top guild and most-gifted line, kept forever. Champions earn a title that can\'t be bought.',
    schema: [crumbs(env, [['Unsay', '/'], ['Hall of Fame', '/hall-of-fame']])],
    body: `<section class="hero"><span class="label">Forever</span><h1>Hall of <span class="holo">Fame</span></h1>
      <p class="lede">When a month ends, its <b>top 3 players, top guild and most-gifted line</b> go here for good. Each champion gets a free title, like "Champion · ${esc(monthLabel(monthKey()))}", that no pack can buy.</p></section>${body}`,
  });
}

function guildPass(env) {
  const m = GUILD_PASS.monthly, y = GUILD_PASS.yearly;
  return layout(env, {
    path: '/guild-pass', title: 'Unsay Guild Pass: your crew\'s own table and leaderboard',
    description: 'For $2.99 a month, the Guild Pass gives your crew a members-only 14-seat table, a guild leaderboard and Hall of Fame, a guild tag on every member, and no ads for the owner.',
    schema: [{ '@context': 'https://schema.org', '@type': 'Product', name: 'Unsay Guild Pass', description: 'A members-only 14-seat table, guild leaderboard, guild tag and no ads for the owner.', image: site(env) + '/og.png', brand: { '@type': 'Brand', name: 'Unsay' },
      offers: [m, y].map(p => ({ '@type': 'Offer', price: (p.price / 100).toFixed(2), priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: site(env) + '/guild-pass',
        priceSpecification: { '@type': 'UnitPriceSpecification', price: (p.price / 100).toFixed(2), priceCurrency: 'USD', billingDuration: 1, billingIncrement: 1, unitCode: p.interval === 'month' ? 'MON' : 'ANN' } })) },
      faqSchema(FAQ.filter(([q]) => /Guild Pass|free\?/.test(q))), crumbs(env, [['Unsay', '/'], ['Guild Pass', '/guild-pass']])],
    body: `<section class="hero"><span class="label">Guild Pass</span><h1>Your crew. <span class="holo">Your table.</span></h1>
      <p class="lede">The owner pays, and everyone they invite gets the perks. <b>Joining a guild is always free.</b></p></section>
      <section class="plan">
        <div class="card hot"><span class="label">Monthly</span><div class="price">${money(m.price)} <small>a month</small></div><p class="muted">Cancel any time.</p></div>
        <div class="card"><span class="label">Yearly</span><div class="price">${money(y.price)} <small>a year</small></div><p class="muted">About 4 months free.</p></div>
      </section>
      <section><h2>What your guild gets</h2><ul class="list">
        <li><b>A members-only 14-seat table</b> that's always in the lobby with your guild's name on it.</li>
        <li><b>A guild tag</b> next to every member's name at every table, like <span class="gtag">[FART]</span>dave.</li>
        <li><b>A guild leaderboard</b> for points scored at your table, reset monthly, with its own Hall of Fame.</li>
        <li><b>A rank on the global guild board</b>, from your members' points at public tables.</li>
        <li><b>Members by invite link.</b> The owner can remove people and reset the link. Up to 50 members.</li>
        <li><b>No ads</b> for the owner, and no ads at the guild table for anyone.</li></ul>
        <p class="muted">Nothing paid adds points or votes, so the boards stay fair.</p></section>
      <section class="cta"><a class="btn prime" href="/#guild">Start a guild</a><a class="btn" href="/leaderboard?board=guilds">See top guilds</a></section>`,
  });
}

function shop(env) {
  const price = p => p.price ? money(p.price) : `${GIFTS.gift.icon} ${p.xcost}<small> received gifts</small>`;
  const group = (kinds, title, note) => `<section><h2>${title}</h2>${note ? `<p class="muted">${note}</p>` : ''}<div class="grid">${PACKS.filter(p => kinds.includes(p.kind)).map(p => `<article class="card"><h3>${esc(p.name)}</h3><div class="price">${price(p)}</div><p class="muted">${esc(p.blurb)}</p>${p.emoji ? `<div class="chips">${p.emoji.map(e => `<span class="chip">${e}</span>`).join('')}</div>` : ''}</article>`).join('')}</div></section>`;
  return layout(env, {
    path: '/shop', title: 'Unsay shop: flair, emoji and gift packs',
    description: 'Make your name stand out, react with emoji and reward the best lines. Unsay flair, emoji and gift packs are one-time purchases and never add points.',
    schema: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Unsay shop', itemListElement: PACKS.filter(p => p.price).map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Product', name: `Unsay ${p.name}`, description: p.blurb, offers: { '@type': 'Offer', price: (p.price / 100).toFixed(2), priceCurrency: 'USD' } } })) },
      crumbs(env, [['Unsay', '/'], ['Shop', '/shop']])],
    body: `<section class="hero"><span class="label">Shop</span><h1>Bragging rights, <span class="holo">for sale</span></h1>
      <p class="lede">Packs are bought once and kept forever. <b>None of them add points or votes.</b></p>
      <div class="cta"><a class="btn prime" href="/#store">Open the store</a></div></section>
      ${group(['flair'], 'Flair packs', 'Change how your name and wins look to the whole room.')}
      ${group(['emoji'], 'Emoji packs', `Everyone gets ${EMOJI_FREE.join(' ')} free. Emoji float over the table while people write, and land on a specific line only after the votes are in.`)}
      ${group(['drop', 'gifts'], 'Gift packs', `Send ${GIFTS.gift.icon} (1 gift) or ${GIFTS.crown.icon} (${GIFTS.crown.cost} gifts) to a line you loved after the votes. The monthly gift drop is the cheapest way to gift: ${DROP.perDay} gifts land in your account each day you play, for ${DROP.days} days.`)}
      ${group(['exchange'], 'Gift Exchange', 'Gifts other players send to your lines are yours to spend here. These titles and emoji can\'t be bought with money, and only gifts you received count. Flair and emoji packs can be traded for received gifts too.')}`,
  });
}

async function guildPage(env, DB, slug) {
  const g = DB && await DB.prepare('SELECT * FROM guilds WHERE slug = ?').bind(slug).first();
  if (!g || !guildActive(g)) return null;
  const m = monthKey();
  const rows = await guildBoard(DB, g.id, m);
  const months = await hall(DB, 'g:' + g.id);
  const members = (await DB.prepare('SELECT COUNT(*) AS n FROM players WHERE guild_id = ?').bind(g.id).first()).n;
  return layout(env, {
    path: `/g/${slug}`, title: `[${g.tag}] ${clean(g.name, 'clean')}: Unsay guild`,
    description: `The ${clean(g.name, 'clean')} guild on Unsay: ${members} members, monthly guild leaderboard and Hall of Fame.`,
    schema: [crumbs(env, [['Unsay', '/'], ['Leaderboard', '/leaderboard?board=guilds'], [g.name, `/g/${slug}`]])],
    body: `<section class="hero"><span class="label">Guild · ${members} member${members === 1 ? '' : 's'}</span><h1>${logoImg(g, 56)} <span class="holo">[${esc(g.tag)}]</span> ${nameOf(g.name)}</h1>
      <p class="lede">Points scored at the guild's own table, ${esc(monthLabel(m))}.</p></section>
      <section><div class="board">${rows.length ? rows.map((r, i) => `<div class="row"><span class="pos">${i + 1}</span><span class="who">${orb(r.hue)}${nameOf(r.name)}<small>${r.gifts ? '👑 ' + r.gifts : ''}</small></span><span class="pts">${r.points}</span></div>`).join('') : '<div class="empty">No games at the guild table yet this month.</div>'}</div></section>
      ${months.length ? `<section><h2>Guild Hall of Fame</h2>${months.map(mo => `<div class="card"><span class="label">${esc(mo.label)}</span><div>${mo.players.map(r => `${['🥇', '🥈', '🥉'][r.rank - 1]} ${nameOf(r.name)} · ${r.value}`).join('<br>')}</div></div>`).join('')}</section>` : ''}
      <section class="cta"><a class="btn prime" href="/">Play Unsay</a><a class="btn" href="/guild-pass">Start your own guild</a></section>`,
  });
}

async function joinPage(env, DB, code) {
  const g = DB && await DB.prepare('SELECT name, tag, pass_until FROM guilds WHERE invite = ?').bind(code).first();
  return layout(env, {
    path: `/join/${code}`, title: g ? `Join [${g.tag}] ${g.name} on Unsay` : 'Invite expired · Unsay', noindex: true,
    description: 'You were invited to an Unsay guild.',
    body: g ? `<section class="hero"><span class="label">Guild invite</span><h1>${logoImg(g, 56)} Join <span class="holo">[${esc(g.tag)}]</span> ${nameOf(g.name)}</h1>
      <p class="lede">Members wear the guild tag at every table, play at the guild's own table and climb the guild leaderboard. <b>Joining is free.</b></p>
      ${guildActive(g) ? '' : '<p class="notice">This guild\'s table is paused until the owner renews the Guild Pass. You can still join.</p>'}
      <div class="cta"><button class="btn prime" id="join" type="button">Join the guild</button><a class="btn" href="/">Not now</a></div><p id="msg" class="muted" role="status"></p></section>
      <script>document.getElementById('join').onclick=async()=>{const m=document.getElementById('msg');m.textContent='Joining…';
        try{const r=await fetch('/api/guild/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:${JSON.stringify(code)}})});const j=await r.json();
        if(!r.ok){m.textContent=j.error||'That didn\\'t work.';return;}location.href='/#guild';}catch(e){m.textContent='Could not reach the server.';}};</script>`
      : `<section class="hero"><h1>That invite has <span class="holo">expired</span></h1><p class="lede">Ask the guild owner for a new link.</p><div class="cta"><a class="btn prime" href="/">Play Unsay</a></div></section>`,
  });
}

function legal(env, path) {
  const contact = esc(env.CONTACT_EMAIL || 'hello@unsays.com');
  if (path === '/privacy') return layout(env, {
    path, title: 'Privacy Policy | Unsay', description: 'What Unsay keeps and why, how Google ad cookies work here, how to opt out of personalized ads, and how to delete your account. From Tenacié LLC.',
    body: `<section class="legal"><span class="label">Last updated Oct 30, 2026</span><h1>Privacy</h1>
      <p>Unsay is a browser game run by Tenacié LLC. This page says what we keep and why. Plain English, no tricks.</p>
      <h2>What we collect</h2><ul class="list">
        <li><b>Your player name and color,</b> which other players see.</li>
        <li><b>A sign-in cookie</b> that keeps your guest or signed-in account on this device.</li>
        <li><b>Your email address or Google account ID,</b> only if you sign in, so your account works on other devices.</li>
        <li><b>Game records:</b> points, wins, titles, daily check-ins and streaks, gifts sent and received, guild membership, and what you've bought.</li>
        <li><b>Lines and chat</b> while a game is running. We don't keep chat after the table closes. Lines that receive gifts are kept for the leaderboard and Hall of Fame.</li>
        <li><b>Payments</b> go through Stripe. We never see or store your card number.</li>
        <li><b>Settings saved in your browser</b> (local storage), like your name and color, so the game remembers them.</li>
        <li>Our host, Cloudflare, keeps standard request logs for security and debugging.</li></ul>
      <p>We don't sell your personal information.</p>
      <h2>Advertising and cookies (Google AdSense)</h2>
      <p>We use Google AdSense to show ads on some pages and tables, which helps keep Unsay free.</p><ul class="list">
        <li>Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this website or other websites.</li>
        <li>Google's use of advertising cookies enables it and its partners to serve ads to you based on your visit to this site and/or other sites on the Internet.</li>
        <li>You can opt out of personalized advertising in Google Ads Settings: <a href="https://adssettings.google.com">adssettings.google.com</a></li>
        <li>You can also opt out of some third-party vendors' use of cookies for personalized advertising at <a href="https://www.aboutads.info/choices">aboutads.info/choices</a></li>
        <li>How Google uses information from sites that use its services: <a href="https://policies.google.com/technologies/partner-sites">policies.google.com/technologies/partner-sites</a></li>
        <li>Other third-party ad vendors or ad networks may also use cookies to serve ads on our site.</li>
        <li>Visitors in the EEA, the UK and Switzerland are asked for consent through a Google-certified consent tool before personalized ads load.</li>
        <li>Ads never load at Adult language tables (like After Dark and The Breakup Booth) or at guild tables, and Guild Pass owners don't see ads anywhere.</li></ul>
      <h2>Your choices</h2><p>Block or delete cookies in your browser settings, use the opt-out links above, or ask us to delete your data. Depending on where you live, including California, you may have rights to know, delete and opt out. We honor those requests through the same email.</p>
      <h2>Deleting your data</h2><p>Email <a href="mailto:${contact}">${contact}</a> from the address on your account, or tell us your player name, and we'll delete your account and records.</p>
      <h2>Kids</h2><p>You must be 13 or older to play. We don't knowingly collect personal information from children under 13. If you think a child has given us data, email us and we'll delete it.</p>
      <h2>Changes</h2><p>If this policy changes, we'll update the date at the top.</p>
      <h2>Contact</h2><p>Tenacié LLC, <a href="mailto:${contact}">${contact}</a></p></section>`,
  });
  return layout(env, {
    path, title: 'Terms of Use | Unsay', description: 'Rules for playing and buying on Unsay: age limits, fair play, purchases and refunds, the Guild Pass, and ads. Run by Tenacié LLC.',
    body: `<section class="legal"><span class="label">Last updated Oct 27, 2026</span><h1>Terms</h1>
      <h2>Playing</h2><ul class="list"><li>You must be 13 or older to play, and 18 or older for Adult language tables.</li>
        <li>Don't post hate, threats, other people's private information, or anything illegal. We can remove names, lines, guilds or accounts that do.</li>
        <li>Don't cheat, script the game, or farm leaderboard points. We can reset scores we believe were not earned fairly.</li></ul>
      <h2>Purchases</h2><ul class="list"><li>Flair, emoji and gift packs are one-time purchases of digital items for use in Unsay. They have no cash value and can't be transferred. Gift drop gifts arrive one day at a time, and days you don't play aren't carried over. Received gifts can only be spent in the Gift Exchange.</li>
        <li>The Guild Pass renews every month or year until you cancel. You can cancel any time from your guild settings, and it stays active until the end of the period you paid for.</li>
        <li>If something you bought doesn't work, email <a href="mailto:${contact}">${contact}</a> within 14 days and we'll fix it or refund you.</li>
        <li>Gifts that have been sent can't be refunded.</li></ul>
      <h2>The service</h2><p>Unsay is provided as is. We may change or end features, including leaderboards and packs. If we shut down a paid feature, we'll refund the unused part of any Guild Pass.</p>
      <h2>Contact</h2><p><a href="mailto:${contact}">${contact}</a></p></section>`,
  });
}

function notFound(env) {
  return layout(env, {
    path: '/404', title: 'Page not found · Unsay', noindex: true, status: 404, description: 'That page doesn\'t exist.',
    body: `<section class="hero"><span class="label">404</span><h1>Some things <span class="holo">can't be found</span></h1><p class="lede">That page doesn't exist. The game is still running, though.</p>
      <div class="cta"><a class="btn prime" href="/">Play Unsay</a><a class="btn" href="/topics">Topics</a></div></section>`,
  });
}

export async function page(path, url, env, DB) {
  if (path.length > 1 && path.endsWith('/')) return Response.redirect(url.origin + path.slice(0, -1) + url.search, 301);
  if (path === '/how-to-play') return howToPlay(env);
  if (path === '/topics') return topicsIndex(env);
  const tm = path.match(/^\/topics\/([a-z-]+)$/);
  if (tm) { const t = ALL_TOPICS.find(x => topicSlug(x) === tm[1]); return t ? topicPage(env, t) : notFound(env); }
  if (path === '/faq') return faqPage(env);
  if (path === '/about') return about(env);
  if (path === '/contact') return contact(env);
  if (path === '/leaderboard') return leaderboard(env, DB, url);
  if (path === '/hall-of-fame') return hallOfFame(env, DB);
  if (path === '/guild-pass') return guildPass(env);
  if (path === '/shop') return shop(env);
  if (path === '/privacy' || path === '/terms') return legal(env, path);
  const gm = path.match(/^\/g\/([a-z0-9-]{1,40})$/);
  if (gm) return (await guildPage(env, DB, gm[1])) || notFound(env);
  const jm = path.match(/^\/join\/([a-f0-9]{8,40})$/);
  if (jm) return joinPage(env, DB, jm[1]);
  if (path === '/404') return notFound(env);
  return null;
}

/* ---------- robots, sitemap, llms.txt ---------- */

export function robots(env, indexable) {
  if (!indexable) return `# Preview host. The real site is ${site(env)}\nUser-agent: *\nDisallow: /\n`;
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\nDisallow: /ws/\nDisallow: /join/\n\nSitemap: ${site(env)}/sitemap.xml\n`;
}

const STATIC_PATHS = [['/', 'daily', '1.0'], ['/how-to-play', 'monthly', '0.9'], ['/topics', 'monthly', '0.8'], ['/faq', 'monthly', '0.8'],
  ['/leaderboard', 'hourly', '0.7'], ['/hall-of-fame', 'monthly', '0.6'], ['/guild-pass', 'monthly', '0.7'], ['/shop', 'monthly', '0.6'],
  ['/about', 'monthly', '0.6'], ['/contact', 'yearly', '0.5'],
  ['/privacy', 'yearly', '0.2'], ['/terms', 'yearly', '0.2']];

export async function sitemap(env, DB) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [...STATIC_PATHS, ...ALL_TOPICS.map(t => [`/topics/${topicSlug(t)}`, 'monthly', '0.6'])];
  if (DB) {
    try {
      const gs = (await DB.prepare('SELECT slug FROM guilds WHERE pass_until > ? LIMIT 5000').bind(Date.now()).all()).results;
      for (const g of gs) urls.push([`/g/${g.slug}`, 'daily', '0.4']);
    } catch (e) { console.error('sitemap', e); }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, f, pr]) =>
    `  <url><loc>${site(env)}${p}</loc><lastmod>${today}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`;
}

export function llms(env) {
  const s = site(env);
  return `# Unsay

> Unsay (unsays.com) is a free multiplayer acronym party game in the browser, in the style of Acrophobia (not affiliated), made by Tenacié LLC. Everyone gets the same 3 to 7 letter acronym and a topic, writes a line in 30 seconds (Turbo) or 60 seconds (Classic), then votes blind for the best line; you can't vote for your own. +1 per vote, +1 per letter for the round winner, +2 speed bonus, +1 for voting for the winner, 0 if you don't vote. The round winner picks the next topic. First to 30 points (15 on Sprint tables) sends the top two into a three-round face-off. Up to 14 players per table; bots fill seats up to 5. Clean tables filter rude words; Adult tables are 18+. Optional purchases are cosmetic and never add points.

## Pages
- [How to play](${s}/how-to-play): rules, scoring, timing and tips
- [Topics](${s}/topics): all 16 topics with example lines
- [FAQ](${s}/faq): common questions with short answers
- [About](${s}/about): why Unsay exists and who makes it
- [Contact](${s}/contact): ${env.CONTACT_EMAIL || 'hello@unsays.com'}
- [Leaderboard](${s}/leaderboard): this month's top players and guilds
- [Hall of Fame](${s}/hall-of-fame): past monthly champions
- [Guild Pass](${s}/guild-pass): what the subscription includes
- [Shop](${s}/shop): flair, emoji and gift packs

## Optional
- [Full text for language models](${s}/llms-full.txt)
- [Privacy](${s}/privacy)
- [Terms](${s}/terms)
`;
}

export function llmsFull(env) {
  const s = site(env);
  return `${llms(env)}
## How to play
${HOWTO.map(([n, t], i) => `${i + 1}. ${n}. ${t}`).join('\n')}

## Topics
${ALL_TOPICS.map(t => `- ${topicTitle(t)} (${s}/topics/${topicSlug(t)}). Example: "${EXAMPLES[t.id][0]}" (${acroOf(EXAMPLES[t.id][0])})`).join('\n')}

## FAQ
${FAQ.map(([q, a]) => `### ${q}\n${a}`).join('\n\n')}

## Store
- ${GUILD_PASS.monthly.name}: ${money(GUILD_PASS.monthly.price)} a month, or ${money(GUILD_PASS.yearly.price)} a year
${PACKS.filter(p => p.price).map(p => `- ${p.name}: ${money(p.price)}. ${p.blurb}`).join('\n')}

## Gift Exchange (paid with gifts received from other players)
${PACKS.filter(p => p.xcost).map(p => `- ${p.name}: ${p.xcost} received gifts${p.kind === 'exchange' ? ' (exchange only)' : ''}`).join('\n')}
`;
}
