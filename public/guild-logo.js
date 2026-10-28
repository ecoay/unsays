// A guild's logo: one of the Buy Your Friends LLC icons in one of the colors below.
// Small enough for every page; the icon set itself (guild-icons.js) is only loaded by the picker and the Worker.

export const GUILD_COLORS = {
  pink: ['Pink', '#ff4fd2'], violet: ['Violet', '#8f6bff'], cyan: ['Cyan', '#59f2ff'], blue: ['Blue', '#4a8bff'],
  green: ['Green', '#5dffb1'], lime: ['Lime', '#c6ff4a'], gold: ['Gold', '#ffd36b'], orange: ['Orange', '#ff9f43'],
  red: ['Red', '#ff5a6e'], white: ['White', '#f2efff'],
};
export const DEFAULT_COLOR = 'pink';

const KEY = /^[a-z0-9-]{1,24}$/;
export const logoURL = (icon, color) => `/gi/${KEY.test(icon || '') ? icon : 'briefcase'}-${GUILD_COLORS[color] ? color : DEFAULT_COLOR}.svg`;
export const logoImg = (g, size = 20) => `<img class="glogo" src="${logoURL(g.icon, g.color)}" width="${size}" height="${size}" alt="" loading="lazy">`;

// The badge itself: the icon on a dark disc ringed in the guild color. entry is ICONS[key] from guild-icons.js.
export function logoSVG(entry, color) {
  const hex = (GUILD_COLORS[color] || GUILD_COLORS[DEFAULT_COLOR])[1];
  const [, , vb, body] = entry;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#140f28" stroke="${hex}" stroke-width="3"/>`
    + `<circle cx="32" cy="32" r="28" fill="${hex}" fill-opacity=".14"/>`
    + `<svg x="15" y="15" width="34" height="34" viewBox="${vb}" fill="${hex}" stroke="none">${body}</svg></svg>`;
}
