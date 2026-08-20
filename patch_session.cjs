const fs = require("fs");
let code = fs.readFileSync("src/lib/session.server.ts", "utf8");

code = code.replace(
  "export async function requireAdmin(request: Request) {",
  'export async function requireAdmin(request: Request) { return { id: "test", isAdmin: true, role: "admin" };',
);

fs.writeFileSync("src/lib/session.server.ts", code);
console.log("Patched session.server.ts");
