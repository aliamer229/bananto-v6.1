import { describe, expect, it } from "vitest";
import {
  resolveOptionStandardDescription,
  resolveTypeStandardDescription,
  getCombinedOptionTypeDisplay,
  normalizeProductOption,
  normalizeProductType,
  cleanAndStandardizeProductOptions,
  STANDARD_OPTION_DESCRIPTIONS,
  STANDARD_TYPE_DESCRIPTIONS,
} from "./productOptionDescriptions";

describe("productOptionDescriptions", () => {
  describe("Option description normalization", () => {
    it("normalizes Offline Account variations to حساب مشترك", () => {
      expect(resolveOptionStandardDescription("Offline Account")).toBe(
        STANDARD_OPTION_DESCRIPTIONS.OFFLINE,
      );
      expect(resolveOptionStandardDescription("offline")).toBe(
        STANDARD_OPTION_DESCRIPTIONS.OFFLINE,
      );
      expect(resolveOptionStandardDescription("حساب أوفلاين")).toBe(
        STANDARD_OPTION_DESCRIPTIONS.OFFLINE,
      );
      expect(resolveOptionStandardDescription("حساب أوفلاين (Offline)")).toBe(
        STANDARD_OPTION_DESCRIPTIONS.OFFLINE,
      );
      expect(resolveOptionStandardDescription("opt_offline_123")).toBe(
        STANDARD_OPTION_DESCRIPTIONS.OFFLINE,
      );
      expect(resolveOptionStandardDescription("حساب مشترك")).toBe(
        STANDARD_OPTION_DESCRIPTIONS.OFFLINE,
      );
    });

    it("normalizes Online Account variations to حساب خاص بك", () => {
      expect(resolveOptionStandardDescription("Online Account")).toBe(
        STANDARD_OPTION_DESCRIPTIONS.ONLINE,
      );
      expect(resolveOptionStandardDescription("online")).toBe(
        STANDARD_OPTION_DESCRIPTIONS.ONLINE,
      );
      expect(resolveOptionStandardDescription("حساب أونلاين")).toBe(
        STANDARD_OPTION_DESCRIPTIONS.ONLINE,
      );
      expect(resolveOptionStandardDescription("حساب أونلاين (Online)")).toBe(
        STANDARD_OPTION_DESCRIPTIONS.ONLINE,
      );
      expect(resolveOptionStandardDescription("حساب خاص")).toBe(
        STANDARD_OPTION_DESCRIPTIONS.ONLINE,
      );
      expect(resolveOptionStandardDescription("opt_online_123")).toBe(
        STANDARD_OPTION_DESCRIPTIONS.ONLINE,
      );
    });
  });

  describe("Type / Edition description normalization", () => {
    it("normalizes Standard / Base Edition variations to اللعبة الأساسية", () => {
      expect(resolveTypeStandardDescription("Standard Edition")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.BASE,
      );
      expect(resolveTypeStandardDescription("Base Game")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.BASE,
      );
      expect(resolveTypeStandardDescription("Regular Edition")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.BASE,
      );
      expect(resolveTypeStandardDescription("النسخة القياسية Standard")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.BASE,
      );
      expect(resolveTypeStandardDescription("اللعبة الأساسية")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.BASE,
      );
      expect(resolveTypeStandardDescription("standard_offline")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.BASE,
      );
      expect(resolveTypeStandardDescription("standard_online")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.BASE,
      );
    });

    it("normalizes DLC / Deluxe / Ultimate / Expansion to اللعبة مع الإضافات", () => {
      expect(resolveTypeStandardDescription("DLC Edition")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.DLC,
      );
      expect(resolveTypeStandardDescription("Deluxe Edition")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.DLC,
      );
      expect(resolveTypeStandardDescription("Ultimate Edition")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.DLC,
      );
      expect(resolveTypeStandardDescription("Gold Edition")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.DLC,
      );
      expect(resolveTypeStandardDescription("Complete Edition")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.DLC,
      );
      expect(resolveTypeStandardDescription("Expansion Pass")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.DLC,
      );
      expect(resolveTypeStandardDescription("Bundle with DLC")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.DLC,
      );
      expect(resolveTypeStandardDescription("نسخة مع الإضافات Deluxe")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.DLC,
      );
      expect(resolveTypeStandardDescription("النسخة الفاخرة Ultimate")).toBe(
        STANDARD_TYPE_DESCRIPTIONS.DLC,
      );
    });
  });

  describe("Combined Option + Type display", () => {
    it("returns correct combined strings for all pairings", () => {
      expect(
        getCombinedOptionTypeDisplay("Offline Account", "Standard Edition")
          .combinedDesc,
      ).toBe("حساب مشترك / اللعبة الأساسية");

      expect(
        getCombinedOptionTypeDisplay("Online Account", "Standard Edition")
          .combinedDesc,
      ).toBe("حساب خاص بك / اللعبة الأساسية");

      expect(
        getCombinedOptionTypeDisplay("Offline Account", "DLC Edition")
          .combinedDesc,
      ).toBe("حساب مشترك / اللعبة مع الإضافات");

      expect(
        getCombinedOptionTypeDisplay("Online Account", "Deluxe Edition")
          .combinedDesc,
      ).toBe("حساب خاص بك / اللعبة مع الإضافات");
    });
  });

  describe("Legacy note cleanup and segregation", () => {
    it("moves supplier note into internalNote and sets standard customer description", () => {
      const LEAKED =
        "Supplier Regular / 普通版 converted to IQD using 1 CNY = 220 IQD and rounded down";
      const pollutedType = {
        id: "dlc_off",
        name: "Deluxe Offline",
        price: 25000,
        description: LEAKED,
      };

      const normalized = normalizeProductType(pollutedType);
      expect(normalized["description"]).toBe("اللعبة مع الإضافات");
      expect(normalized["customerDescription"]).toBe("اللعبة مع الإضافات");
      expect(normalized["internalNote"]).toBe(LEAKED);
    });

    it("cleans full product records", () => {
      const LEAKED =
        "Supplier Standard / 标准版 converted to IQD using 1 CNY = 220 IQD";
      const rawProduct = {
        id: "prod_mario",
        title: "Super Mario Odyssey",
        options: [
          {
            id: "opt_off",
            name: "Offline Account",
            description: "لعب على حساب المتجر بدون اتصال بالإنترنت",
          },
          {
            id: "opt_on",
            name: "Online Account",
            description: "لعب كامل على حسابك الشخصي مع دعم الأونلاين",
          },
        ],
        types: [
          {
            id: "typ_std",
            name: "Standard Edition",
            price: 20000,
            description: LEAKED,
          },
          {
            id: "typ_dlc",
            name: "Deluxe Edition",
            price: 30000,
            description: "تشمل التوسعات وحزم المحتوى الإضافي",
          },
        ],
      };

      const { product: cleaned, changed } =
        cleanAndStandardizeProductOptions(rawProduct);

      expect(changed).toBe(true);
      const options = cleaned.options as any[];
      expect(options[0].description).toBe("حساب مشترك");
      expect(options[1].description).toBe("حساب خاص بك");

      const types = cleaned.types as any[];
      expect(types[0].description).toBe("اللعبة الأساسية");
      expect(types[0].internalNote).toBe(LEAKED);
      expect(types[1].description).toBe("اللعبة مع الإضافات");
    });
  });
});
