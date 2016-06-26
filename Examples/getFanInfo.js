var bigAssApi = require("../BigAssApi");

var myMaster = new bigAssApi.FanMaster(1); // Expect only one fan in my setup

myMaster.onFanFullyUpdated = function(myBigAss){
	console.log("Found a new fan with name '" + myBigAss.name + "'")
	console.log("and identifier: '" + myBigAss.id + "'\n")
}