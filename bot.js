const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const CONFIG = { DISCORD_TOKEN: process.env.DISCORD_TOKEN, NEWS_CHANNEL_ID: process.env.NEWS_CHANNEL_ID, RAPIDAPI_KEY: process.env.RAPIDAPI_KEY, WATCH_ACCOUNTS: [{ handle: 'elonmusk' }, { handle: 'OpenAI' }, { handle: 'NASA' }], POLL_INTERVAL_MS: 60 * 1000 };
const discord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const seenIds = {};
const userIds = {};
async function getUserId(handle) { const r = await fetch('https://twitter-x.p.rapidapi.com/user/details?username=' + handle, { headers: { 'x-rapidapi-host': 'twitter-x.p.rapidapi.com', 'x-rapidapi-key': CONFIG.RAPIDAPI_KEY } }); const d = await r.json(); console.log('[' + handle + '] details:', JSON.stringify(d).slice(0,200)); return d?.data?.user?.result?.rest_id || null; }
function buildEmbed(t, handle) { const e = new EmbedBuilder().setColor(0x000000).setAuthor({ name: '@' + handle, url: 'https://x.com/' + handle }).setDescription(t.text.slice(0,4096)).setURL('https://x.com/' + handle + '/status/' + t.id).setTimestamp(new Date(t.created_at)).setFooter({ text: 'X Post' }).addFields({ name: 'Engagement', value: '❤️ ' + fmt(t.likes) + '  🔁 ' + fmt(t.retweets) + '  💬 ' + fmt(t.replies) }); if (t.media) e.setImage(t.media); return e; }
discord.on('error', e => console.error(e));
discord.login(CONFIG.DISCORD_TOKEN);