const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const ACCOUNTS = ["elonmusk"];

let seen = new Set();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
  });

  async function getTweets(username) {
    try {
        const res = await axios.get(`https://cdn.syndication.twimg.com/widgets/timelines/profile?screen_name=${username}`);
            return res.data.globalObjects.tweets;
              } catch (e) {
                  console.log("Fetch error:", e.message);
                      return {};
                        }
                        }

                        async function send(channel, tweet, username) {
                          const embed = {
                              author: {
                                    name: `@${username}`,
                                          url: `https://x.com/${username}/status/${tweet.id_str}`
                                              },
                                                  description: tweet.full_text,
                                                      url: `https://x.com/${username}/status/${tweet.id_str}`,
                                                          color: 0x000000,
                                                              timestamp: new Date(tweet.created_at)
                                                                };

                                                                  if (tweet.entities.media && tweet.entities.media.length > 0) {
                                                                      embed.image = { url: tweet.entities.media[0].media_url_https };
                                                                        }

                                                                          await channel.send({ embeds: [embed] });
                                                                          }

                                                                          async function startBot() {
                                                                            const channel = await client.channels.fetch(CHANNEL_ID);

                                                                              console.log("Bot started...");

                                                                                while (true) {
                                                                                    for (const user of ACCOUNTS) {
                                                                                          const tweets = await getTweets(user);

                                                                                                for (const id in tweets) {
                                                                                                        if (seen.has(id)) continue;

                                                                                                                seen.add(id);

                                                                                                                        console.log("New tweet:", id);
                                                                                                                                await send(channel, tweets[id], user);
                                                                                                                                      }
                                                                                                                                          }

                                                                                                                                              await new Promise(r => setTimeout(r, 5000));
                                                                                                                                                }
                                                                                                                                                }

                                                                                                                                                client.once("ready", () => {
                                                                                                                                                  console.log(`Logged in as ${client.user.tag}`);
                                                                                                                                                    startBot();
                                                                                                                                                    });

                                                                                                                                                    client.login(TOKEN);