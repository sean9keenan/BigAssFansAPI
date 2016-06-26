var bigAssApi = require("../BigAssApi");

var myMaster = new bigAssApi.FanMaster(1); // Expect only one fan in my setup

myMaster.onFanFullyUpdated = function(myBigAss){

    // Will automatically update / retry setting for this connected fan
    myBigAss.light.brightness = 1;
    myBigAss.fan.speed = 1;

    console.log("Initial Big Ass Light value: " + myBigAss.light.brightness);

    // Register for an update callback (say if the phone updates the property)
    myBigAss.light.registerUpdateCallback("brightness", function (newValue) {
        console.log("Updated brightness value: " + myBigAss.light.brightness); // or newValue
    })
    myBigAss.light.update("brightness");  // Forces an update to brightness
};