"use strict";
const { DateTime } = require("luxon");
const GET_LOG = "getLog";
const MANUFACTURER_DATA_CODE = "FF";
const RUUVI = "ruuvi";
const AMBIENT = "ambient";

function decodeRuuviAdvData(model, name, address, advData) {
  let timestamp = DateTime.now().toISO();
  if (!advData?.[MANUFACTURER_DATA_CODE]) {
    return null;
  }
  let adv = Buffer.from(advData[MANUFACTURER_DATA_CODE], "hex");
  let temperature = getTemp(adv);
  let humidity = getHumidity(adv);
  let pressure = getPressure(adv);
  let accelX = getAccelX(adv);
  let accelY = getAccelY(adv);
  let accelZ = getAccelZ(adv);
  let batteryVol = getBatteryVoltage(adv);
  let moveCounter = getMoveCounter(adv);
  let fields = {
    temperature,
    humidity,
    pressure,
    accelX,
    accelY,
    accelZ,
    batteryVol,
    moveCounter,
  };
  return {
    measurement: AMBIENT,
    fields,
    tags: { make: RUUVI, model, name, address },
    timestamp,
  };
}

function decodeRuuviBlePayload(command, args, payload, peripheral) {
  let { measurementName, name, tags } = peripheral;
  let { statusCode, result, address, timestamp, corrId } = payload;
  if (statusCode >= 400) {
    return payload;
  }
  switch (command) {
    case GET_LOG:
      if (result.notifications?.length > 0) {
        let measurements = [];
        for (let notification of result.notifications) {
          let v = decodeLogEntry(notification);
          if (v) {
            let fields = {};
            let measurement = { measurement: measurementName };
            for (let prop in v) {
              if (prop === "timestamp") {
                measurement.timestamp = v[prop];
              } else {
                fields[prop] = v[prop];
              }
            }
            measurement.fields = fields;
            measurement.tags = { ...tags, address, name, make: RUUVI };
            measurements.push(measurement);
          }
        }
        if (measurements.length > 0) {
          return { statusCode: 200, measurements, address, timestamp, corrId };
        }
      }
      return {
        statusCode: 404,
        reason: "No log data received",
        address,
        timestamp,
        corrId,
      };
  }
  return { statusCode: 400, reason: "Bad request", address, timestamp, corrId };
}

function decodeLogEntry(notification) {
  let buffer = Buffer.from(notification, "hex");
  let timestamp = DateTime.fromSeconds(buffer.readUInt32BE(3)).toISO();
  switch (notification.slice(0, 6).toUpperCase()) {
    case "3A3010":
      let temperature = buffer.readInt32BE(7) / 100.0;
      return { timestamp, temperature };
    case "3A3110":
      let humidity = buffer.readInt32BE(7) / 100.0;
      return { timestamp, humidity };
    case "3A3210":
      let pressure = buffer.readInt32BE(7) / 100.0;
      return { timestamp, pressure };
  }
}

function getRuuviBleMessage(peripheral, command, args, bleAdapter) {
  switch (command) {
    case GET_ADV_CMD:
    case GET_RSSI_CMD:
      return {
        command,
        args: { address: peripheral.address },
        bleAdapter: "*",
      };
    case GET_LOG: {
      if (typeof args?.interval !== "number" || bleAdapter === undefined) {
        return;
      }
      let now = DateTime.utc().toSeconds();
      let interval = args.interval;
      let start = now - interval;
      let buffer = Buffer.alloc(8);
      buffer.writeUInt32BE(now);
      buffer.writeUInt32BE(start, 4);
      let writeData = "3a3a11" + buffer.toString("hex");
      const bleArgs = {
        address: peripheral.address,
        writeCharHandle: "0019",
        notifyCharHandle: "001b",
        writeData,
        waitNotificationsMs: args?.waitNotificationsMs,
        waitConnectMs: args?.waitConnectMs,
        lastNotification: "3a3a10ffffffffffffffff",
      };
      return { command: GET_NOTI_CMD, args: bleArgs, bleAdapter };
    }
  }
}

function getTemp(buffer) {
  let value = buffer.slice(3, 5).readInt16BE();
  if (value == 0x8000) {
    return undefined;
  } else {
    return value * 0.005;
  }
}

function getHumidity(buffer) {
  let value = buffer.slice(5, 7).readUInt16BE();
  if (value == 0xffff) {
    return undefined;
  } else {
    return value * 0.0025;
  }
}

function getPressure(buffer) {
  let value = buffer.slice(7, 9).readUInt16BE();
  if (value == 0xffff) {
    return undefined;
  } else {
    return (value + 50000.0) / 100.0;
  }
}

function getAccelX(buffer) {
  let value = buffer.slice(9, 11).readInt16BE();
  if (value == 0x8000) {
    return undefined;
  } else {
    return value;
  }
}

function getAccelY(buffer) {
  let value = buffer.slice(11, 13).readInt16BE();
  if (value == 0x8000) {
    return undefined;
  } else {
    return value;
  }
}

function getAccelZ(buffer) {
  let value = buffer.slice(13, 15).readInt16BE();
  if (value == 0x8000) {
    return undefined;
  } else {
    return value;
  }
}

function getBatteryVoltage(buffer) {
  let value = buffer.slice(15, 17).readUInt16BE() >> 5;
  if (value == 0x2047) {
    return undefined;
  } else {
    return value + 1600;
  }
}

function getMoveCounter(buffer) {
  let value = buffer[17];
  if (value == 0xff) {
    return undefined;
  } else {
    return value;
  }
}

module.exports = {
  decodeRuuviAdvData,
  getRuuviBleMessage,
  decodeRuuviBlePayload,
};
