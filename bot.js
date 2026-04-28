const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");

// Force exit after 4 minutes no matter what
setTimeout(() => {
  console.log("⏰ Force exit after 4 minutes");
  process.exit(0);
}, 4 * 60 * 1000);

const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  NEWS_CHANNEL_ID: process.env.NEWS_CHANNEL_ID,
  WATCH_ACCOUNTS: ["elonmusk", "NASA", "NVIDIAGeForce", "Intel", "Google", "YouTube", "HINDU_KlNG"],
  SEEN_FILE: "seen_ids.json",
  NITTER_INSTANCES: [
    "https://nitter.net",
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
    "https://nitter.1d4.us",
  ],
};

const ACCOUNT_META = {
  elonmusk:      { name: "Elon Musk",      color: 0xe8e8e8, badge: "👤" },
  NASA:          { name: "NASA",            color: 0x0b3d91, badge: "🚀" },
  NVIDIAGeForce: { name: "NVIDIA GeForce", color: 0x76b900, badge: "🎮" },
  Intel:         { name: "Intel",           color: 0x0071c5, badge: "💻" },
  Google:        { name: "Google",          color: 0x4285f4, badge: "🔍" },
  YouTube:       { name: "YouTube",         color: 0xff0000, badge: "▶️" },
  HINDU_KlNG:    { name: "HINDU KlNG",     color: 0xff6600, badge: "👑" },
};

function loadSeen() {
  try {
    if (fs.existsSync(CONFIG.SEEN_FILE))
      return JSON.parse(fs.readFileSync(CONFIG.SEEN_FILE, "utf8"));
  } catch (e) {}
  return {};
}

function saveSeen(seen) {
  fs.writeFileSync(CONFIG.SEEN_FILE, JSON.stringify(seen, null, 2));
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchFromNitter(handle) {
  for (const instance of CONFIG.NITTER_INSTANCES) {
    try {
      console.log(`[${handle}] Trying ${instance}...`);
      const url = `${instance}/${handle}/rss`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS reader)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { console.log(`[${handle}] ${instance} returned ${res.status}`); continue; }
      const xml = await res.text();
      const items = [];
      const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
      for (const match of itemMatches) {
        const item = match[1];
        const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || "";
        const link = item.match(/<link>(.*?)<\/link>/)?.[1] || "";
        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
        const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] || "";
        const idMatch = link.match(/status\/(\d+)/);
        if (!idMatch) continue;
        const id = idMatch[1];
        const imgMatch = desc.match(/<img[^>]+src="([^"]+)"/);
        const image = imgMatch && imgMatch[1].startsWith("http") ? imgMatch[1] : null;
        const cleanText = title.replace(/^R to @\w+: /, "").replace(/^RT by @\w+: /, "").trim();
        items.push({
          id,
          text: cleanText,
          link: `https://x.com/${handle}/status/${id}`,
          date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          image,
          isRetweet: title.startsWith("RT by"),
          isReply: title.startsWith("R to"),
        });
      }
      if (items.length > 0) {
        console.log(`[${handle}] ✅ Got ${items.length} posts`);
        return items;
      }
    } catch (err) {
      console.log(`[${handle}] ${instance} error: ${err.message}`);
    }
  }
  console.log(`[${handle}] ❌ All instances failed`);
  return [];
}

function buildEmbed(tweet, handle) {
  const meta = ACCOUNT_META[handle] || { name: `@${handle}`, color: 0x14171a, badge: "📢" };
  let postType, postIcon, color;
  if (tweet.isRetweet)    { postType = "Repost"; postIcon = "🔁"; color = 0x00c853; }
  else if (tweet.isReply) { postType = "Reply";  postIcon = "💬"; color = 0x1d9bf0; }
  else if (tweet.image)   { postType = "Photo";  postIcon = "🖼️"; color = 0xff6f00; }
  else                    { postType = "Post";   postIcon = "✍️"; color = meta.color; }

  const tweetUrl = tweet.link;
  const profileUrl = `https://x.com/${handle}`;
  const postDate = tweet.date ? new Date(tweet.date) : new Date();
  const dateFormatted = postDate.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
  });

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `${meta.badge}  ${meta.name}  ·  @${handle}`,
      url: profileUrl,
      iconURL: `https://unavatar.io/twitter/${handle}`,
    })
    .setTitle(`${postIcon}  New ${postType} from @${handle}`)
    .setURL(tweetUrl)
    .setDescription(tweet.text.length > 0 ? tweet.text.slice(0, 4096) : "*Media only post*")
    .addFields(
      { name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", value: `🕐  **${dateFormatted}**`, inline: false },
      { name: "🔗  View Post", value: `**[→ Open on X](${tweetUrl})**`, inline: true },
      { name: "👤  Profile",   value: `**[→ @${handle}](${profileUrl})**`, inline: true },
    )
    .setTimestamp(postDate)
    .setFooter({
      text: "N.I.F. Private News Service  ·  𝕏 Twitter/X",
      iconURL: "https://abs.twimg.com/favicons/twitter.3.ico",
    });

  if (tweet.image) embed.setImage(tweet.image);
  return embed;
}

async function main() {
  console.log("🤖 Bot starting...");
  console.log(`📡 Token exists: ${!!CONFIG.DISCORD_TOKEN}`);
  console.log(`📡 Channel ID exists: ${!!CONFIG.NEWS_CHANNEL_ID}`);

  const seen = loadSeen();

  // Connect to Discord with timeout
  const discord = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  console.log("🔌 Connecting to Discord...");

  await Promise.race([
    new Promise(resolve => discord.once("clientReady", resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Discord timeout")), 30000)),
  ]).catch(err => {
    console.error("❌ Discord connection failed:", err.message);
    process.exit(1);
  });

  console.log(`✅ Discord connected: ${discord.user.tag}`);

  const channel = await discord.channels.fetch(CONFIG.NEWS_CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error("❌ Channel not found — check NEWS_CHANNEL_ID secret");
    process.exit(1);
  }

  console.log(`✅ Channel found: #${channel.name}`);

  let totalPosted = 0;

  for (const handle of CONFIG.WATCH_ACCOUNTS) {
    const tweets = await fetchFromNitter(handle);
    if (!tweets.length) { await sleep(1000); continue; }

    if (!seen[handle]) {
      seen[handle] = tweets.map(t => t.id);
      console.log(`[${handle}] First run — seeded ${seen[handle].length}`);
      await sleep(1000);
      continue;
    }

    const seenSet = new Set(seen[handle]);
    const newTweets = tweets.filter(t => !seenSet.has(t.id));

    if (newTweets.length === 0) {
      console.log(`[${handle}] No new posts`);
    } else {
      for (const tweet of [...newTweets].reverse()) {
        try {
          await channel.send({ embeds: [buildEmbed(tweet, handle)] });
          seen[handle].unshift(tweet.id);
          totalPosted++;
          console.log(`[${handle}] ✅ Posted: ${tweet.text.slice(0, 60)}`);
          await sleep(500);
        } catch (err) {
          console.error(`[${handle}] Send error: ${err.message}`);
        }
      }
      seen[handle] = seen[handle].slice(0, 50);
    }

    await sleep(1000);
  }

  saveSeen(seen);
  console.log(`\n✅ Done! Posted ${totalPosted} new posts.`);
  discord.destroy();
  process.exit(0);
}

// Start Discord and run main
const discord = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
discord.once("clientReady", () => main());
discord.login(CONFIG.DISCORD_TOKEN).catch(err => {
  console.error("❌ Discord login failed:", err.message);
  process.exit(1);
});
