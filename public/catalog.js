// Everything that can be bought or earned, shared by the browser client and the Worker.
// Prices are in US cents; xcost is the price in received gifts at the Gift Exchange. Nothing here adds points or votes.

export const GUILD_PASS = {
  monthly: { id: 'guild_month', name: 'Guild Pass', price: 299, interval: 'month', blurb: '$2.99 a month' },
  yearly: { id: 'guild_year', name: 'Guild Pass (yearly)', price: 2400, interval: 'year', blurb: '$24 a year, 4 months free' },
};

// Name styles, win animations, vote-reveal effects and titles. Packs unlock a group of these.
export const FLAIR = {
  name: {
    holo: 'Holo', gold: 'Gold leaf', neon: 'Neon sign', glitch: 'Glitch', fire: 'On fire', frost: 'Frostbite', wrapped: 'Gift wrapped', graffiti: 'Graffiti',
  },
  win: {
    supernova: 'Supernova', storm: 'Confetti storm', warp: 'Hyperspace', snowfall: 'Snowfall',
  },
  reveal: {
    spotlight: 'Spotlight', shake: 'Earthquake', sparkle: 'Sparkle',
  },
  title: {
    poet: 'Toilet Poet', menace: 'Certified Menace', hr: 'HR Problem', unsayable: 'Unsayable',
    liability: 'Group Chat Liability', regretter: 'Professional Regretter', naughty: 'Naughty List',
  },
};

// Titles only the Gift Exchange sells, one at a time: [key, title, received gifts].
export const EXCHANGE_TITLES = [
  ['gifted', 'The Gifted', 25], ['loved', 'They Love Me', 25], ['beloved', 'Beloved', 25], ['spoiled', 'Spoiled Rotten', 25],
  ['pet', 'Teacher\'s Pet', 25], ['golden', 'Golden Child', 30], ['darling', 'Darling of the Room', 30], ['magnet', 'Gift Magnet', 40],
  ['hoarder', 'Gift Hoarder', 40], ['simp', 'Simp Magnet', 40], ['main', 'Main Character', 50], ['legend', 'Absolute Legend', 50],
  ['fanclub', 'Fan Club President', 60], ['favorite', 'Crowd Favorite', 75], ['untouchable', 'Untouchable', 100], ['icon', 'Icon', 150],
];
for (const [k, t] of EXCHANGE_TITLES) FLAIR.title[k] = t;

// Daily check-in: gifts every day in a row, more the longer the streak, a bonus every 7th day,
// and flair at milestones. Missing a day starts the streak over; the rewards already won stay.
export const CHECKIN = { max: 4, weekBonus: 3 };
export const checkinGifts = streak => Math.min(CHECKIN.max, 1 + Math.floor((streak - 1) / 7)) + (streak % 7 === 0 ? CHECKIN.weekBonus : 0);
export const STREAK_REWARDS = [
  { days: 3, id: 'streak_3', title: ['showing', 'Showing Up'] },
  { days: 7, id: 'streak_7', title: ['regular', 'Regular'] },
  { days: 14, id: 'streak_14', name: 'graffiti' },
  { days: 30, id: 'streak_30', title: ['cantstay', 'Can\'t Stay Away'] },
  { days: 60, id: 'streak_60', title: ['addicted', 'Addicted'] },
  { days: 100, id: 'streak_100', title: ['nolife', 'No Life'] },
  { days: 365, id: 'streak_365', title: ['lifer', 'Lifer'] },
];
// Friend streaks: a day counts when two players finish a game at the same table.
export const FRIEND_REWARDS = [
  { days: 7, id: 'fstreak_7', title: ['rideordie', 'Ride or Die'] },
  { days: 30, id: 'fstreak_30', title: ['hip', 'Joined at the Hip'] },
  { days: 100, id: 'fstreak_100', title: ['crime', 'Partners in Crime'] },
];
for (const r of [...STREAK_REWARDS, ...FRIEND_REWARDS]) if (r.title) FLAIR.title[r.title[0]] = r.title[1];
const rewardPack = (r, kind) => ({ id: r.id, kind, days: r.days, name: r.title ? `"${r.title[1]}"` : `${FLAIR.name[r.name]} name`, blurb: '', grants: r.title ? { title: [r.title[0]] } : { name: [r.name] } });

export const EMOJI_FREE = ['👍', '👎', '😂', '😬'];

