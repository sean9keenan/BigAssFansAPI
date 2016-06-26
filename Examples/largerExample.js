var bigAssApi = require("../BigAssApi");
bigAssApi.logging = false;

var myMaster = new bigAssApi.FanMaster(1); // Expect only one fan in my setup

console.log("Waiting for full update");
myMaster.onFanFullyUpdated = function(myBigAss){

    // Filter out all fants that don't begin with "Sean" - that's in my fan's name!
	var lowercaseName = myBigAss.name.toLowerCase();

	if (lowercaseName.indexOf("sean") == -1) {
		console.log(lowercaseName);
		return;
	}

    // Will automatically update / retry setting for this connected fan
    myBigAss.light.brightness = 1;
    myBigAss.fan.speed = 2;

    console.log("Initial Big Ass Light value: " + myBigAss.light.brightness);

    // Register for an update callback (say if the phone updates the property)
    myBigAss.light.registerUpdateCallback("brightness", function (newValue) {
        console.log("Updated brightness value: " + myBigAss.light.brightness); // or newValue
    });
    myBigAss.light.update("brightness");  // Forces an update to brightness

    myBigAss.fan.update("speed", function(err, value) {
    	if (err) {
    		console.log("Error encountered while trying to get update: " + err);
    		return;
    	}
    	console.log("Updated speed: " + value);
    });

    setTimeout(function () {
		myBigAss.light.brightness = 0;
	    myBigAss.fan.speed = 1;
	}, 3000)
};
