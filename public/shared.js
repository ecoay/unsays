// Game data and pure helpers shared by the browser client and the Worker.

export const GENERAL = { id: 'general', pre: "Things you can't unsay", subj: 'General', style: 'general', pack: '*' };

export const TOPICS = [
  { id: 'ex', pre: "Things you can't say to", subj: 'your ex', style: 'aud', pack: 'love', w: 'baby boyfriend blocked closure cheated dumped ex girlfriend hoodie miss new rebound text therapy single stalked' },
  { id: 'partner', pre: "Things you can't unsay to", subj: 'your partner', style: 'aud', pack: 'love', w: 'always babe cuddle divorce honey mother nag snore weight wedding you yoga' },
  { id: 'mil', pre: "Things you can't say to", subj: 'your mother-in-law', style: 'aud', pack: 'love', w: 'casserole cooking grandkids hair house husband judging Linda nursing old son visit gravy' },
  { id: 'boss', pre: "Things you can't say to", subj: 'your boss', style: 'aud', pack: 'work', w: 'boss bonus deadline email fired lazy meeting overtime promotion quit raise salary Slack zoom' },
  { id: 'sports', pre: "Things you can't unsay:", subj: 'Sports', style: 'sub', pack: 'fan', w: 'ball bench coach dunk field goal helmet jersey kicker league offside penalty quarterback referee score team tackle umpire varsity win' },
  { id: 'disney', pre: "Things you can't unsay:", subj: 'Disney', style: 'sub', pack: 'fan', w: 'castle Dumbo Elsa fairy Goofy happiest kingdom lion magic Mickey mouse Nemo Pixar princess queen Simba Toy villain wand Ursula' },
  { id: 'date', pre: "Things you can't say on", subj: 'a first date', style: 'aud', pack: 'love', w: 'cat check dinner ex feelings genuinely kids marry mom paid ring single therapist Venmo' },
  { id: 'kids', pre: "Things you can't say to", subj: 'your kids', style: 'aud', pack: 'love', w: 'adopted bedtime candy dad favorite grounded homework nanny Santa tooth vegetables' },
  { id: 'hr', pre: "Things you can't say to", subj: 'HR', style: 'aud', pack: 'work', w: 'complaint harassment intern lawsuit liability policy rumor theft' },
  { id: 'cop', pre: "Things you can't say to", subj: 'a cop', style: 'aud', pack: 'work', w: 'bail drunk fast gun high license officer speeding trunk warrant' },
  { id: 'airport', pre: "Things you can't say to", subj: 'airport security', style: 'aud', pack: 'work', w: 'bomb carry jokes knife liquids passport suitcase TSA' },
  { id: 'therapist', pre: "Things you can't say to", subj: 'your therapist', style: 'aud', pack: 'love', w: 'anxiety childhood dream feelings mom nightmare pills repressed secret' },
  { id: 'doctor', pre: "Things you can't say to", subj: 'your doctor', style: 'aud', pack: 'work', w: 'bleeding cough doc Google itchy lump rash symptoms WebMD' },
  { id: 'plane', pre: "Things you can't say to", subj: 'the person next to you on a plane', style: 'aud', pack: 'work', w: 'armrest bathroom crash elbow feet kick nervous parachute seat snore window' },
  { id: 'weddings', pre: "Things you can't unsay:", subj: 'Weddings', style: 'sub', pack: 'love', w: 'aisle bride cake dress ex groom honeymoon open reception toast vows' },
];

export const PACKS = { all: 'All topics', love: 'Love & family', work: 'Work & authority', fan: 'Fandoms' };

export const SPEEDS = {
  turbo: { compose: 30, vote: 15, results: 6, pick: 5, foCompose: 20, foVote: 10, foResults: 4, over: 12 },
  classic: { compose: 60, vote: 20, results: 8, pick: 5, foCompose: 20, foVote: 12, foResults: 5, over: 20 },
};

const WORDS_RAW = {
  A: 'awkward always actually accidentally another ask aunt alone again angry awful avocado',
  B: 'but brother baby bring big bad blame broke bathroom bonus bet basically',
  C: 'can cousin cried crush cheated clearly cancel coffee crazy candidly cringe cat',
  D: "did don't dad dumped deeply drunk dinner delete divorce dramatic definitely dog",
  E: 'every ex eventually eat emotionally embarrassing extra ego eleven earlier',
  F: 'forgot fine frankly farted feelings fired friend Friday fake forever',
  G: 'guess gross great grandma got gym ghosted gave genuinely goodbye',
  H: 'honestly hate how her his hot hungover hug hamster help',
  I: "I I'm it into imagine invoice ice instantly is innocent",
  J: 'just jealous Janet judge joke jail jeans jog',
  K: 'kinda kissed kids keep knew karaoke kale kidding',
  L: 'literally love lied last lunch lost loudly lawyer later lowkey',
  M: 'my mom maybe married mistake money mean mostly meeting mustache',
  N: 'never no nobody naked new nice napkin nightly nephew',
  O: 'oops oh obviously only once our office oddly okay',
  P: 'please probably pregnant pants promise party pizza paid perfectly pretty',
  Q: 'quietly quit quite questionable quick queasy',
  R: 'really remember regret ran rich rash rather ruined rent',
  S: 'sorry so seriously she sister sweaty secretly smell slept stole',
  T: 'that totally thought texted the too tiny tax tonight',
  U: 'um ugly unfortunately uncle under upset usually',
  V: 'very vegan vaguely vomited vacation velvet',
  W: "we wait why with wife weird wasn't who",
  X: 'xylophone x-rays Xbox Xerox',
  Y: 'your yes yesterday you yelled yikes yoga',
  Z: 'zero zombie zipper zoom zany',
};
const WORDS = {};
for (const k in WORDS_RAW) WORDS[k] = WORDS_RAW[k].split(' ');
const BANKS = {};
for (const t of TOPICS) {
  const bank = {};
  for (const w of t.w.split(' ')) (bank[w[0].toUpperCase()] ||= []).push(w);
  BANKS[t.id] = { bank, set: new Set(t.w.split(' ')) };
}

