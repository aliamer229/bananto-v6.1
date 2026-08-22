const fs = require("fs");
const http = require("https");

http.get("https://assets.banan.to/Pages/Glb/SwitchCase.glb", (res) => {
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => {
    const buffer = Buffer.concat(chunks);
    fs.writeFileSync("SwitchCase.glb", buffer);
    console.log("Downloaded, checking length:", buffer.length);
  });
});
