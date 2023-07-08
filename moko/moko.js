"use strict";
const mqtt = require("mqtt");
const {
  decodeMokoAdvData,
  getMokoBleMessage,
  decodeMokoBlePayload,
  PLUG_116B,
  PLUG_114B,
} = require("./mokoCodec");
const BLE_ADV = "ble/adv";
const BLE_REQUESTS = "ble/requests";
const BLE_RESPONSES = "ble/responses";

module.exports = function (RED) {
  function MokoNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.address = config.address;
    this.shortAddress = config.address.replace(/:/g, "").toLowerCase();
    this.name = config.name;
    this.model = config.model;
    const node = this;

    const client = mqtt.connect("mqtt://ubuntu.local", {
      clientId: `moko_${node.shortAddress}$`,
      protocolVersion: 5,
    });
    const advTopic = `${BLE_ADV}/${node.shortAddress}`;
    const responseTopic = `${BLE_RESPONSES}/${node.shortAddress}`;
    const requestsTopic = `${BLE_REQUESTS}/${node.shortAddress}`;

    client.on("connect", function () {
      node.status({
        fill: "green",
        shape: "dot",
        text: "node-red:common.status.connected",
      });
      node.log("Connected");
      client.subscribe(advTopic, function (err) {
        if (!err) {
          node.log("Subscribed to adv");
        }
      });
      client.subscribe(responseTopic, function (err) {
        if (!err) {
          node.log("Subscribed to responses");
        }
      });
    });

    client.on("disconnect", function () {
      node.status({
        fill: "red",
        shape: "dot",
        text: "node-red:common.status.disconnected",
      });
      node.log("Disconnected");
    });

    client.on("message", function (topic, message, packet) {
      let msg = JSON.parse(message.toString());
      let correlationData =
        packet.properties?.correlationData?.toString() || "";
      switch (topic) {
        case advTopic:
          let rssi = msg.rssi;
          let advData = msg.advData;
          let decodedAdvData = decodeMokoAdvData(
            node.model,
            node.name,
            node.address,
            advData
          );
          if (decodedAdvData) {
            let advMsg = { payload: { ...decodedAdvData, rssi } };
            node.send([advMsg, null]);
          }
          break;
        case responseTopic:
          let decodedPayload = decodeMokoBlePayload(
            msg,
            node.address,
            correlationData
          );
          let response = { payload: decodedPayload };
          node.send([null, response]);
          break;
      }
    });

    this.on("input", function (msg, send, done) {
      send =
        send ||
        function () {
          node.send.apply(node, arguments);
        };

      if (node.model == PLUG_116B || node.model == PLUG_114B) {
        let request = getMokoBleMessage(node.address, msg.payload?.command);
        if (request) {
          let correlationData = msg.payload?.correlationData || "";
          let payloadFormatIndicator = true;
          let contentType = "application/json";
          client.publish(requestsTopic, JSON.stringify(request), {
            qos: 1,
            properties: {
              responseTopic,
              payloadFormatIndicator,
              contentType,
              correlationData,
            },
          });
        }
      }

      if (done) {
        done();
      }
    });

    this.on("close", function (removed, done) {
      if (removed) {
      } else {
      }
      client.end();
      done();
    });
  }
  RED.nodes.registerType("moko", MokoNode);
};