// Weighted by how often English words start with each letter; at most one hard letter per acronym.
const LETTER_W = { A: 5.7, B: 6, C: 9.4, D: 6.1, E: 3.9, F: 4.1, G: 3.3, H: 3.7, I: 3.9, J: 1.1, K: 1, L: 3.1, M: 5.6, N: 2.2, O: 2.5, P: 7.7, Q: .4, R: 6, S: 11, T: 5, U: 2.9, V: 1.5, W: 2.7, X: .08, Y: .5, Z: .25 };
const HARD = new Set(['J', 'K', 'Q', 'V', 'X', 'Y', 'Z']);

export const BOT_NAMES = ['neonfox', '0xKaren', 'gm_gary', 'wagmi_wendy', 'MidnightMarge', 'PixelPete', 'glitter_goblin', 'Kev', 'unsayable', 'rugpull_ralph', 'DiscoDana', 'lowkey_lou', 'Sir Typo', 'moonbag_meg', 'acr0bat', 'TacoTuesday', 'vibe_check', 'Brenda.exe', 'ZeroChill', 'captain_cringe', 'LadyLOL', 'hot_take_hal'];
export const CHATTER = {
  compose: ['ooh good letters', 'I have nothing', 'lol this topic', 'typing so fast rn', 'ok ok ok', 'brain empty', 'this one is cursed', 'gm'],
  vote: ['GMV', 'these are all bad and I love them', 'tough one', 'lmaooo', 'who wrote the 2nd one', 'ok that one got me'],
  win: ['ty ty', 'I will be here all week', 'GG', 'called it', '🙏'],
  lose: ['robbed', 'next round is mine', 'fair', 'gg', 'ngl that was good'],
  greet: ['gm', 'hey!', 'welcome', 'yo', 'gm gm'],
  reply: ['lol', 'true', '💀', 'facts', 'ok but focus', 'same'],
};
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'asshole', 'bastard', 'whore', 'slut'];

export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const normal = s => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

export function clean(text, mode) {
  if (mode !== 'clean') return text;
  return text.replace(/[a-z]+/gi, w => BAD.some(b => w.toLowerCase().startsWith(b)) ? w[0] + '*'.repeat(w.length - 1) : w);
}

export function makeAcronym(len) {
  const letters = Object.keys(LETTER_W);
  const total = letters.reduce((s, l) => s + LETTER_W[l], 0);
  const out = []; let hard = 0;
  while (out.length < len) {
    let r = Math.random() * total, L = 'S';
    for (const l of letters) { r -= LETTER_W[l]; if (r <= 0) { L = l; break; } }
    if (HARD.has(L)) { if (hard >= 1) continue; hard++; }
    if (out.length && out[out.length - 1] === L && Math.random() < .7) continue;
    out.push(L);
  }
  return out.join('');
}

export function checkAnswer(text, acro) {
  const words = text.trim().split(/\s+/).filter(w => /[a-z]/i.test(w));
  const firsts = words.map(w => (w.match(/[a-z]/i) || [''])[0].toUpperCase());
  const per = acro.split('').map((L, i) => firsts[i] == null ? 'empty' : firsts[i] === L ? 'ok' : 'bad');
  const valid = words.length === acro.length && per.every(s => s === 'ok');
  return { words, firsts, per, valid, extra: words.length > acro.length };
}

