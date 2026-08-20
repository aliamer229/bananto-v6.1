const fs = require("fs");
const file = "src/hub/gamehub/Chrome.tsx";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
  `  useEffect(() => {
    const onScroll = () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 380;
      setVisible(window.scrollY > 560 && !nearBottom);
    };
    onScroll();`,
  `  useEffect(() => {
    const onScroll = () => {
      const heroBuyButton = document.getElementById("hero-buy-button");
      let pastHero = window.scrollY > 560;
      if (heroBuyButton) {
        pastHero = heroBuyButton.getBoundingClientRect().bottom < 0;
      }
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 380;
      setVisible(pastHero && !nearBottom);
    };
    onScroll();`,
);

code = code.replace(
  `  useEffect(() => {
    const onScroll = () => setScrolledPastHero(window.scrollY > 400);
    onScroll();`,
  `  useEffect(() => {
    const onScroll = () => {
      const heroBuyButton = document.getElementById("hero-buy-button");
      if (heroBuyButton) {
        setScrolledPastHero(heroBuyButton.getBoundingClientRect().bottom < 0);
      } else {
        setScrolledPastHero(window.scrollY > 400);
      }
    };
    onScroll();`,
);

fs.writeFileSync(file, code);
