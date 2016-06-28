Unofficial Big Ass API
======================
This is this an unofficial Node.js API for [Big Ass Fans - fans with SenseME](www.bigassfans.com).

In particular - all development was done on a Haiku fan with SenseME.

What this could be/is used for
------------------------------
 - [Homekit control!](https://github.com/sean9keenan/homebridge-bigAssFans)
 - [Controlling your fan with keyboard shortcuts](https://github.com/sean9keenan/BigAssFansAPI/blob/master/Examples/fastDimLights.js)
 - Controlling it via any way you can imagine, just read on

Using the API!
==============
Two major components - the FanMaster and the BigAssFan.

FanMaster
---------
 - Listens for new fans
 - Allows sending messages to all fans
 - Routes all incoming messages to the appropriate child fans
 - Retries fan searching if fans detected < fans specified in constructor
 - Will not search for any fans if 0 is passed into constructor

Every fan needs a `FanMaster`! Because that's where the messages come from!

### Usage
 - Initialize with: `new bigAssApi.FanMaster(numberOfExpectedFans)`
 	- Will continue to query for new fans until numberOfExpectedFans is met - default is 1
 - `onFanFullyUpdated` - callback you can override - called with every new fully initialized fan
 - `onFanConnection` - callback you can override - called with every new fan connection with the fan connected
 	- Will get called before onFanFullyUpdated - but not guaranteed to have all fields updated (some will be `undefined`)
 - `rescanForFans` - rescans for all fans
 - `rescanUntilAllFans` - continues rescanning until `fanMaster.numberOfExpectedFans >= fansFound`
 - `allFans` - dictionary containing all of the fans - keyed off of the user given name
 - `pollingIntervalForFans` - polling interval if `numberOfExpectedFans < fansFound`

BigAssFan
---------
 - Allows sending and recieving messages from the fan
 - Registering for property updates
 - Sending update events to a given property
 - Implementing retries on setting properties
 - Interface to update all properties

### Installation

```
npm install BigAssFansAPI
```

### Example Code

```javascript
var bigAssApi = require("BigAssFansAPI");

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

```

#### More examples
To see more examples, [navigate to the examples directory](./Examples)!

### More about Properties
 - Property get retrieves the last known value
 	- To force a server query use the update function
 - All properties can be set
 	- This will send a server request - getting the property will not be updated until the device confirms it has been updated
 	- Implements retries automatically (`maxRetries`, `waitTimeOnRetry` can be set as fan properties)
 - Listening for update events
 	- If phone or other system updates the fan - or just when our "set" is succesful
 	- `myBigAss.light.registerUpdateCallback("brightness", function (newValue) {});`
 	- can all be unregistered with `unregisterUpdateCallback(id)` where `id` is the return of `registerUpdateCallback()`
 - Forcing an update
 	- For property `light.brightness` on BigAssFan: `myBigAss` call `myBigAss.light.update('brightness', optionalCallback)`;
 	- You can also use `myBigAss.update('light', optionalCallback);` or `myBigAss.updateAll(optionalCallback);`
 - Setting with a callback - with `myBigAss.light.setProperty('brightness', callback)` you can know when your set succeeded (or failed)

#### Properties 'supported'
 - `fan.isOn` - bool value
 - `fan.speed`
 - `fan.min`
 - `fan.max`
 - `fan.auto`
 - `fan.whoosh`
 - `fan.isSpinningForwards` - bool value
 - `light.brightness`
 - `light.min`
 - `light.max`
 - `light.auto`
 - `light.exists` - readonly - bool value
 - `light.isOccupied` - readonly - bool value
 - `light.minTimeout`
 - `light.maxTimeout`
 - `light.timeout`
 - `learn.isOn` - bool value
 - `learn.minSpeed`
 - `learn.maxSpeed`
 - `learn.zeroTemp`
 - `sleep.isOn` - bool value
 - `sleep.smartIdealTemp`
 - `sleep.minSpeed`
 - `sleep.maxSpeed`
 - `device.beeper` - bool value
 - `device.indicators` - bool value
 - `device.winterMode` - bool value
 - `device.height`
 - `device.token` - readonly
	- No idea what this token is for.
 - `device.dhcp` - bool value
 - `device.fw` - readonly
 - `device.broadcastSSID` - readonly
 - `device.isAccessPoint` - bool value

How was this made
-----------------
Through the magic of Wireshark! And the time granted by a weekend!

Pretty sure all the API's I saw when sniffing are now in here. But that'll probably change as BigAssFans adds more features.

Boring stuff 
------------
I am in no way am associated with Big Ass Fans. Also this can break at any time if they change their API. I'm also in no way am responsible for you damaging your fan by using this API.

(However - I would be surprised if you did)

Where this API is going
-----------------------
 - Hopefully not breaking you!
 	- Stuff that I have in here shouldn't be changing that much - but if it does - sorry!
 - Checking that setters have only valid input parameters
 - I hear unit tests are a good thing >.>
 - Add support for changing wireless access point used / the whole pairing process flow.
 - Register update callback might be changed to only call you on value update - not on 'fan-says-there-was-an-update-update'
