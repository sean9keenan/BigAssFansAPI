var dgram = require("dgram");

function FanMaster (numberOfExpectedFans) {
    this.allFans = {}; // Dictionary of fan name -> BigAssFan
    this.connectionOpen = false;
    this.fanPort = 31415;
    this.everyone = "255.255.255.255";
    this.server = dgram.createSocket("udp4");
    this.pollingIntervalForFans = 1000;
    this.dispatchForFans = {}
    this.numberOfExpectedFans = numberOfExpectedFans ? numberOfExpectedFans : 1;
    this.theAllFan = new BigAssFan("ALL", "ALL", this.everyone, this); // If you wanted to broadcast to everyone

    this.onFanConnection = function () {}; // Callback you can register for
    this.onFanFullyUpdated = function () {}; // Callback you can register for

    this.broadcastToFans = function(message) {
        this.sendRaw("<ALL;" + message + ">", this.everyone);
    }.bind(this);

    this.sendRaw = function(message, address) {
        myLogWrapper("Sending: " + message);
        var buffMessage = new Buffer(message);
        this.server.send(buffMessage, 0, buffMessage.length, this.fanPort, address);
    }.bind(this);

    this.rescanForFans = function(){
        this.broadcastToFans("DEVICE;ID;GET");
    }.bind(this)

    this.rescanUntilAllFans = function(){
        var pollForFans = function() {
            if (Object.keys(this.allFans).length < this.numberOfExpectedFans) {
                this.rescanForFans();
            } else {
                clearInterval(id);
            }
        }.bind(this);
        var id = setInterval(pollForFans, this.pollingIntervalForFans);
        pollForFans();
    }.bind(this)

    this.server.on('close', function(msg, rinfo) {
        this.connectionOpen = false;
    }.bind(this));

    handleNewFan = function(msg, address) {
        if (msg[0] == "ALL") {
            return; // Message not addressed to us
        }
        var deviceType = msg[4].split(",",1); // Grab first part of string before ","
        if (deviceType == "FAN") {
            var newFan = new BigAssFan(msg[0], msg[3], address, this);
            this.allFans[msg[0]] = newFan;
            this.onFanConnection(newFan);
            newFan.updateAll(function() {
                this.onFanFullyUpdated(newFan)
            }.bind(this));
        } else if (deviceType == "SWITCH") {
            myLogWrapper("Skipping wall control - TODO : Add support for wall control")
        } else {
            myLogWrapper("Received message from unknown fan - rescanning");
            this.rescanForFans();
        }
    }.bind(this)

    this.server.on("message", (function (msg, rinfo) {
        myLogWrapper("server got: " + msg + " from " + rinfo.address + ":" + rinfo.port);
        var splitMessage = ("" + msg).replace(/<|>|\(|\)/g, "").split(";");
        var fanId = splitMessage.shift();
        if (this.dispatchForFans[fanId]) {
            this.dispatchForFans[fanId](splitMessage);
        } else {
            splitMessage.unshift(fanId)
            handleNewFan(splitMessage, rinfo.address);
        }
    }).bind(this));

    this.server.bind(this.fanPort, (function () {
        this.server.setBroadcast(true);
        this.connectionOpen = true;
        this.rescanUntilAllFans();
    }).bind(this));
}

