const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  NEWS_CHANNEL_ID: process.env.NEWS_CHANNEL_ID,
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,

  WATCH_ACCOUNTS: [
    { handle: "HINDU_KlNG" },
    { handle: "OpenAI" },
    { handle: "NASA" },
  ],

  POLL_INTERVAL_MS: 60 * 1000,
};

const discord = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const seenIds = {};

// Step 1: get user_id from username
async function getUserId(handle) {
  const url = `https://twitter-x.p.rapidapi.com/user/details?username=${handle}`;
  const res = await fetch(url, {
    headers: {
      "x-rapidapi-host": "twitter-x.p.rapidapi.com",
      "x-rapidapi-key": CONFIG.RAPIDAPI_KEY,
    },
  });
  const data = await res.json();
  console.log(`[${handle}] User lookup raw:`, JSON.stringify(data).slice(0, 300));

  // Try common paths
  const id =
    data?.data?.user?.result?.rest_id ||
    data?.user?.id_str ||
    data?.id_str ||
    data?.id ||
    null;

  console.log(`[${handle}] Resolved user_id: ${id}`);
  return id;
}

// Step 2: fetch tweets by user_id
async function fetchTweets(user_id, handle) {
  const url = `https://twitter-x.p.rapidapi.com/user/tweets?user_id=${user_id}&limit=10&includeFulltext=true`;
  const res = await fetch(url, {
    headers: {
      "x-rapidapi-host": "twitter-x.p.rapidapi.com",
      "x-rapidapi-key": CONFIG.RAPIDAPI_KEY,
    },
  });

  if (!res.ok) {
    console.error(`[${handle}] Tweets HTTP ${res.status}`);
    return [];
  }

  const data = await res.json();
  console.log(`[${handle}] Tweets raw sample:`, JSON.stringify(data).slice(0, 500));

  // Try to extract from all known shapes
  let tweets = [];

  // Shape A: timeline instructions
  const instructions =
    data?.data?.user?.result?.timeline_v2?.timeline?.instructions ||
    data?.data?.user?.result?.timeline?.timeline?.instructions || [];

  const entries = instructions.find((i) => i.type === "TimelineAddEntries")?.entries || [];

  for (const entry of entries) {
    const legacy = entry?.content?.itemContent?.tweet_results?.result?.legacy;
    if (!legacy || !legacy.id_str) continue;
    tweets.push({
      id: legacy.id_str,
      text: legacy.full_text || legacy.text,
      created_at: legacy.created_at,
      likes: legacy.favorite_count || 0,
      retweets: legacy.retweet_count || 0,
      replies: legacy.reply_count || 0,
      media: legacy.entities?.media?.[0]?.media_url_https || null,
      is_retweet: (legacy.full_text || "").startsWith("RT @"),
    });
  }

  // Shape B: flat array
  if (tweets.length === 0) {
    const arr = data?.results || data?.tweets || (Array.isArray(data) ? data : []);
    for (const t of arr) {
      const text = t.full_text || t.text || t.tweet || "";
      const id = t.id_str || t.id || t.tweet_id;
      if (!id || !text) continue;
      tweets.push({
        id: String(id),
        text,
        created_at: t.created_at || new Date().toISOString(),
        likes: t.favorite_count || 0,
        retweets: t.retweet_count || 0,
        replies: t.reply_count || 0,
        media: t.entities?.media?.[0]?.media_url_https || null,
        is_retweet: text.startsWith("RT @"),
      });
    }
  }

  console.log(`[${handle}] Extracted ${tweets.length} tweets`);
  return tweets;
}

function buildEmbed(tweet, handle) {
  const tweetUrl = `https://x.com/${handle}/status/${tweet.id}`;
  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setAuthor({ name: `@${handle}`, url: `https://x.com/${handle}` })
    .setDescription(tweet.text.length > 4096 ? tweet.text.slice(0, 4093) + "..." : tweet.text)
    .setURL(tweetUrl)
    .setTimestamp(new Date(tweet.created_at))
    .setFooter({ text: `𝕏 Post · @${handle}` })
    .addFields({ name: "Engagement", value: `❤️ ${fmt(tweet.likes)}  🔁 ${fmt(tweet.retweets)}  💬 ${fmt(tweet.replies)}` });
  if (tweet.media) embed.setImage(tweet.media);
  return embed;
}

function fmt(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// Cache of resolved user IDs
const userIds = {};

async function fetchAndPost(channel, account) {
  try {
    // Resolve user_id if not cached
    if (!userIds[account.handle]) {
      userIds[account.handle] = await getUserId(account.handle);
    }
    const user_id = userIds[account.handle];
    if (!user_id) {
      console.error(`[${account.handle}] Could not resolve user_id`);
      return;
    }

    const tweets = await fetchTweets(user_id, account.handle);
    if (!tweets || tweets.length === 0) return;

    if (!seenIds[account.handle]) {
      seenIds[account.handle] = new Set(tweets.map((t) => t.id));
      console.log(`[${account.handle}] Seeded ${seenIds[account.handle].size} IDs`);
      return;
    }

    const newTweets = tweets.filter((t) => !seenIds[account.handle].has(t.id));
    console.log(`[${account.handle}] ${newTweets.length} new tweets`);

    for (const tweet of [...newTweets].reverse()) {
      if (tweet.is_retweet) continue;
      await channel.send({ embeds: [buildEmbed(tweet, account.handle)] });
      seenIds[account.handle].add(tweet.id);
      console.log(`[${account.handle}] ✅ Posted: ${tweet.text.slice(0, 60)}`);
    }
  } catch (err) {
    console.error(`[${account.handle}] Error: ${err.message}`);
  }
}

discord.once("clientReady", async () => {
  console.log(`✅ Bot online: ${discord.user.tag}`);
  const channel = await discord.channels.fetch(CONFIG.NEWS_CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error("❌ Channel not found");
    process.exit(1);
  }
  console.log(`📡 Watching: ${CONFIG.WATCH_ACCOUNTS.map((a) => "@" + a.handle).join(", ")}`);
  console.log(`⏱️  Polling every ${CONFIG.POLL_INTERVAL_MS / 1000}s`);

  for (const account of CONFIG.WATCH_ACCOUNTS) {
    await fetchAndPost(channel, account);
  }

  setInterval(async () => {
    for (const account of CONFIG.WATCH_ACCOUNTS) {
      await fetchAndPost(channel, account);
    }
  }, CONFIG.POLL_INTERVAL_MS);
});

discord.on("error", (err) => console.error("Discord error:", err));
discord.login(CONFIG.DISCORD_TOKEN);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      discord.login(CONFIG.DISCORD_TOKEN);constconstconstconst