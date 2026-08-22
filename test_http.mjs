import http from "node:http";
const server = http.createServer((req, res) => {
  res.end("OK");
});
server.listen(3000);
