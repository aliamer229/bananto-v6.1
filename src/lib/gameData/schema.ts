export interface ImportConfig {
  schemaVersion: number;
}

export type FieldType = "string" | "number" | "boolean" | "date" | "url" | "array" | "object";

export interface FieldDef {
  type: FieldType;
  required?: boolean;
  min?: number;
  max?: number;
  isUrl?: boolean;
  itemFields?: Record<string, FieldDef>; // For arrays of objects
}

export interface Schema {
  sections: Record<string, Record<string, FieldDef>>;
}

export const GAME_SCHEMA: Schema = {
  sections: {
    IMPORT: {
      schema_version: { type: "number", required: true },
    },
    GAME: {
      name: { type: "string", required: true },
      platform: { type: "string", required: true },
      edition: { type: "string" },
      region: { type: "string" },
      publisher: { type: "string" },
      developer: { type: "string" },
      release_date: { type: "date" },
      release_status: { type: "string", required: true },
      price_usd: { type: "number" },
      metacritic_score: { type: "number", min: 0, max: 100 },
      opencritic_score: { type: "number", min: 0, max: 100 },
      user_score: { type: "number", min: 0, max: 10 },
      players_count: { type: "string" },
      game_size_gb: { type: "number" },
      game_is_offline: { type: "boolean" },
      game_is_online: { type: "boolean" },
      game_language_locked: { type: "boolean" },
      age_rating: { type: "string" },
      official_url: { type: "url" },
      eshop_url: { type: "url" },
    },
    DESCRIPTION: {
      short: { type: "string" },
      full: { type: "string" },
      ar: { type: "string" },
    },
    MEDIA: {
      box_front_url: { type: "url" },
      box_back_url: { type: "url" },
      trailer_url: { type: "url" },
    },
    TECHNICAL: {
      nsuid: { type: "string" },
      title_id: { type: "string" },
      product_code: { type: "string" },
    },
    GENRES: {
      "*": { type: "string" }, // Dynamic keys 1, 2, 3...
    },
    TYPES: {
      "*": { type: "string" },
    },
    NINTENDO: {
      official_store_url: { type: "url" },
      requires_nintendo_switch_online: { type: "boolean" },
      save_data_cloud: { type: "boolean" },
      game_key_card: { type: "boolean" },
      physical_download_required: { type: "boolean" },
      tv_mode: { type: "boolean" },
      tabletop_mode: { type: "boolean" },
      handheld_mode: { type: "boolean" },
      notes: { type: "string" },
    },
    SWITCH_2: {
      switch_2_exclusive: { type: "boolean" },
      switch_2_enhanced: { type: "boolean" },
      upgrade_price: { type: "number" },
      features: { type: "array" }, // Treated as line-separated or indexed
    },
    EDITIONS: {
      "*": {
        type: "object",
        itemFields: {
          name: { type: "string" },
          price_usd: { type: "number" },
          cover: { type: "url" },
          contents: { type: "array" },
        },
      },
    },
    GAMEPLAY: {
      "*": {
        type: "object",
        itemFields: {
          title: { type: "string" },
          description: { type: "string" },
          image: { type: "url" },
        },
      },
    },
    STORY: {
      world_summary: { type: "string" },
      "*": {
        type: "object",
        itemFields: {
          title: { type: "string" },
          text: { type: "string" },
          image: { type: "url" },
        },
      },
    },
    VIDEOS: {
      "*": {
        type: "object",
        itemFields: {
          title: { type: "string" },
          url: { type: "url" },
        },
      },
    },
    GALLERY: {
      "*": {
        type: "object",
        itemFields: {
          image: { type: "url" },
          description: { type: "string" },
        },
      },
    },
    REVIEWS: {
      metacritic: { type: "number", min: 0, max: 100 },
      opencritic: { type: "number", min: 0, max: 100 },
      player_score: { type: "number", min: 0, max: 10 },
      "*": {
        type: "object",
        itemFields: {
          source: { type: "string" },
          score: { type: "string" },
          quote: { type: "string" },
          url: { type: "url" },
        },
      },
    },
    TIMELINE: {
      "*": {
        type: "object",
        itemFields: {
          date: { type: "date" },
          title: { type: "string" },
          details: { type: "string" },
        },
      },
    },
    UPDATES: {
      "*": {
        type: "object",
        itemFields: {
          version: { type: "string" },
          date: { type: "date" },
          changes: { type: "string" },
        },
      },
    },
    MUSIC: {
      "*": {
        type: "object",
        itemFields: {
          title: { type: "string" },
          url: { type: "url" },
        },
      },
    },
    SERIES: {
      name: { type: "string" },
      "*": {
        type: "object",
        itemFields: {
          name: { type: "string" },
          platform: { type: "string" },
        },
      },
    },
    STUDIO: {
      name: { type: "string" },
      location: { type: "string" },
      description: { type: "string" },
    },
  },
};
