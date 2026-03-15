const express = require("express");
const app = express();

app.use(express.json());

const createOrder = require("./api/create-order");
const webhook = require("./api/webhook");
const reloadOrders = require("./api/relograde-orders");

app.use("/api/create-order", createOrder.router);
app.use("/api/webhook", webhook);
app.use("/api/relograde-orders", reloadOrders);

app.use(express.static(__dirname));

const PORT = 3000;

app.listen(PORT, () => {
console.log("Server running on port " + PORT);
});
