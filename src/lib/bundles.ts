import type { AccountBundle, Product } from "./types";

export function getBundleGames(bundle: AccountBundle, products: Product[]): Product[] {
  if (!bundle.gameIds || !Array.isArray(bundle.gameIds) || !products || !Array.isArray(products)) {
    return [];
  }
  const idSet = new Set(bundle.gameIds.map((id) => String(id)));
  return products.filter((p) => idSet.has(String(p.id)));
}

export function getBundleOriginalTotal(bundle: AccountBundle, products: Product[]): number {
  if (bundle.originalPrice && bundle.originalPrice > bundle.price) {
    return bundle.originalPrice;
  }
  const games = getBundleGames(bundle, products);
  const sum = games.reduce((acc, g) => acc + (Number(g.price) || 0), 0);
  return sum > bundle.price ? sum : Math.round(bundle.price * 1.4);
}

export function getBundleSavings(
  bundle: AccountBundle,
  products: Product[],
): { amount: number; percentage: number } {
  const original = getBundleOriginalTotal(bundle, products);
  const current = Number(bundle.price) || 0;
  if (original <= current) {
    return { amount: 0, percentage: 0 };
  }
  const amount = original - current;
  const percentage = Math.round((amount / original) * 100);
  return { amount, percentage };
}

export function getAccountTypeInfo(type?: string): {
  label: string;
  description: string;
  color: string;
} {
  switch (type) {
    case "primary":
      return {
        label: "حساب رئيسي (Primary)",
        description:
          "يمكنك اللعب بجميع الحسابات على جهازك مع حفظ التخزينات واللعب أونلاين وأوفلاين",
        color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      };
    case "secondary":
      return {
        label: "حساب فرعي (Secondary)",
        description: "اللعب من نفس الحساب المشترى مع اتصال بالإنترنت لبدء اللعبة",
        color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      };
    case "full":
      return {
        label: "حساب كامل خاص (Full Ownership)",
        description: "حساب كامل مع الإيميل الأساسي وإمكانية تغيير كافة البيانات وكلمة المرور",
        color: "bg-purple-500/10 text-purple-600 border-purple-500/20",
      };
    case "offline":
      return {
        label: "حساب أوفلاين (Offline)",
        description: "تحميل الألعاب كاملة واللعب بدون الحاجة لاتصال بالإنترنت",
        color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      };
    default:
      return {
        label: "حساب رقمي أصلي (Digital Account)",
        description: "تحميل رسمي ومباشر من متجر Nintendo eShop مع ضمان شامل",
        color: "bg-red-500/10 text-red-600 border-red-500/20",
      };
  }
}

