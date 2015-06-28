var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var SteamChatSchema = new Schema({
	id: Number,
	latestTweetId: Number
});

mongoose.model('SteamChat',SteamChatSchema);