function BigAssProperty (name, bigAssFan) {
    this.name = name;
    this.bigAssFan = bigAssFan;

    this.allFieldsUpdateQuery = {}
    this.updateCallbacks = {}

    this.setFunctions = {}

    this.createGetField = function(name, query, isSettable, additionalProp, trueOpt, falseOpt, optionalFilter) {
        var toSendOnUpdate = query.concat("GET");
        toSendOnUpdate = additionalProp ? toSendOnUpdate.concat(additionalProp) : toSendOnUpdate;
        this.allFieldsUpdateQuery[name] = toSendOnUpdate;
        this.updateCallbacks[name] = {};

        var privateVarName = '_' + name;
        this[privateVarName] = undefined;

        var setFunction = function(value, optionalCallback) {
            // TODO ensure that value fits in "filter"
            if (typeof value == "boolean" && trueOpt && falseOpt) {
                value = value ? trueOpt : falseOpt;
            }
            var successfullyUpdated = false;
            var updateTableId = this.registerUpdateCallback(name, function() {
                successfullyUpdated = true;
                if (optionalCallback) {
                    optionalCallback(null);
                    optionalCallback = null;
                }
                this.unregisterUpdateCallback(name, updateTableId);
            }.bind(this))

            var toSetProperty = function () {
                this.bigAssFan.send(query.concat("SET", value))
            }.bind(this)

            var isSuccesfullyUpdated = function() {
                return successfullyUpdated;
            }

            var isRetriesAllFailed = function() {
                if (optionalCallback) {
                    optionalCallback(new Error("Failed to set property"));
                    optionalCallback = null; // TODO: Figure out why this is getting called twice in the first place
                                             // Espeicially this this fix can still crash
                }
            }

            retryCall(this.bigAssFan.maxRetries, this.bigAssFan.waitTimeOnRetry, toSetProperty, isSuccesfullyUpdated, isRetriesAllFailed);

        }.bind(this)

        this.setFunctions[name] = setFunction;

        Object.defineProperty(this, name, {
            get: function() {
                    return this[privateVarName];
                },
            set: isSettable ? setFunction : undefined
        });

        var handleUpdatedValue = function(value) {
            if (trueOpt) {
                this[privateVarName] = (value == trueOpt) ? true : (value == falseOpt || falseOpt == undefined ? false : value);
            } else {
                this[privateVarName] = value;
            }
            if (this.bigAssFan.onPropertyUpdate) {
                this.bigAssFan.onPropertyUpdate([this.name, name], value);
            }
            for (var key in this.updateCallbacks[name]) {
                this.updateCallbacks[name][key](value);
            }
        }.bind(this)

        var expectedRecieve = additionalProp ? query.concat(additionalProp) : query;
        this.bigAssFan.propertyListeners[this.name + "." + name] = [expectedRecieve, handleUpdatedValue];

    }.bind(this)

    /**
     * Set a specific property by name
     * @param name     - Property name to set
     * @param value    - Value to set to this property
     * @param callback - Optional callback, null if success, error otherwise
     */
    this.setProperty = function(name, value, callback) {
        var thisSetFunction = this.setFunctions[name]
        if (thisSetFunction) {
            thisSetFunction(value, callback)
        }
    }.bind(this);

    /**
     * Register an update callback
     * @param name     - Property name to register for a callback on
     * @param callback - Callback, first arg is error (null if none), second is value
     */
    this.update = function(name, callback) {
        var updated = false;
        var id = this.registerUpdateCallback(name, function (value){
            updated = true;
            this.unregisterUpdateCallback(name, id);
            if (callback) {
                callback(null, value);
            }
        }.bind(this));

        var functionToRequestUpdate = function() {
            this.bigAssFan.send(this.allFieldsUpdateQuery[name]);
        }.bind(this)

        var isUpdateSucceeded = function() { return updated; }

        var updateFailed = function() {
            if (callback) {
                callback(new Error("Cannot reach fan / property"), null);
            }
        }

        retryCall(this.bigAssFan.maxRetries, this.bigAssFan.waitTimeOnRetry, functionToRequestUpdate, isUpdateSucceeded, updateFailed);
    }.bind(this)

    this.updateAll = function(callback) {
        var syncCallback = syncingCallback(this.allFieldsUpdateQuery, callback);
        for (var fieldKey in this.allFieldsUpdateQuery) {
            this.update(fieldKey, syncCallback);
        }
    }.bind(this)

    this.registerUpdateCallback = function(name, callback) {
        do {
            possibleKey = Math.random()
        } while (this.updateCallbacks[name][possibleKey] != undefined);
        this.updateCallbacks[name][possibleKey] = callback;
        return possibleKey;
    }.bind(this)

    this.unregisterUpdateCallback = function(name, identifier) {
        if (this.updateCallbacks[name][identifier]) {
            delete this.updateCallbacks[name][identifier];
            return true
        }
        return false
    }.bind(this)

    this.bigAssFan.propertyTable[name] = this;
}

/**
 * Each Big ass fan has a set of properties which in turn have fields
 */
