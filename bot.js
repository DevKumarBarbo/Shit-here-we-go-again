const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const Parser = require("rss-parser");
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    NEWS_CHANNEL_ID: process.env.NEWS_CHANNEL_ID,
      WATCH_ACCOUNTS: ["elonmusk", "OpenAI", "NASA"],
        POLL_INTERVAL_MS: 30 * 1000,
          RSSHUB_INSTANCES: [
              "https://rsshub.rssforever.com",
                  "https://hub.slarker.me",
                      "https://rsshub.feeded.xyz",
                          "https://rsshub.app",
                            ],
                            };
                            const discord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
                            const parser = new Parser({ customFields: { item: [["media:content", "mediaContent", { keepArray: false }]] }, timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } });
                            const seenGuids = {};
                            function stripHtml(html) { return html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim(); }
                            function extractImage(item) { if (item.mediaContent?.$.url) return item.mediaContent.$.url; if (item.enclosure?.url) return item.enclosure.url; const match = item.content?.match(/<img[^>]+src=["']([^"']+)["']/i); if (match) return match[1]; return null; }
                            function buildEmbed(item, handle) {
                              const fullText = stripHtml(item.content || item.contentSnippet || item.title || "");
                                const profileUrl = "https://x.com/" + handle;
                                  const tweetUrl = item.link || profileUrl;
                                    const imageUrl = extractImage(item);
                                      const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
                                        const feedTitle = item.creator || "@" + handle;
                                          const embed = new EmbedBuilder().setColor(0x000000).setAuthor({ name: feedTitle.includes("@") ? feedTitle : feedTitle + " (@" + handle + ")", url: profileUrl }).setDescription(fullText.length > 4096 ? fullText.slice(0, 4093) + "..." : fullText).setURL(tweetUrl).setTimestamp(pubDate).setFooter({ text: "X Post @" + handle });
                                            if (imageUrl) embed.setImage(imageUrl);
                                              return embed;
                                              }
                                              async function fetchFeedWithFallback(handle) {
                                                for (const base of CONFIG.RSSHUB_INSTANCES) {
                                                    try { const feed = await parser.parseURL(base + "/twitter/user/" + handle); if (feed.items && feed.items.length > 0) return feed.items; } catch (e) { continue; }
                                                      }
                                                        return null;
                                                        }
                                                        async function fetchAndPost(channel, handle) {
                                                          try {
                                                              const items = await fetchFeedWithFallback(handle);
                                                                  if (!items) { console.error("[" + handle + "] All RSS instances failed"); return; }
                                                                      if (!seenGuids[handle]) { seenGuids[handle] = new Set(items.map((i) => i.guid || i.link)); console.log("[" + handle + "] Ready"); return; }
                                                                          const newItems = items.filter((i) => !seenGuids[handle].has(i.guid || i.link));
                                                                              if (newItems.length === 0) return;
                                                                                  for (const item of [...newItems].reverse()) { await channel.send({ embeds: [buildEmbed(item, handle)] }); seenGuids[handle].add(item.guid || item.link); console.log("Posted from @" + handle); }
                                                                                    } catch (err) { console.error("[" + handle + "] Error: " + err.message); }
                                                                                    }
                                                                                    discord.once("ready", async () => {
                                                                                      console.log("Bot online: " + discord.user.tag);
                                                                                        const channel = await discord.channels.fetch(CONFIG.NEWS_CHANNEL_ID).catch(() => null);
                                                                                          if (!channel) { console.error("Channel not found"); process.exit(1); }
                                                                                            console.log("Watching: " + CONFIG.WATCH_ACCOUNTS.map((h) => "@" + h).join(", "));
                                                                                              for (const handle of CONFIG.WATCH_ACCOUNTS) { await fetchAndPost(channel, handle); }
                                                                                                setInterval(async () => { for (const handle of CONFIG.WATCH_ACCOUNTS) { await fetchAndPost(channel, handle); } }, CONFIG.POLL_INTERVAL_MS);
                                                                                                });
                                                                                                discord.on("error", (err) => console.error("Discord error:", err));
                                                                                                discord.login(CONFIG.DISCORD_TOKEN);