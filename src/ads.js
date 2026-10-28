// AdSense. Everything stays off until ADSENSE_CLIENT holds a publisher ID, and ads only run on the
// canonical host, because AdSense serves nothing on domains it hasn't approved.
// Who sees ads: free players only. Guild Pass owners never do, and guild tables never show them.
// Where: the lobby, the content pages, and the game's waiting room and game-over screen at clean tables.
// Never while anyone is writing or voting.

const CLIENT_RE = /^ca-pub-\d{10,20}$/;
const SLOT_RE = /^\d{6,20}$/;

export const adClient = env => CLIENT_RE.test(env.ADSENSE_CLIENT || '') ? env.ADSENSE_CLIENT : null;

export function adsConfig(env, host, canonical) {
  const client = adClient(env);
  if (!client || host !== canonical) return { client: null, slots: {} };
  const slot = v => SLOT_RE.test(v || '') ? v : null;
  return { client, slots: { lobby: slot(env.ADSENSE_SLOT_LOBBY), break: slot(env.ADSENSE_SLOT_BREAK), content: slot(env.ADSENSE_SLOT_CONTENT) } };
}

// f08c47fec0942fa0 is Google's certification authority ID, the same for every publisher.
export function adsTxt(env) {
  const client = adClient(env);
  return client ? `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n` : null;
}

// AdSense's "meta tag" site verification. Harmless once the site is approved, so it stays.
export const adMeta = env => adClient(env) ? `<meta name="google-adsense-account" content="${adClient(env)}">` : '';
