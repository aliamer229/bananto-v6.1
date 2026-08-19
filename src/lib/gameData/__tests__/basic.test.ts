import { describe, expect, it } from "vitest";
import { parseGameData } from "../parser";
import { validateGameData } from "../validator";

const fixture = `
[IMPORT]
schema_version=1

[GAME]
name=Splatoon Raiders
platform=Nintendo Switch 2
release_status=released
metacritic_score=81

[GENRES]
1=Action
2=Shooter

[EDITIONS]
1.name=Standard
1.price_usd=49.99
2.name=Deluxe
2.price_usd=69.99
`;

describe("game data importer", () => {
  it("parses and validates a complete game fixture", () => {
    const parsed = parseGameData(fixture);
    expect(parsed.data["GAME"]).toBeDefined();
    expect(parsed.data["EDITIONS"]).toBeDefined();

    const validated = validateGameData(parsed.data);
    expect(validated.valid, JSON.stringify(validated.errors, null, 2)).toBe(true);
    expect(validated.data["GAME"]).toBeDefined();
    expect(validated.data["GENRES"]).toBeDefined();
    expect(validated.data["EDITIONS"]).toBeDefined();
  });
});