function BigAssFan (name, id, address, master) {
    this.name = name;
    this.id = id ? id : name; // Use the name as the backup if no ID is available
    this.address = address;
    this.master = master;
    this.onPropertyUpdate = undefined;

    this.propertyTable = {};
    this.propertyListeners = [];
    this.maxRetries = 10;        // For properties
    this.waitTimeOnRetry = 250;  // For properties - in ms

    this.fan = new BigAssProperty('fan', this);
    this.fan.createGetField('isOn', ['FAN', 'PWR'], true, undefined, "ON", "OFF");
    this.fan.createGetField('speed', ['FAN', 'SPD'], true, 'ACTUAL'); // 0-7 on most fans - can also read min/max 
    this.fan.createGetField('min', ['FAN', 'SPD'], true, 'MIN');
    this.fan.createGetField('max', ['FAN', 'SPD'], true, 'MAX');
    this.fan.createGetField('auto', ['FAN', 'AUTO'], true, undefined, "ON", "OFF"); // Fan sensor enabled
    this.fan.createGetField('whoosh', ['FAN', 'WHOOSH'], true, "STATUS"); // ON, OFF
    this.fan.createGetField('isSpinningForwards', ['FAN', 'DIR'], true, undefined, "FWD", "REV");

    this.light = new BigAssProperty('light', this);
    this.light.createGetField('brightness', ['LIGHT', 'LEVEL'], true, 'ACTUAL'); // 0-16
    this.light.createGetField('min', ['LIGHT', 'LEVEL'], true, 'MIN');
    this.light.createGetField('max', ['LIGHT', 'LEVEL'], true, 'MAX');
    this.light.createGetField('auto', ['LIGHT', 'AUTO'], true, undefined, 'ON', 'OFF'); // Light sensor enabled
    this.light.createGetField('exists', ['DEVICE', 'LIGHT'], false, undefined, "PRESENT"); // Unknown false string.. WAY too lazy to unplug from fan

    this.sensor = new BigAssProperty('sensor', this);
    this.sensor.createGetField('isOccupied', ['SNSROCC', 'STATUS'], false, undefined, 'OCCUPIED', 'UNOCCUPIED');
    this.sensor.createGetField('minTimeout', ['SNSROCC', 'TIMEOUT'], true, 'MIN'); // Seconds (ie 3600000 is 60 min)
    this.sensor.createGetField('maxTimeout', ['SNSROCC', 'TIMEOUT'], true, 'MAX'); // Seconds
    this.sensor.createGetField('timeout', ['SNSROCC', 'TIMEOUT'], true, 'CURR');   // Seconds

    this.smartmode = new BigAssProperty('smartmode', this);
    this.smartmode.createGetField('smartmodeactual', ['SMARTMODE', 'ACTUAL'], true, undefined, 'OFF', 'COOLING', 'HEATING'); // Heating smartmode invokes LEARN;STATE;OFF and FAN;PWR;ON and FAN;SPD;ACTUAL;1 and WINTERMODE;STATE;ON and SMARTMODE;STATE;HEATING and SMARTMODE;ACTUAL;HEATING
    this.smartmode.createGetField('smartmodestate', ['SMARTMODE', 'STATE'], true, undefined, 'LEARN', 'COOLING', 'HEATING', 'FOLLOWSTAT'); // FOLLOWSTAT is the works with nest option, it is followed by SMARTMODE;ACTUAL;OFF command

    this.learn = new BigAssProperty('learn', this);
    this.learn.createGetField('isOn', ['LEARN', 'STATE'], true, undefined, 'LEARN', 'OFF'); // LEARN appears to be the on command rather than ON, ie LEARN;STATE;LEARN. When turned on, two or three commands follow, WINTERMODE;STATE;OFF and SMARTMODE;STATE;COOLING and SMARTMODE;ACTUAL;COOLING
    this.learn.createGetField('minSpeed', ['LEARN', 'MINSPEED'], true);
    this.learn.createGetField('maxSpeed', ['LEARN', 'MAXSPEED'], true);
    this.learn.createGetField('zeroTemp', ['LEARN', 'ZEROTEMP'], true); // This is a four digit number that represents the temperature in celsius (without a decimal) at which the fan automatically turns off in smart mode. For instance '2111' is 21.11 C which is 70 F 

    this.sleep = new BigAssProperty('sleep', this);
    this.sleep.createGetField('isOn', ['SLEEP', 'STATE'], true, undefined, 'ON', 'OFF');
    this.sleep.createGetField('smartIdealTemp', ['SMARTSLEEP', 'IDEALTEMP'], true);
    this.sleep.createGetField('minSpeed', ['SMARTSLEEP', 'MINSPEED'], true);
    this.sleep.createGetField('maxSpeed', ['SMARTSLEEP', 'MAXSPEED'], true);

    this.device = new BigAssProperty('device', this);
    this.device.createGetField('beeper', ['DEVICE', 'BEEPER'], true, undefined, 'ON', 'OFF');
    this.device.createGetField('indicators', ['DEVICE', 'INDICATORS'], true, undefined, 'ON', 'OFF');
    this.device.createGetField('winterMode', ['WINTERMODE', 'STATE'], true, undefined, 'ON', 'OFF');
    this.device.createGetField('height', ['WINTERMODE', 'HEIGHT'], true); // This is a whole number in meters, like 274 for 9 ft, 244 for 8 ft etc
    this.device.createGetField('token', ['NW', 'TOKEN'], false); // ??? token for what? reference to api.bigassfans.com in packets
    this.device.createGetField('dhcp', ['NW', 'DHCP'], true, undefined, 'ON', 'OFF');
    this.device.createGetField('fw', ['FW', 'FW000003'], false); // What is the FW000003 for in the query?
    this.device.createGetField('broadcastSSID', ['NW', 'SSID'], true);
    this.device.createGetField('isAccessPoint', ['NW', 'AP'], true, 'STATUS', 'ON', 'OFF');


    // Handles incoming messages from the fanMaster
    // Property listners are an array of two values
    //   - (1) : Array of property names to match on response
    //   - (2) : Callback to run
    this.handleMessage = function(message) {
        for (var key in this.propertyListeners) {
            var propertyListener = this.propertyListeners[key]
            if (!message || message.length < propertyListener[0].length) {
                continue;
            }
            var isSubset = true;
            for (var i = 0; i < propertyListener[0].length; i++) {
                if (propertyListener[0][i] != message[i]) {
                    isSubset = false;
                    break;
                }
            };
            if (isSubset) {
                propertyListener[1](message[i]);
            }
        }
    }.bind(this)

    this.master.dispatchForFans[name] = this.handleMessage;
    this.master.dispatchForFans[id] = this.handleMessage;

    this.updateAll = function(callback) {
        var syncCallback = syncingCallback(this.propertyTable, callback);
        for (var propertyKey in this.propertyTable) {
            this.propertyTable[propertyKey].updateAll(syncCallback);
        }
    }.bind(this)

    this.update = function(property, callback) {
        this[property].updateAll(callback)
    }.bind(this)

    this.send = function(msg) {
        var toSend = [this.id].concat(msg).join(";");
        this.master.sendRaw("<" + toSend + ">", address);
    }.bind(this)
}

