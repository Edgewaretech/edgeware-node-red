"use strict";
const mqtt = require("mqtt");
const { decodeRuuviAdvData } = require("./ruuviCodec");
const BLE_ADV = "ble/adv";

module.exports = function (RED) {
  function RuuviNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.address = config.address;
    this.shortAddress = config.address.replace(/:/g, "").toLowerCase();
    this.name = config.name;
    this.model = config.model;
    const node = this;

    const client = mqtt.connect("mqtt://emqx", {
      clientId: `ruuvi_${node.shortAddress}$`,
      protocolVersion: 5,
    });
    const advTopic = `${BLE_ADV}/${node.shortAddress}`;

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
    });

    client.on("disconnect", function () {
      node.status({
        fill: "red",
        shape: "dot",
        text: "node-red:common.status.disconnected",
      });
      node.log("Disconnected");
    });

    client.on("message", function (topic, message) {
      let msg = JSON.parse(message.toString());
      switch (topic) {
        case advTopic:
          let rssi = msg.rssi;
          let advData = msg.advData;
          let decodedAdvData = decodeRuuviAdvData(
            node.model,
            node.name,
            node.address,
            advData
          );
          if (decodedAdvData) {
            let advMsg = { payload: { ...decodedAdvData, rssi } };
            node.send(advMsg);
          }
          break;
      }
    });

    this.on("close", function (removed, done) {
      if (removed) {
      } else {
      }
      client.end();
      node.log("Ruuvi client closed");
      done();
    });
  }
  RED.nodes.registerType("ruuvi", RuuviNode);
};
