const fs = require('fs');
let code = fs.readFileSync('src/routes/admin.import.tsx', 'utf-8');

const oldCode = `      // Still allow the legacy structured parser if it's in the old [SECTION] format
      // but prefer the field=value standard
      const parsed = inputText.includes("[GAME]")
        ? parseGameData(inputText)
        : { data: parsedImport.data, errors: parsedImport.errors.map((e) => e.message) };`;

const newCode = `      // Still allow the legacy structured parser if it's in the old [SECTION] format
      // but prefer the field=value standard
      let parsed;
      if (inputText.includes("[GAME]")) {
        parsed = parseGameData(inputText);
      } else {
        // Map the new flat format to the legacy nested format expected by validateGameData and mapper.ts
        const flat = parsedImport.data;
        const legacyData = {
          IMPORT: { schema_version: 1 },
          GAME: {
            name: flat.title || flat.name,
            platform: flat.platform,
            release_status: flat.release_status || "RELEASED",
            edition: flat.edition,
            region: flat.region,
            publisher: flat.publisher,
            developer: flat.developer,
            release_date: flat.release_date,
            game_is_offline: flat.game_is_offline,
            game_is_online: flat.game_is_online,
            game_language_locked: flat.game_language_locked,
          },
          DESCRIPTION: {
            full: flat.description_en,
            ar: flat.description_ar,
            short: flat.description_short,
          },
          MEDIA: {
            box_front_url: flat.cover_front_url || flat.box_front_url,
            box_back_url: flat.cover_back_url || flat.box_back_url,
            trailer_url: flat.trailer_url,
          },
          TECHNICAL: {
            nsuid: flat.nsuid,
            title_id: flat.title_id,
            product_code: flat.product_code,
          }
        };
        parsed = { data: legacyData, errors: parsedImport.errors.map((e) => e.message) };
      }`;

code = code.replace(oldCode, newCode);
fs.writeFileSync('src/routes/admin.import.tsx', code);
