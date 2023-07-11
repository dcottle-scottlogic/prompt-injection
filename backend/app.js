const express = require("express");
const router = require("./router");
const dotenv = require("dotenv");
const { initOpenAi } = require("./openai/openai");

dotenv.config();

// by default runs on port 3001
const port = process.env.PORT || 3001;

// Creating express server
const app = express();
// for parsing application/json
app.use(express.json());

// initialise openai
initOpenAi();

app.use("/", router);
app.listen(port, () => {
  console.log("Server is running on port: " + port);
});