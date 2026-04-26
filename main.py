import discord
from discord.ext import tasks, commands
from twikit import Client
import os
import asyncio
from flask import Flask
from threading import Thread

# --- CONFIGURATION ---
# Change these to the X usernames you want to watch
TARGET_ACCOUNTS = ['ElonMusk', 'NASA'] 
CHECK_DELAY = 300 # Checks every 5 minutes

# --- KEEP ALIVE SERVER ---
# This creates a tiny webpage so the host doesn't shut down
app = Flask('')
@app.route('/')
def home(): 
    return "Bot is Online!"

    def run(): 
        app.run(host='0.0.0.0', port=8080)

        def keep_alive(): 
            t = Thread(target=run)
                t.start()

                # --- DISCORD BOT SETUP ---
                intents = discord.Intents.default()
                intents.message_content = True
                bot = commands.Bot(command_prefix="!", intents=intents)

                x_client = Client('en-US')
                last_seen_ids = {}

                async def x_login():
                    # This logs into your burner X account
                        if os.path.exists('cookies.json'):
                                try:
                                            x_client.load_cookies('cookies.json')
                                                        return
                                                                except: 
                                                                            pass
                                                                                
                                                                                    await x_client.login(
                                                                                            auth_info_1=os.environ['X_USERNAME'],
                                                                                                    auth_info_2=os.environ['X_EMAIL'],
                                                                                                            password=os.environ['X_PASSWORD']
                                                                                                                )
                                                                                                                    x_client.save_cookies('cookies.json')

                                                                                                                    @tasks.loop(seconds=CHECK_DELAY)
                                                                                                                    async def watch_x():
                                                                                                                        # Get the channel where you want to post
                                                                                                                            channel = bot.get_channel(int(os.environ['CHANNEL_ID']))
                                                                                                                                if not channel: 
                                                                                                                                        print("Channel not found! Check your CHANNEL_ID.")
                                                                                                                                                return

                                                                                                                                                    for user_handle in TARGET_ACCOUNTS:
                                                                                                                                                            try:
                                                                                                                                                                        user = await x_client.get_user_by_screen_name(user_handle)
                                                                                                                                                                                    tweets = await user.get_tweets('Tweets', count=1)
                                                                                                                                                                                                
                                                                                                                                                                                                            if tweets:
                                                                                                                                                                                                                            tweet = tweets[0] # Get the newest tweet
                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                            # Check if this is a new tweet we haven't seen
                                                                                                                                                                                                                                                                            if user_handle not in last_seen_ids:
                                                                                                                                                                                                                                                                                                last_seen_ids[user_handle] = tweet.id
                                                                                                                                                                                                                                                                                                                elif last_seen_ids[user_handle] != tweet.id:
                                                                                                                                                                                                                                                                                                                                    # Use fxtwitter to make sure videos/images embed correctly
                                                                                                                                                                                                                                                                                                                                                        fixed_url = f"https://fxtwitter.com{user_handle}/status/{tweet.id}"
                                                                                                                                                                                                                                                                                                                                                                            await channel.send(f"**{user_handle}** just posted:\n{fixed_url}")
                                                                                                                                                                                                                                                                                                                                                                                                last_seen_ids[user_handle] = tweet.id
                                                                                                                                                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                                                                                                                                                            except Exception as e:
                                                                                                                                                                                                                                                                                                                                                                                                                                        print(f"Error checking {user_handle}: {e}")

                                                                                                                                                                                                                                                                                                                                                                                                                                        @bot.event
                                                                                                                                                                                                                                                                                                                                                                                                                                        async def on_ready():
                                                                                                                                                                                                                                                                                                                                                                                                                                            print(f'Logged in as {bot.user.name}')
                                                                                                                                                                                                                                                                                                                                                                                                                                                await x_login()
                                                                                                                                                                                                                                                                                                                                                                                                                                                    watch_x.start() # Start the loop that checks X

                                                                                                                                                                                                                                                                                                                                                                                                                                                    # --- START ---
                                                                                                                                                                                                                                                                                                                                                                                                                                                    if __name__ == "__main__":
                                                                                                                                                                                                                                                                                                                                                                                                                                                        keep_alive()
                                                                                                                                                                                                                                                                                                                                                                                                                                                            try:
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    bot.run(os.environ['DISCORD_TOKEN'])
                                                                                                                                                                                                                                                                                                                                                                                                                                                                        except Exception as e:
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                print(f"Error starting bot: {e}")
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                