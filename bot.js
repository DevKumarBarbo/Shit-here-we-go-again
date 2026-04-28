const fs = require("fs");

setTimeout(() => { console.log("Force exit"); process.exit(0); }, 4 * 60 * 1000);

const CONFIG = {
  DISCORD_WEBHOOK: process.env.DISCORD_WEBHOOK,
  WATCH_ACCOUNTS: ["elonmusk", "NASA", "NVIDIAGeForce", "Intel", "Google", "YouTube", "HINDU_KlNG"],
  SEEN_FILE: "seen_ids.json",
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
  if (!res.ok) throw new Error(`Webhook ${res.status}: ${await res.text()}`);
}

async function fetchTweets(handle) {
  try {
    // Use Twitter's own syndication API - no auth needed for public accounts
    const url = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}?showReplies=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.log(`[${handle}] Syndication returned ${res.status}`);
      return await fetchFromFxTwitter(handle);
    }

    const data = await res.json();
    const entries = data?.timeline?.entries || [];
    const tweets = [];

    for (const entry of entries) {
      const tweet = entry?.content?.tweet;
      if (!tweet || !tweet.id_str) continue;
      const text = tweet.full_text || tweet.text || "";
      const media = tweet.entities?.media?.[0]?.media_url_https || null;
      tweets.push({
        id: tweet.id_str,
        text: text.replace(/https:\/\/t\.co\/\S+/g, "").trim(),
        link: `https://x.com/${handle}/status/${tweet.id_str}`,
        date: tweet.created_at ? new Date(tweet.created_at).toISOString() : new Date().toISOString(),
        image: media,
        likes: tweet.favorite_count || 0,
        retweets: tweet.retweet_count || 0,
        replies: tweet.reply_count || 0,
        isRetweet: !!tweet.retweeted_status,
        isReply: !!tweet.in_reply_to_status_id_str,
      });
    }

    if (tweets.length > 0) {
      console.log(`[${handle}] ✅ Got ${tweets.length} tweets from syndication`);
      return tweets;
    }

    return await fetchFromFxTwitter(handle);
  } catch (err) {
    console.log(`[${handle}] Syndication failed: ${err.message}`);
    return await fetchFromFxTwitter(handle);
  }
}

// Fallback: use fxtwitter which mirrors public tweets
async function fetchFromFxTwitter(handle) {
  try {
    // fxtwitter has a public API for individual tweets
    // We get the user's latest tweet ID from their profile page
    const res = await fetch(`https://api.fxtwitter.com/${handle}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    console.log(`[${handle}] fxtwitter response:`, JSON.stringify(data).slice(0, 200));
    return [];
  } catch (err) {
    console.log(`[${handle}] fxtwitter failed: ${err.message}`);
    return [];
  }
}

function formatNum(n) {
  if (!n) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
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
      {
        name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        value: `❤️ **${formatNum(tweet.likes)}**  ·  🔁 **${formatNum(tweet.retweets)}**  ·  💬 **${formatNum(tweet.replies)}**`,
        inline: false,
      },
      { name: "🕐  Published", value: `**${dateFormatted}**`, inline: false },
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

  // Test webhook
  try {
    await sendWebhook({
      color: 0x00c853,
      title: "🤖 N.I.F. News Bot — Run Started",
      description: "Checking for new posts from watched accounts...",
      timestamp: new Date().toISOString(),
      footer: { text: "N.I.F. Private News Service" },
    });
    console.log("✅ Webhook works!");
  } catch (err) {
    console.error(`❌ Webhook failed: ${err.message}`);
    process.exit(1);
  }

  const seen = loadSeen();
  let totalPosted = 0;

  for (const handle of CONFIG.WATCH_ACCOUNTS) {
    const tweets = await fetchTweets(handle);
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
