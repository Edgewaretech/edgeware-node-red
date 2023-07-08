"use strict";
const { DateTime } = require("luxon");
const { v4: uuidv4 } = require("uuid");
const MANUFACTURER_DATA_CODE = "FF";
const MOKO = "moko";
const ENERGY = "energy";
const AMBIENT = "ambient";
const SWITCH_ON_CMD = "switchOn";
const SWITCH_OFF_CMD = "switchOff";
const writeCharHandle = "0019";
const notifyCharHandle = "0019";
const PLUG_116B = "plug-116B";
const PLUG_114B = "plug-114B";
const H4 = "H4";

function decodeMokoAdvData(model, name, address, advData) {
  let timestamp = DateTime.now().toISO();
  let manufacturerData = advData[MANUFACTURER_DATA_CODE];
  switch (model) {
    case PLUG_116B:
      if (!manufacturerData) {
        return;
      } else {
        let adv = Buffer.from(manufacturerData, "hex");
        let voltage = adv.slice(4, 6).readUInt16BE() / 10.0;
        let current = adv.slice(6, 10).readUInt32BE();
        let power = adv.slice(10, 14).readUInt32BE() / 10.0;
        let meter =
          Buffer.concat([Buffer.alloc(1), adv.slice(14, 17)]).readUInt32BE() /
          100.0;
        let statusByte = adv.slice(17, 18).readUInt8();
        let loaded = Number((statusByte & 128) == 128);
        let overloaded = Number((statusByte & 64) == 64);
        let switchedOn = Number((statusByte & 32) == 32);
        let fields = {
          voltage,
          current,
          power,
          meter,
          loaded,
          overloaded,
          switchedOn,
        };
        return {
          measurement: ENERGY,
          fields,
          tags: { make: MOKO, model, name, address },
          timestamp,
        };
      }

    case PLUG_114B:
      if (!manufacturerData) {
        return;
      } else {
        let adv = Buffer.from(manufacturerData, "hex");
        let voltage = adv.slice(4, 6).readUInt16BE() / 10.0;
        let current = Buffer.concat([
          Buffer.alloc(1),
          adv.slice(6, 9),
        ]).readUInt32BE();
        let power = adv.slice(9, 11).readUInt16BE() / 10.0;
        let meter =
          Buffer.concat([Buffer.alloc(1), adv.slice(11, 14)]).readUInt32BE() /
          100.0;
        let fields = { voltage, current, power, meter };
        return {
          measurement: ENERGY,
          fields,
          tags: { make: MOKO, model, name, address },
          timestamp,
        };
      }

    case H4:
      let data = advData["16"];
      if (!data) {
        return;
      } else {
        let adv = Buffer.from(data, "hex");
        if (data[4] === "7") {
          let temperature = adv.slice(5, 7).readInt16BE() / 10.0;
          let humidity = adv.slice(7, 9).readUInt16BE() / 10.0;
          let batteryVol = adv.slice(9, 11).readUInt16BE();
          let fields = { temperature, humidity, batteryVol };
          return {
            measurement: AMBIENT,
            fields,
            tags: { make: MOKO, model, name, address },
            timestamp,
          };
        }
      }
  }
}

function decodeMokoBlePayload(payload, address, correlationData) {
  let { statusCode, result, timestamp } = payload;
  if (timestamp) {
    timestamp = DateTime.fromMillis(timestamp).toISO();
  }

  if (statusCode >= 400) {
    return { ...payload, timestamp };
  }
  if (result.notifications?.length == 1) {
    switch (result.notifications[0].toUpperCase()) {
      case "B3030100":
        return { statusCode, address, timestamp, correlationData };
      case "B3030101":
        return {
          statusCode: 500,
          reason: "Switch on/off unsuccessfull",
          address,
          timestamp,
          correlationData,
        };
    }
  } else {
    return {
      statusCode: 500,
      reason: "No notifications received",
      address,
      timestamp,
      correlationData,
    };
  }
}

function getMokoBleMessage(address, command, args) {
  switch (command) {
    case SWITCH_ON_CMD: {
      return {
        ...args,
        address,
        writeCharHandle,
        notifyCharHandle,
        writeData: "b2030101",
        maxNotifications: 1,
      };
    }
    case SWITCH_OFF_CMD: {
      return {
        ...args,
        address,
        writeCharHandle,
        notifyCharHandle,
        writeData: "b2030100",
        maxNotifications: 1,
      };
    }
  }
}

module.exports = {
  decodeMokoAdvData,
  decodeMokoBlePayload,
  getMokoBleMessage,
  PLUG_116B,
  PLUG_114B,
};
