var bigAssApi = require("../BigAssApi");

// Don't scan for any fans since we know the exact address of the fan (faster!)
var myMaster = new bigAssApi.FanMaster(0); 

// Put in exact information for the fan you're trying to reach
var myBigAss = new bigAssApi.BigAssFan("Sean's Room", "20:F8:5E:AA:7A:57", "255.255.255.255", myMaster);

// Set the brightness to low
myBigAss.light.brightness = 1;

// Ensure that network request has time to go out
// and also that the process will always exit eventually
setTimeout(function () {
	process.exit()
}, 1000)