/******************************
 * Below are Utility functions
 * TODO: Move to seperate file?
 ******************************/

/**
 * This function supplies a callback which can be called
 * N times, where N is the number of elements in 
 * tableBeingUpdated. Once this supplied callback has been
 * called these N times it will call the passed in callback
 */
function syncingCallback (tableBeingUpdated, callback) {
    var callCount = 0;
    var lengthOfTable = Object.keys(tableBeingUpdated).length;

    var callbackForUser = function() {
        if (++callCount == lengthOfTable) {
            callback();
        }
    }

    return callback ? callbackForUser : undefined;
}

/**
 * Will retry a given call until success or failure
 *
 * @param maxRetries      - Maximum number of retries
 * @param waitTimeOnRetry - Time between each retry
 * @param toCall          - Function to call as a part of each retry
 * @param isSuccess       - Function to call to check if retry was successful (Returns true/false)
 * @param isFailure       - Function to call if all retries were a failure
 */
var retryCall = function(maxRetries, waitTimeOnRetry, toCall, isSuccess, isFailure) {
    var tried = 0;
    var retry = function() {
        if (!isSuccess()) {
            if (++tried >= maxRetries) {
                myLogWrapper("Failed - no more retries left");
                clearInterval(id);
                isFailure();
            } else {
                myLogWrapper("Failed - retrying : " + tried);
                toCall();
            }
        } else {
            clearInterval(id);
        }
    }.bind(this.bigAssFan);
    var id = setInterval(retry, waitTimeOnRetry);
    toCall();
}

/**
 * Simple logging wrapper so that logging can be turned on/off
 */
var myLogWrapper = function(msg) {
    if (exports.logging) {
        console.log(msg)
    }
};

exports.FanMaster = FanMaster;
exports.BigAssFan = BigAssFan;
exports.logging = false;

