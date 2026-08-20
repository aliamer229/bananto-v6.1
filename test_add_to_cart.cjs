const fs = require("fs");
let code = fs.readFileSync("src/components/product-details/ProductDetails.tsx", "utf8");

code = code.replace(
  `  const handleAddToCart = () => {`,
  `  const handleAddToCart = () => {
    console.log("Adding to cart", {
        productId: String(product["id"] ?? ""),
        title: view.title,
        image: selectedVariant?.image || selectedOption?.image || view.images[0] || "",
        price: effectivePrice,
        kind: (view.schema.kind) ?? "accessory",
        requiresAddress: true
    });`,
);
fs.writeFileSync("src/components/product-details/ProductDetails.tsx", code);
