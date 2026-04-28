const fs = require("fs");

// Force exit after 4 minutes
setTimeout(() => { console.log("Force exit"); process.exit(0); }, 4 * 60 * 1000);

const CONFIG = {
  DISCORD_WEBHOOK: process.env.DISCORD_WEBHOOK,
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
  elonmusk:      { name: "Elon Musk",      color: 15658734, badge: "👤" },
  NASA:          { name: "NASA",            color: 742801,   badge: "🚀" },
  NVIDIAGeForce: { name: "NVIDIA GeForce", color: 7774464,  badge: "🎮" },
  Intel:         { name: "Intel",           color: 29125,    badge: "💻" },
  Google:        { name: "Google",          color: 4359668,  badge: "🔍" },
  YouTube:       { name: "YouTube",         color: 16711680, badge: "▶️" },
  HINDU_KlNG:    { name: "HINDU KlNG",     color: 16737280, badge: "👑" },
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

async function sendWebhook(embed) {
  const res = await fetch(CONFIG.DISCORD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Webhook error ${res.status}: ${await res.text()}`);
}

async function fetchFromNitter(handle) {
  for (const instance of CONFIG.NITTER_INSTANCES) {
    try {
      console.log(`[${handle}] Trying ${instance}...`);
      const res = await fetch(`${instance}/${handle}/rss`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS reader)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
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
      console.log(`[${handle}] Failed: ${err.message}`);
    }
  }
  return [];
}

function buildEmbed(tweet, handle) {
  const meta = ACCOUNT_META[handle] || { name: `@${handle}`, color: 1316135, badge: "📢" };
  let postType, postIcon, color;
  if (tweet.isRetweet)    { postType = "Repost"; postIcon = "🔁"; color = 52307;    }
  else if (tweet.isReply) { postType = "Reply";  postIcon = "💬"; color = 1940463;  }
  else if (tweet.image)   { postType = "Photo";  postIcon = "🖼️"; color = 16740096; }
  else                    { postType = "Post";   postIcon = "✍️"; color = meta.color; }

  const tweetUrl = tweet.link;
  const profileUrl = `https://x.com/${handle}`;
  const postDate = tweet.date ? new Date(tweet.date) : new Date();
  const dateFormatted = postDate.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
  });

  const embed = {
    color,
    author: {
      name: `${meta.badge}  ${meta.name}  ·  @${handle}`,
      url: profileUrl,
      icon_url: `https://unavatar.io/twitter/${handle}`,
    },
    title: `${postIcon}  New ${postType} from @${handle}`,
    url: tweetUrl,
    description: tweet.text.length > 0 ? tweet.text.slice(0, 4096) : "*Media only post*",
    fields: [
      { name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", value: `🕐  **${dateFormatted}**`, inline: false },
      { name: "🔗  View Post", value: `**[→ Open on X](${tweetUrl})**`, inline: true },
      { name: "👤  Profile",   value: `**[→ @${handle}](${profileUrl})**`, inline: true },
    ],
    timestamp: postDate.toISOString(),
    footer: {
      text: "N.I.F. Private News Service  ·  𝕏 Twitter/X",
      icon_url: "https://abs.twimg.com/favicons/twitter.3.ico",
    },
  };

  if (tweet.image) embed.image = { url: tweet.image };
  return embed;
}

async function main() {
  console.log("🤖 Bot starting...");
  console.log(`Webhook: ${CONFIG.DISCORD_WEBHOOK ? "✅" : "❌ MISSING"}`);

  // Test webhook
  try {
    await sendWebhook({
      color: 0x00c853,
      title: "✅ N.I.F. News Bot Online",
      description: "Bot is running and checking for new posts...",
      timestamp: new Date().toISOString(),
    });
    console.log("✅ Webhook works!");
  } catch (err) {
    console.error(`❌ Webhook failed: ${err.message}`);
    process.exit(1);
  }

  const seen = loadSeen();
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
          await sendWebhook(buildEmbed(tweet, handle));
          seen[handle].unshift(tweet.id);
          totalPosted++;
          console.log(`[${handle}] ✅ Posted: ${tweet.text.slice(0, 60)}`);
          await sleep(500);
        } catch (err) {
          console.error(`[${handle}] Error: ${err.message}`);
        }
      }
      seen[handle] = seen[handle].slice(0, 50);
    }
    await sleep(1000);
  }

  saveSeen(seen);
  console.log(`✅ Done! Posted ${totalPosted} new posts.`);
  process.exit(0);
}

main();
