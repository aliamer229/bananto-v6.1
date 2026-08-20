const fs = require('fs');
let code = fs.readFileSync('src/hub/gamehub/Chrome.tsx', 'utf8');

code = code.replace(
  `      const heroBuyButton = document.getElementById("hero-buy-button");
      let pastHero = window.scrollY > 560;
      if (heroBuyButton) {
        pastHero = heroBuyButton.getBoundingClientRect().bottom < 0;
      }
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 380;
      setVisible(pastHero && !nearBottom);`,
  `      const heroBuyButton = document.getElementById("hero-buy-button");
      let pastHero = window.scrollY > 560;
      if (heroBuyButton) {
        pastHero = heroBuyButton.getBoundingClientRect().bottom < 0;
      }
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - window.innerHeight; // don't hide too early unless footer is huge
      setVisible(pastHero && !nearBottom);`
);

fs.writeFileSync('src/hub/gamehub/Chrome.tsx', code);
