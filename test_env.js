import { getEnv } from "./dist/server/index.mjs";
console.log(process.env.SESSION_SECRET ? "has session" : "no session");
