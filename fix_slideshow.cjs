const fs = require("fs");
let code = fs.readFileSync("src/routes/category.$categoryId.tsx", "utf-8");

const oldCode = `          {/* Background Game Slideshow - Fast Instant Switching without Fade in/out & No bottom blur */}
          <div className="absolute inset-0 z-0 select-none overflow-hidden">
            {productBanners.length > 0 ? (
              <div className="relative w-full h-full">
                <img
                  key={productBanners[currentBannerIndex]}
                  src={cdnImage(productBanners[currentBannerIndex])}
                  alt="Game Gameplay Banner"
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="sync"
                />
                {/* Clean dark tint for text contrast only, without bottom blur gradient */}
                <div className="absolute inset-0 bg-black/40" />
              </div>
            ) : (`;

const newCode = `          {/* Background Game Slideshow */}
          <div className="absolute inset-0 z-0 select-none overflow-hidden">
            {productBanners.length > 0 ? (
              <div className="relative w-full h-full">
                <AnimatePresence initial={false}>
                  <motion.img
                    key={currentBannerIndex}
                    src={cdnImage(productBanners[currentBannerIndex])}
                    alt="Game Gameplay Banner"
                    className="absolute inset-0 w-full h-full object-cover"
                    initial={{ x: "-100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    loading="eager"
                    decoding="sync"
                  />
                </AnimatePresence>
                {/* Clean dark tint for text contrast only, without bottom blur gradient */}
                <div className="absolute inset-0 bg-black/40 z-10 pointer-events-none" />
              </div>
            ) : (`;

code = code.replace(oldCode, newCode);
fs.writeFileSync("src/routes/category.$categoryId.tsx", code);
