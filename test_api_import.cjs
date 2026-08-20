const http = require("http");

const data = JSON.stringify({
  mode: "create",
  data: {
    IMPORT: { schema_version: 1 },
    GAME: {
      name: "Test Game XYZ 123",
      platform: "Nintendo Switch",
      release_status: "RELEASED",
    },
  },
});

const options = {
  hostname: "localhost",
  port: 3000,
  path: "/api/admin/import-game",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": data.length,
  },
};

const req = http.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => (body += chunk));
  res.on("end", () => {
    console.log("STATUS:", res.statusCode);
    console.log("BODY:", body);
  });
});

req.on("error", (e) => {
  console.error(e);
});

req.write(data);
req.end();
