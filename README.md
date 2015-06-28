## SteamSaleBot

This is a Telegram bot that keeps you or your group posted on the latest Steam sales. It periodically checks the Steam Twitter account (@steam_games) for sales and sends any new ones.

It uses node.js + mongoDB on the server side and is made possible by the [node-telegram-bot](https://github.com/depoio/node-telegram-bot) project.

If you'd like to host your own, make sure to fill in your Telegram token and Twitter API keys in `config/config.js`.