export const PACKS = [
  { id: 'flair_names', xcost: 40, kind: 'flair', name: 'Name styles', price: 199, blurb: 'Make your name stand out at every table.', grants: { name: ['holo', 'gold', 'neon', 'glitch', 'fire'] } },
  { id: 'flair_wins', xcost: 60, kind: 'flair', name: 'Win animations', price: 299, blurb: 'The whole room sees the sky explode when you win a round.', grants: { win: ['supernova', 'storm', 'warp'] } },
  { id: 'flair_reveal', xcost: 60, kind: 'flair', name: 'Vote-reveal effects', price: 299, blurb: 'Your line lands with an effect when the votes come in.', grants: { reveal: ['spotlight', 'shake', 'sparkle'] } },
  { id: 'flair_titles', xcost: 40, kind: 'flair', name: 'Titles', price: 199, blurb: 'A title under your name, like "Toilet Poet".', grants: { title: ['poet', 'menace', 'hr', 'unsayable', 'liability', 'regretter'] } },
  { id: 'flair_season', kind: 'flair', name: 'Winter drop 2026', price: 499, blurb: 'Frostbite name, Snowfall win and the "Naughty List" title. Gone after winter.', grants: { name: ['frost'], win: ['snowfall'], title: ['naughty'] } },
  { id: 'emoji_toilet', xcost: 40, kind: 'emoji', name: 'Toilet humor', price: 199, blurb: 'For the fart-joke crowd.', emoji: ['💩', '💨', '🧻'] },
  { id: 'emoji_roast', xcost: 40, kind: 'emoji', name: 'Roast', price: 199, blurb: 'For lines that deserve it.', emoji: ['🔥', '🤡', '🗑️'] },
  { id: 'emoji_shock', xcost: 40, kind: 'emoji', name: 'Shock', price: 199, blurb: 'For lines nobody can unsay.', emoji: ['😱', '💀', '🫣'] },
  { id: 'emoji_deluxe', xcost: 80, kind: 'emoji', name: 'Animated deluxe', price: 399, blurb: 'Bigger, bouncier, louder.', emoji: ['🎉', '🤯', '👑', '🍑'], big: true },
  { id: 'emoji_all', kind: 'emoji', name: 'All emoji packs', price: 699, blurb: 'Every pack above, now and later.', bundle: ['emoji_toilet', 'emoji_roast', 'emoji_shock', 'emoji_deluxe'] },
  { id: 'gifts_5', kind: 'gifts', name: '5 gifts', price: 199, gifts: 5, blurb: 'Reward the line that made you laugh.' },
  { id: 'gifts_15', kind: 'gifts', name: '15 gifts', price: 499, gifts: 15, blurb: 'Best value for regulars.' },
  { id: 'gifts_40', kind: 'gifts', name: '40 gifts', price: 999, gifts: 40, blurb: 'For the generous.' },
  // The cheapest gifts, handed out a few a day so players come back. Buying again adds 30 more days.
  { id: 'gift_drop', kind: 'drop', name: 'Monthly gift drop', price: 299, perDay: 2, days: 30, blurb: '2 free gifts every day for 30 days. The cheapest way to gift.' },
  // Only in the Gift Exchange: paid for with gifts other players sent you, never with money.
  ...EXCHANGE_TITLES.map(([k, t, xcost]) => ({ id: 'x_' + k, kind: 'exchange', xcost, name: `"${t}"`, blurb: 'A title under your name.', grants: { title: [k] } })),
  { id: 'x_wrapped', kind: 'exchange', xcost: 120, name: 'Gift wrapped name', blurb: 'Your name in ribbon stripes with a bow on top.', grants: { name: ['wrapped'] } },
  { id: 'x_emoji', kind: 'exchange', xcost: 30, name: 'Gifted emoji', blurb: 'Emoji you can only get from the exchange.', emoji: ['🎀', '🥹', '💝'] },
  // Won by streaks, never sold.
  ...STREAK_REWARDS.map(r => rewardPack(r, 'streak')),
  ...FRIEND_REWARDS.map(r => rewardPack(r, 'fstreak')),
];

export const DROP = PACKS.find(p => p.id === 'gift_drop');
export const DAY = 24 * 3600 * 1000;
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const exchangeable = () => PACKS.filter(p => p.xcost);

export const GIFTS = { gift: { cost: 1, icon: '🎁', name: 'Gift' }, crown: { cost: 3, icon: '👑', name: 'Gold crown' } };

export const packById = id => PACKS.find(p => p.id === id);
export const money = cents => '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);

// Expand bought pack ids (bundles included) into what the player may use.
export function unlocked(owned, earnedTitles = []) {
  const ids = new Set(owned);
  for (const id of owned) for (const b of packById(id)?.bundle || []) ids.add(b);
  const out = { name: new Set(), win: new Set(), reveal: new Set(), title: new Set(), emoji: new Set(EMOJI_FREE), big: new Set(), packs: ids };
  for (const id of ids) {
    const p = packById(id); if (!p) continue;
    for (const k in p.grants || {}) for (const v of p.grants[k]) out[k].add(v);
    for (const e of p.emoji || []) { out.emoji.add(e); if (p.big) out.big.add(e); }
  }
  for (const t of earnedTitles) out.title.add(t);
  return out;
}

// Earned titles are stored as text ("Champion · Nov 2026"); bought ones by key.
export const titleText = key => FLAIR.title[key] || key;
