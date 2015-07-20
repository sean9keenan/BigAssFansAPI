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
        if (msg[1] == "DEVICE" && msg[2] == "ID") {
            var newFan = new BigAssFan(msg[0], msg[3], address, this);
            this.allFans[msg[0]] = newFan;
            this.onFanConnection(newFan);
            newFan.updateAll(function() {
                this.onFanFullyUpdated(newFan)
            }.bind(this));
        } else {
            myLogWrapper("Recieved message from unknown fan - rescanning");
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

    this.createGetField = function(name, query, isSettable, additionalProp, trueOpt, falseOpt, optionalFilter) {
        var toSendOnUpdate = query.concat("GET");
        toSendOnUpdate = additionalProp ? toSendOnUpdate.concat(additionalProp) : toSendOnUpdate;
        this.allFieldsUpdateQuery[name] = toSendOnUpdate;
        this.updateCallbacks[name] = {};

        var privateVarName = '_' + name;
        this[privateVarName] = undefined;

        var setFunction = function(value) {
            // TODO ensure that value fits in "filter"
            if (typeof value == "boolean" && trueOpt && falseOpt) {
                value = value ? trueOpt : falseOpt;
            }
            var successfullyUpdated = false;
            var updateTableId = this.registerUpdateCallback(name, function() {
                successfullyUpdated = true;
                this.unregisterUpdateCallback(updateTableId);
            }.bind(this))

            var toSetProperty = function () {
                this.bigAssFan.send(query.concat("SET", value))
            }.bind(this)

            retryCall(this.bigAssFan.maxRetries, this.bigAssFan.waitTimeOnRetry, toSetProperty, function (){
                return successfullyUpdated;
            });

        }.bind(this)

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

    this.update = function(name, callback) {
        var updated = false;
        var id = this.registerUpdateCallback(name, function (){
            updated = true;
            this.unregisterUpdateCallback(id);
            if (callback) {
                callback();
            }
        }.bind(this));

        retryCall(this.bigAssFan.maxRetries, this.bigAssFan.waitTimeOnRetry, function() {
            this.bigAssFan.send(this.allFieldsUpdateQuery[name]);
        }.bind(this), function (){
            return updated;
        });
    }.bind(this)

    this.updateAll = function(callback) {
        var syncCallback = new syncingCallback(this.allFieldsUpdateQuery, callback);
        for (var fieldKey in this.allFieldsUpdateQuery) {
            this.update(fieldKey, syncCallback.callbackToUse);
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
        // return delete this.updateCallbacks[name][identifier];
    }.bind(this)

    this.bigAssFan.propertyTable[name] = this;
}

function BigAssFan (name, id, address, master) {
    this.name = name;
    this.id = id;
    this.address = address;
    this.master = master;
    this.onPropertyUpdate = undefined;

    this.propertyTable = {};
    this.propertyListeners = [];
    this.maxRetries = 10;        // For properties
    this.waitTimeOnRetry = 250;  // For properties - in ms

    this.fan = new BigAssProperty('fan', this);
    this.fan.createGetField('isOn', ['FAN', 'PWR'], true, undefined, "ON", "OFF");
    this.fan.createGetField('speed', ['FAN', 'SPD'], true, 'CURR');
    this.fan.createGetField('min', ['FAN', 'SPD'], true, 'MIN');
    this.fan.createGetField('max', ['FAN', 'SPD'], true, 'MAX');
    this.fan.createGetField('auto', ['FAN', 'AUTO'], true, undefined);
    this.fan.createGetField('whoosh', ['FAN', 'WHOOSH'], true, "STATUS");
    this.fan.createGetField('isSpinningForwards', ['FAN', 'DIR'], true, undefined, "FWD", "BKW"); // TODO: Check backwards string...

    this.light = new BigAssProperty('light', this);
    this.light.createGetField('brightness', ['LIGHT', 'LEVEL'], true, 'CURR');
    this.light.createGetField('min', ['LIGHT', 'LEVEL'], true, 'MIN');
    this.light.createGetField('max', ['LIGHT', 'LEVEL'], true, 'MAX');
    this.light.createGetField('auto', ['LIGHT', 'AUTO'], true, undefined);
    this.light.createGetField('exists', ['DEVICE', 'LIGHT'], false, undefined, "PRESENT"); // Unknown false string.. WAY too lazy to unplug from fan

    this.sensor = new BigAssProperty('room', this);
    this.sensor.createGetField('isOccupied', ['SNSROCC', 'STATUS'], false, undefined, 'OCCUPIED', 'UNOCCUPIED');
    this.sensor.createGetField('minTimeout', ['SNSROCC', 'TIMEOUT'], true, 'MIN');
    this.sensor.createGetField('maxTimeout', ['SNSROCC', 'TIMEOUT'], true, 'MAX');
    this.sensor.createGetField('timeout', ['SNSROCC', 'TIMEOUT'], true, 'CURR');

    this.learn = new BigAssProperty('learn', this);
    this.learn.createGetField('isOn', ['LEARN', 'STATE'], false, undefined, 'ON', 'OFF');
    this.learn.createGetField('minSpeed', ['LEARN', 'MINSPEED'], true);
    this.learn.createGetField('maxSpeed', ['LEARN', 'MAXSPEED'], true);
    this.learn.createGetField('zeroTemp', ['LEARN', 'ZEROTEMP'], true); // ??? Wat.

    this.sleep = new BigAssProperty('sleep', this);
    this.sleep.createGetField('isOn', ['SLEEP', 'STATE'], true, undefined, 'ON', 'OFF');
    this.sleep.createGetField('smartIdealTemp', ['SMARTSLEEP', 'IDEALTEMP'], true);
    this.sleep.createGetField('minSpeed', ['SMARTSLEEP', 'MINSPEED'], true);
    this.sleep.createGetField('maxSpeed', ['SMARTSLEEP', 'MAXSPEED'], true);

    this.device = new BigAssProperty('device', this);
    this.device.createGetField('beeper', ['DEVICE', 'BEEPER'], true, undefined, 'ON', 'OFF');
    this.device.createGetField('indicators', ['DEVICE', 'INDICATORS'], true, undefined, 'ON', 'OFF');
    this.device.createGetField('winterMode', ['WINTERMODE', 'STATE'], true, undefined, 'ON', 'OFF');
    this.device.createGetField('height', ['WINTERMODE', 'HEIGHT'], true);
    this.device.createGetField('token', ['NW', 'TOKEN'], false); // ??? token for what? reference to api.bigassfans.com in packets
    this.device.createGetField('dhcp', ['NW', 'DHCP'], true, undefined, 'ON', 'OFF');
    this.device.createGetField('fw', ['FW', 'FW000003'], false); // What is the FW000003 for?
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
        var syncCallback = new syncingCallback(this.propertyTable, callback);
        for (var propertyKey in this.propertyTable) {
            this.propertyTable[propertyKey].updateAll(syncCallback.callbackToUse);
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

function syncingCallback (tableBeingUpdated, callback) {
    this.callCount = 0;
    this.lengthOfTable = Object.keys(tableBeingUpdated).length;

    var callbackForUser = function() {
        if (++this.callCount == this.lengthOfTable) {
            callback();
        }
    }.bind(this)
    this.callbackToUse = callback ? callbackForUser : undefined;
}

var retryCall = function(maxRetries, waitTimeOnRetry, toCall, isSuccess) {
    var tried = 0;
    var retry = function() {
        if (!isSuccess()) {
            if (++tried >= maxRetries) {
                myLogWrapper("Failed - no more retries left");
                clearInterval(id);
            }
            myLogWrapper("Failed - retrying : " + tried);
            toCall();
        } else {
            clearInterval(id);
        }
    }.bind(this.bigAssFan);
    var id = setInterval(retry, waitTimeOnRetry);
    toCall();
}

var myLogWrapper = function(msg) {
    if (exports.logging) {
        console.log(msg)
    }
};

exports.FanMaster = FanMaster;
exports.logging = false;