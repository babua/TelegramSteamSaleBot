
var Bot = require('node-telegram-bot');
config = require('./config/config.js'),
CronJob = require('cron').CronJob,
mongoose = require('./config/mongoose'),
Twitter = require('twitter');

db = mongoose();

var twitter = new Twitter(config.twitter);
var SteamChat = db.model('SteamChat');

var getLatestSales = function(sinceId, maxId, latestTweetId, sales){
	var initialRun = false;
	var twitterParams = { "count": config.tweetCount, "screen_name": 'steam_games', "exclude_replies": true, "trim_user": true, "include_rts": false};		
	if(sinceId !== null)
	{
		twitterParams.since_id = sinceId;
	} else
	{
		initialRun = true;
		twitterParams.count = 5;
	}
	if(maxId !== null)
	{
		twitterParams.max_id = maxId;
	}
	
	twitter.get('statuses/user_timeline', twitterParams, function(error, tweets, response){
		if (!error)
		{
			var minId = Infinity;
			saleTweets = tweets.filter(function(tweet){
				if(tweet.id < minId)
				{
					minId = tweet.id;
				}
				if(tweet.id > latestTweetId)
				{
					latestTweetId = tweet.id;
				}
				if(tweet.text.indexOf('sale') !== -1 ||
					tweet.text.indexOf('Sale') !== -1 || 
					tweet.text.indexOf('SALE') !== -1 ||
					tweet.text.indexOf('% off') !== -1 ||
					tweet.text.indexOf('% Off') !== -1 ||
					tweet.text.indexOf('% OFF') !== -1)
				{
					return true;
				} else
				{
					return false;
				}
			});
			if(saleTweets.length === 0 || minId === maxId)
			{
		// no more new tweets, we're done, send message
		sales.tweets.forEach(function(tweet,ind,arr){
			bot.sendMessage({"chat_id" : sales.message.chat.id , "text" : tweet.text},function(nodifiedPromise){});		
		});
		//save the last sent tweet id
		SteamChat.update({"id": sales.message.chat.id}, {$set: {"latestTweetId": latestTweetId}}, {"upsert": true}, function(err,result){});
	} else 
	{	
		//add tweets and get the next batch
		saleTweets.forEach(function(tweet,ind,arr){
			sales.tweets.push(tweet);
		});

		if(initialRun)
		{
			sales.tweets.forEach(function(tweet,ind,arr){
				bot.sendMessage({"chat_id" : sales.message.chat.id , "text" : tweet.text},function(nodifiedPromise){});		
			});
			SteamChat.update({"id": sales.message.chat.id}, {$set: {"latestTweetId": latestTweetId}}, {"upsert": true}, function(err,result){});
		} else
		{
			getLatestSales(sinceId,minId-1,latestTweetId,sales);
		}
	}

} else {
	console.log(error);
  	//TODO: retry a number of times before giving up
  }
});


};

var checkSteamJob = new CronJob('* * * * *', function(){
	console.log('entering job');
SteamChat.find({}, function(err,docs){
	docs.forEach(function(steamChat,ind,arr){
		var sinceId = null;
		var latestTweetId = 0;
		if(steamChat.latestTweetId !== 0){
			sinceId = steamChat.latestTweetId;
			latestTweetId = steamChat.latestTweetId;
		}
		maxId = null;
		var sales = {
			tweets: [], 
			message: {
				chat: {
					id: steamChat.id
				}
			}
		};
		getLatestSales(sinceId,maxId,latestTweetId,sales);
	});
});
}
,function(){
	console.log('job done');
}
,true);

var bot = new Bot({
	token: config.telegram.token
})
.on('message', function (message) {
	if(message.hasOwnProperty("text")){
		splitStr = message.text.split(" ");

		if(splitStr[0] === "/steamsale")
		{
			if(splitStr.length === 2)
			{
				if(splitStr[1] === "start")
				{
					var startCallback = function(err,steamChat){
						if(err)
						{
							console.log(err)
							return	
						} 
						if(steamChat === null)
						{
							SteamChat.update({"id": message.chat.id}, {$set: {"id": message.chat.id, "latestTweetId": 0}}, {"upsert": true, "new": true}, function(err,result){
								bot.sendMessage({"chat_id" : message.chat.id , "text" : "Posting Steam sales to this chat"},function(nodifiedPromise){});	
								sinceId = null;
								maxId = null;
								latestTweetId = 0;
								var sales = {
									tweets: [], 
									message: message
								};
								getLatestSales(sinceId,maxId,latestTweetId,sales);						
							});
						} else
						{
							bot.sendMessage({"chat_id" : message.chat.id , "text" : "This chat is already receiving Steam sales"},function(nodifiedPromise){});							
						}
					};
					startCallback.message = message;
					SteamChat.findOne({"id" : message.chat.id},startCallback);
				} else if (splitStr[1] === "stop")
				{
					var stopCallback = function(err,steamChat){
						if(err)
						{
							console.log(err)
							return	
						} 
						if(steamChat === null)
						{
							bot.sendMessage({"chat_id" : message.chat.id , "text" : "This chat does not receive Steam sales"},function(nodifiedPromise){});							
						} else
						{
							bot.sendMessage({"chat_id" : message.chat.id , "text" : "This chat is no longer receiving Steam sales"},function(nodifiedPromise){});							
						}
					};
					stopCallback.message = message;
					SteamChat.findOneAndRemove({"id" : message.chat.id},stopCallback);
				}
			}

		}

		if(splitStr[0] === "/start")
		{
			bot.sendMessage({"chat_id" : message.chat.id , "text" : "This bot keeps you posted on latest Steam sales. You can use it individually or add to a group chat.\nUsage:\n/steamsale start : The user or group chat will start receiving Steam sale news. The bot will post some recent sales to kick things off\n/steamsale stop : The user or group chat will stop receiving updates"},function(nodifiedPromise){});							
		}

	}
})
.start();