// Bot lines follow a small grammar, so they read like a sentence instead of word salad:
// each letter gets a word of the part of speech its slot needs (s subject, d possessive,
// j adjective, n noun, a adverb, v past-tense verb).
const POS_RAW = {
  s: 'aunt brother baby cousin dad everyone grandma he I Janet kids mom nobody she uncle we you',
  d: 'a all every his her my our some the their your',
  j: 'angry awkward bad big broke crazy drunk dramatic embarrassing extra fake gross hot hungover innocent jealous lazy loud mean naked nervous nice old pregnant quiet rich sweaty tiny ugly upset vegan weird wet young zany',
  n: 'avocado aunt bathroom baby bonus boyfriend cat coffee cousin crush dinner dog divorce ego email feelings friend grandma gym hamster homework ice jeans joke kale karaoke kids lawyer lunch mistake money mom mustache napkin nephew office pants party pizza question rash rent secret sister smell tax tooth uncle underwear vacation velvet wife wedding Xbox yoga zipper zombie',
  a: 'accidentally actually always basically barely clearly deeply definitely emotionally eventually finally frankly genuinely gently honestly instantly just kinda literally loudly lowkey mostly never nightly obviously only oddly probably quietly quickly really rarely secretly seriously totally unfortunately usually vaguely very weirdly yesterday',
  v: 'ate blamed broke borrowed cancelled cheated cried deleted divorced dumped emailed faked farted forgot fired ghosted googled hated hugged invoiced iced judged joked kissed kicked licked lied lost married missed napped nagged owed paid pranked promised quit questioned ruined ran regretted smelled slept stole texted tackled tickled unfriended upset vomited vented wanted wore yelled zapped zoomed',
};
const POS = {};
for (const k in POS_RAW) { POS[k] = {}; for (const w of POS_RAW[k].split(' ')) (POS[k][w[0].toUpperCase()] ||= []).push(w); }
const PATTERNS = {
  3: ['svn', 'sav', 'asv', 'dnv', 'djn', 'snv', 'jnv'],
  4: ['svdn', 'dnvn', 'savn', 'asvn', 'djnv', 'dnav', 'svjn', 'jnvn'],
  5: ['svdjn', 'dnavn', 'adnvn', 'djnav', 'savdn', 'djnvn', 'asvdn'],
  6: ['dnavdn', 'asvdjn', 'savdjn', 'djnvdn', 'adjnvn'],
  7: ['djnavdn', 'adnvdjn', 'sasvdjn', 'djnvadn'],
};
const FUNC = new Set("a an and are as at be but by can't didn't do don't for from got had has have he her his i i'm if in is it its just me my no not of on or our she so that the their then they this to too was we were what when why will with you your".split(' '));
const VOCAB = new Set([...Object.values(POS_RAW), ...Object.values(WORDS_RAW)].join(' ').toLowerCase().split(' '));

const wordFor = (pos, L, topicBank) => {
  const tw = topicBank && topicBank[L];
  // Topic words are mostly nouns; past-tense ones work as verbs.
  const fit = tw && tw.filter(w => pos === 'n' ? !/ed$/.test(w) : pos === 'v' ? /ed$/.test(w) : false);
  if (fit && fit.length && Math.random() < .55) return { w: pick(fit), topical: true };
  const list = POS[pos][L];
  return list ? { w: pick(list) } : null;
};

export function botPhrase(acro, topicId) {
  const b = topicId && BANKS[topicId];
  const letters = acro.split('');
  let best = null;
  for (const pat of shuffle(PATTERNS[letters.length] || [])) {
    const words = letters.map((L, i) => wordFor(pat[i], L, b && b.bank));
    const fit = words.filter(Boolean).length / letters.length;
    if (!best || fit > best.fit) best = { words, fit };
    if (fit === 1) break;
  }
  const words = letters.map((L, i) => best?.words[i] || { w: pick(WORDS[L]) });
  let s = words.map(x => x.w).join(' ');
  s = s[0].toUpperCase() + s.slice(1);
  if (Math.random() < .3) s += pick(['!', '?', '...', '.']);
  const topical = words.filter(x => x.topical).length;
  // A line that fits its grammar all the way is worth voting for; a patched one much less.
  const fit = best ? best.fit : 0;
  return { text: s, q: rnd(.55, .95) * (fit === 1 ? 1.25 : .45 + fit * .45) + topical * .25 };
}

// How much a bot likes a line a person wrote: real words, glue words that make it a sentence,
// and words that fit the topic. Keyboard mashing and word salad score low.
export function humanQuality(words, topicId) {
  const lw = words.map(w => w.toLowerCase().replace(/[^a-z']/g, ''));
  const real = lw.filter(w => w && /[aeiouy]/.test(w) && !/[^aeiouy']{5,}/.test(w) && !/(.)\1\1/.test(w) && w.length <= 14).length / Math.max(1, lw.length);
  if (real < .6) return rnd(.05, .2);
  const known = lw.filter(w => VOCAB.has(w) || FUNC.has(w)).length / Math.max(1, lw.length);
  const glue = lw.some(w => FUNC.has(w)) ? .2 : 0;
  const b = topicId && BANKS[topicId];
  const topical = b ? lw.filter(w => [...b.set].some(t => t.toLowerCase() === w)).length : 0;
  return rnd(.7, 1) * real + glue + known * .2 + Math.min(2, topical) * .25;
}

export function topicById(id) { return id === 'general' ? GENERAL : TOPICS.find(t => t.id === id); }
export function publicTopic(t) { return { id: t.id, pre: t.pre, subj: t.subj, style: t.style }; }