export function generateSeedBundles(products: Product[]): AccountBundle[] {
  const switchGames = products.filter(
    (p) =>
      p.isActive !== false &&
      p.kind !== "hardware" &&
      p.kind !== "accessory" &&
      p.kind !== "device",
  );

  const marioGames = switchGames.filter((g) =>
    /mario|luigi|kart|odyssey|wonder|party/i.test(
      String(g.title || "") + " " + String(g.titleEn || ""),
    ),
  );
  const zeldaGames = switchGames.filter((g) =>
    /zelda|hyrule|tears|breath|link/i.test(String(g.title || "") + " " + String(g.titleEn || "")),
  );
  const pokemonGames = switchGames.filter((g) =>
    /pokemon|pokémon|arceus|scarlet|violet/i.test(
      String(g.title || "") + " " + String(g.titleEn || ""),
    ),
  );
  const actionGames = switchGames.filter(
    (g) =>
      !marioGames.includes(g) &&
      !zeldaGames.includes(g) &&
      !pokemonGames.includes(g) &&
      (g.price || 0) > 0,
  );

  const now = new Date().toISOString();
  const bundles: AccountBundle[] = [];

  // Mario Bundle
  if (marioGames.length >= 2) {
    const selected = marioGames.slice(0, 3);
    const origSum = selected.reduce((sum, g) => sum + (Number(g.price) || 25000), 0);
    const bundlePrice = Math.round((origSum * 0.65) / 1000) * 1000 || 38000;
    bundles.push({
      id: "bnd_mario_allstars",
      title: "بندل أساطير ماريو الشامل (3 ألعاب)",
      titleEn: "Mario All-Stars Complete Bundle",
      slug: "mario-all-stars-bundle",
      description:
        "احصل على أقوى وأشهر 3 ألعاب من عالم سوبر ماريو في حساب ننتندو سويتش واحد جاهز للتحميل المباشر مع توفير كبير وضمان مدى الحياة.",
      price: bundlePrice,
      originalPrice: origSum || 55000,
      image:
        (selected[0]?.image as string | undefined) ||
        (selected[0]?.coverImage as string | undefined) ||
        "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop",
      gameIds: selected.map((g) => g.id),
      accountType: "primary",
      stock: 25,
      isActive: true,
      badge: "الأكثر مبيعاً 🔥",
      features: [
        "3 ألعاب ماريو كاملة بحساب واحد",
        "تفعيل رئيسي - العب بحسابك الشخصي",
        "تحميل مباشر وسريع من Nintendo eShop",
        "دعم الأونلاين والتخزين السحابي",
        "ضمان ذهبي شامل ودائم",
      ],
      deliveryTime: "فوري وتلقائي في محادثة الطلب",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Zelda Bundle
  if (zeldaGames.length >= 2) {
    const selected = zeldaGames.slice(0, 2);
    const origSum = selected.reduce((sum, g) => sum + (Number(g.price) || 30000), 0);
    const bundlePrice = Math.round((origSum * 0.7) / 1000) * 1000 || 42000;
    bundles.push({
      id: "bnd_zelda_duology",
      title: "بندل ملحمة زيلدا (Tears & Breath of the Wild)",
      titleEn: "Zelda Dual Masterpiece Bundle",
      slug: "zelda-dual-masterpiece-bundle",
      description:
        "عش أروع تجربة عالم مفتوح في تاريخ الألعاب مع تحفتي زيلدا بحساب ننتندو سويتش واحد رسمي ومضمون 100%.",
      price: bundlePrice,
      originalPrice: origSum || 60000,
      image:
        (selected[0]?.image as string | undefined) ||
        (selected[0]?.coverImage as string | undefined) ||
        "https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=600&auto=format&fit=crop",
      gameIds: selected.map((g) => g.id),
      accountType: "primary",
      stock: 18,
      isActive: true,
      badge: "توفير 35% 💎",
      features: [
        "اللعبتان مع كافة التحديثات الرسمية",
        "لعب بدون قيود على السويتش الخاص بك",
        "تسليم بيانات الحساب فورياً",
        "ضمان استبدال مدى الحياة",
      ],
      deliveryTime: "فوري وتلقائي في محادثة الطلب",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Pokemon Bundle
  if (pokemonGames.length >= 2) {
    const selected = pokemonGames.slice(0, 2);
    const origSum = selected.reduce((sum, g) => sum + (Number(g.price) || 25000), 0);
    const bundlePrice = Math.round((origSum * 0.68) / 1000) * 1000 || 36000;
    bundles.push({
      id: "bnd_pokemon_masters",
      title: "بندل مغامرات بوكيمون الأسطوري",
      titleEn: "Pokemon Masters Switch Bundle",
      slug: "pokemon-masters-bundle",
      description:
        "انطلق في أروع رحلات البوكيمون واصطد أندر المخلوقات في حساب واحد يضم نخبة ألعاب بوكيمون على السويتش.",
      price: bundlePrice,
      originalPrice: origSum || 52000,
      image:
        (selected[0]?.image as string | undefined) ||
        (selected[0]?.coverImage as string | undefined) ||
        "https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?q=80&w=600&auto=format&fit=crop",
      gameIds: selected.map((g) => g.id),
      accountType: "primary",
      stock: 20,
      isActive: true,
      badge: "بندل مميز ⭐",
      features: [
        "أقوى ألعاب بوكيمون بحساب واحد",
        "إمكانية التبادل واللعب أونلاين",
        "تسليم فوري ومباشر في المحادثة",
        "ضمان كامل ودعم فني مستمر",
      ],
      deliveryTime: "فوري وتلقائي في محادثة الطلب",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Ultimate Variety Bundle
  if (switchGames.length >= 3 && bundles.length === 0) {
    const selected = switchGames.slice(0, 3);
    const origSum = selected.reduce((sum, g) => sum + (Number(g.price) || 25000), 0);
    const bundlePrice = Math.round((origSum * 0.6) / 1000) * 1000 || 35000;
    bundles.push({
      id: "bnd_switch_essentials",
      title: "حزمة ألعاب السويتش الأساسية (3 ألعاب)",
      titleEn: "Switch Essentials Mega Bundle",
      slug: "switch-essentials-bundle",
      description:
        "مجموعة مختارة من أفضل ألعاب ننتندو سويتش في حساب رقمي واحد لتستمتع بأفضل تجربة لعب وتوفير هائل.",
      price: bundlePrice,
      originalPrice: origSum || 50000,
      image:
        (selected[0]?.image as string | undefined) ||
        (selected[0]?.coverImage as string | undefined) ||
        "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop",
      gameIds: selected.map((g) => g.id),
      accountType: "primary",
      stock: 15,
      isActive: true,
      badge: "توفير 40% 🚀",
      features: [
        "3 ألعاب ممتازة بحساب واحد",
        "تحميل من المتجر الرسمي eShop",
        "تسليم فوري بعد الدفع",
        "ضمان مدى الحياة",
      ],
      deliveryTime: "فوري وتلقائي في محادثة الطلب",
      createdAt: now,
      updatedAt: now,
    });
  }

  return bundles;
}
