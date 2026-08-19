import { d1RunChanges, getD1, d1Ready, ensureOtpSchema } from "./src/lib/d1.server";
async function run() {
  if (await d1Ready()) {
    console.log("DB Ready");
  }
}
run();
