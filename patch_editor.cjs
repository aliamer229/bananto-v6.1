const fs = require('fs');
const file = '/app/applet/src/components/AdminProductEditor.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const \[formData, setFormData\] = useState\(\(\) => \{/,
  `const [formData, setFormData] = useState(() => {
    const generateId = () => "prd_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);`
);

content = content.replace(
  /return createBlankProductForm\(defaultCat\);/,
  `const blank = createBlankProductForm(defaultCat);
    if (!blank.id) blank.id = generateId();
    return blank;`
);

content = content.replace(
  /const data = \{/,
  `const data = {
        id: product.id || generateId(),`
);

// We need to inject `productId={formData.id} imageType="..."` into ImageUploadField components
content = content.replace(
  /label="غلاف العلبة الأمامي \(Front Box Cover\)"\s+value=\{formData\.cartridgeImage \|\| ""\}/,
  `productId={formData.id} imageType="front" label="غلاف العلبة الأمامي (Front Box Cover)" value={formData.cartridgeImage || ""}`
);

content = content.replace(
  /label="صورة مربعة للبطاقات المصغّرة \(Square Card Image\)"\s+value=\{formData\.nintendoCardImage \|\| ""\}/,
  `productId={formData.id} imageType="square" label="صورة مربعة للبطاقات المصغّرة (Square Card Image)" value={formData.nintendoCardImage || ""}`
);

content = content.replace(
  /label="غلاف بدقة عالية للمجسم ثلاثي الأبعاد \(3D Texture Source\)"\s+value=\{formData\.coverHiResImage \|\| ""\}/,
  `productId={formData.id} imageType="3d-texture" label="غلاف بدقة عالية للمجسم ثلاثي الأبعاد (3D Texture Source)" value={formData.coverHiResImage || ""}`
);

content = content.replace(
  /label="صورة الغلاف للتفاصيل \(Cover Image\)"\s+value=\{formData\.coverImage \|\| ""\}/,
  `productId={formData.id} imageType="cover" label="صورة الغلاف للتفاصيل (Cover Image)" value={formData.coverImage || ""}`
);

content = content.replace(
  /label=""\s+value=\{banner\}\s+onChange=\{\(url\) => handleBannerImageChange\(idx, url\)\}/g,
  `productId={formData.id} imageType={"banner-" + idx} label="" value={banner} onChange={(url) => handleBannerImageChange(idx, url)}`
);

content = content.replace(
  /label="صورة الجهاز الأساسية \(Main Console Image\)"\s+value=\{formData\.coverImage \|\| ""\}/,
  `productId={formData.id} imageType="hardware-main" label="صورة الجهاز الأساسية (Main Console Image)" value={formData.coverImage || ""}`
);

content = content.replace(
  /label="صورة كرتون التغليف أو الملحقات \(Box Package Art\)"\s+value=\{formData\.cartridgeImage \|\| ""\}/,
  `productId={formData.id} imageType="hardware-box" label="صورة كرتون التغليف أو الملحقات (Box Package Art)" value={formData.cartridgeImage || ""}`
);

content = content.replace(
  /label="صورة المجسم الأساسية \(Main Figure Image\)"\s+value=\{formData\.coverImage \|\| ""\}/,
  `productId={formData.id} imageType="amiibo-main" label="صورة المجسم الأساسية (Main Figure Image)" value={formData.coverImage || ""}`
);

content = content.replace(
  /label="صورة المكافأة داخل اللعبة أو العلبة \(In-Game Reward \/ Box\)"\s+value=\{formData\.cartridgeImage \|\| ""\}/,
  `productId={formData.id} imageType="amiibo-box" label="صورة المكافأة داخل اللعبة أو العلبة (In-Game Reward / Box)" value={formData.cartridgeImage || ""}`
);

content = content.replace(
  /label="الصورة الأساسية للإكسسوار \(Main Product Image\)"\s+value=\{formData\.coverImage \|\| ""\}/,
  `productId={formData.id} imageType="accessory-main" label="الصورة الأساسية للإكسسوار (Main Product Image)" value={formData.coverImage || ""}`
);

content = content.replace(
  /label="صورة الزوايا أو أثناء الاستخدام \(Fitted \/ In-Use Image\)"\s+value=\{formData\.cartridgeImage \|\| ""\}/,
  `productId={formData.id} imageType="accessory-fitted" label="صورة الزوايا أو أثناء الاستخدام (Fitted / In-Use Image)" value={formData.cartridgeImage || ""}`
);

content = content.replace(
  /label="صورة بطاقة الشحن \(Card Artwork\)"\s+value=\{formData\.coverImage \|\| formData\.cardArtwork \|\| formData\.mainImage \|\| ""\}/,
  `productId={formData.id} imageType="giftcard-main" label="صورة بطاقة الشحن (Card Artwork)" value={formData.coverImage || formData.cardArtwork || formData.mainImage || ""}`
);

content = content.replace(
  /label="بانر الريجون التوضيحي \(Region Banner\)"\s+value=\{/,
  `productId={formData.id} imageType="giftcard-banner" label="بانر الريجون التوضيحي (Region Banner)" value={`
);

content = content.replace(
  /label="صورة حقيقية للشريط أو الجهاز من الأمام \(Real Front Photo\)"\s+value=\{formData\.coverImage \|\| ""\}/,
  `productId={formData.id} imageType="used-front" label="صورة حقيقية للشريط أو الجهاز من الأمام (Real Front Photo)" value={formData.coverImage || ""}`
);

content = content.replace(
  /label="صورة حقيقية للعلبة أو الخلف \(Real Back \/ Box Photo\)"\s+value=\{formData\.cartridgeImage \|\| ""\}/,
  `productId={formData.id} imageType="used-back" label="صورة حقيقية للعلبة أو الخلف (Real Back / Box Photo)" value={formData.cartridgeImage || ""}`
);

content = content.replace(
  /label="بانر البندل الرئيسي \(Main Bundle Poster\)"\s+value=\{formData\.coverImage \|\| ""\}/,
  `productId={formData.id} imageType="bundle-main" label="بانر البندل الرئيسي (Main Bundle Poster)" value={formData.coverImage || ""}`
);

content = content.replace(
  /label="صورة الغلاف المصغر \(Bundle Thumbnail\)"\s+value=\{formData\.cartridgeImage \|\| ""\}/,
  `productId={formData.id} imageType="bundle-thumb" label="صورة الغلاف المصغر (Bundle Thumbnail)" value={formData.cartridgeImage || ""}`
);


fs.writeFileSync(file, content);
console.log("Patched AdminProductEditor.tsx");
