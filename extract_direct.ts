import { extractDetailedGameMetadata } from "./src/lib/game-intelligence.server";

async function run() {
  const name = "Splatoon Raiders";
  console.log(`[Script] Starting deep extraction for: ${name}`);

  try {
    const result = await extractDetailedGameMetadata(name);
    console.log("[Script] Extraction Result Received");
    console.log("[Script] Title:", result.title);
    console.log("[Script] SUCCESS");
  } catch (err: any) {
    console.error("[Script] FAILED:", err.message);
    process.exit(1);
  }
}

run();
