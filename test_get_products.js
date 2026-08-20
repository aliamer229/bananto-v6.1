import fs from "fs";
import { getStore } from "./src/lib/db.server.ts";

async function run() {
  const store = await getStore();
  console.log("Products count:", store.products?.length);
  const cb = store.products?.find((p) => p.titleEn?.includes("Cyberpunk"));
  if (cb) {
    console.log("Found Cyberpunk!", cb.id);
  } else {
    console.log("Not found.");
  }
}
run();
