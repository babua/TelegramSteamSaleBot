
var Bot = require('node-telegram-bot');
config = require('./config/config.js'),
CronJob = require('cron').CronJob,
mongoose = require('./config/mongoose'),
Twitter = require('twitter');

db = mongoose();
console.log('Starting app');
var twitter = new Twitter(config.twitter);
var SteamChat = db.model('SteamChat');

var getLatestSales = function(sinceId, maxId, latestTweetId, sales, onFinished){
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
				onFinished(sales);		
	} else 
	{	
		//add tweets and get the next batch
		saleTweets.forEach(function(tweet,ind,arr){
			sales.tweets.push(tweet);
		});

		if(initialRun)
		{

			onFinished(sales);
		} else
		{
			getLatestSales(sinceId,minId-1,latestTweetId,sales,onFinished);
		}
	}

} else {
	console.log(error);
  	//TODO: retry a number of times before giving up
  }
});


};

var checkSteamJob = new CronJob('00 00 */2 * * *', function(){


	console.log('entering job');
	SteamChat.find({}, function(err,docs){
	

	var latestTweetId = 0;
	var sinceId = Infinity;
	docs.forEach(function(steamChat,ind,arr){
		if(steamChat.latestTweetId < sinceId && steamChat.latestTweetId > 0) 
		{
			sinceId = steamChat.latestTweetId;
		}
	});
	maxId = null;
	latestTweetId = sinceId;
	console.log(sinceId);
	var sales = {
			tweets: [] 
		};

	getLatestSales(sinceId,maxId,latestTweetId,sales,function(sales){
		console.log(sales);
		SteamChat.find({}, function(err,docs){
			docs.forEach(function(steamChat,ind,arr){
				console.log("Sending sales to:");
				console.log(steamChat);
				userTweets = sales.tweets.filter(function(tweet){
					if(tweet.id > steamChat.latestTweetId) return true;
				});
				var userSales = sales;
				userSales.tweets = userTweets;

				userSales.tweets.forEach(function(tweet,ind,arr){
					bot.sendMessage({"chat_id" : steamChat.id , "text" : tweet.text},function(nodifiedPromise){});		
					SteamChat.update({"id": steamChat.id}, {$set: {"latestTweetId": tweet.id}}, {"upsert": true}, function(err,result){});
				});


			});	
		});
	
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
	console.log(message);
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
								getLatestSales(sinceId,maxId,latestTweetId,sales,function(salesResult){
									var maxId = 0;
									salesResult.tweets.forEach(function(tweet,ind,arr){
										bot.sendMessage({"chat_id" : salesResult.message.chat.id , "text" : tweet.text},function(nodifiedPromise){});		
										if(tweet.id > maxId){
											maxId = tweet.id;
										}
									});

									SteamChat.update({"id": salesResult.message.chat.id}, {$set: {"latestTweetId": maxId}}, {"upsert": true}, function(err,result){});
								});

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