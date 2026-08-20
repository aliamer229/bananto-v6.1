import fs from "fs";
import fetch from "node-fetch";

async function run() {
  const data = JSON.parse(fs.readFileSync('public/data.json', 'utf8') || "{}");
  // wait we can just call the endpoint.
}
