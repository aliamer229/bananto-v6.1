const visited = new Set();
const errors = [];

async function crawl(modulePath, referrer) {
  if (!modulePath || visited.has(modulePath) || modulePath.startsWith("data:") || modulePath.startsWith("http:") || modulePath.startsWith("https:")) return;
  visited.add(modulePath);

  const url = modulePath.startsWith("/") ? `http://localhost:3000${modulePath}` : `http://localhost:3000/${modulePath}`;
  try {
    const res = await fetch(url, { headers: { "Referer": referrer || "http://localhost:3000/" } });
    if (!res.ok) {
      errors.push({ modulePath, referrer, status: res.status, statusText: res.statusText });
      console.error(`[ERROR ${res.status}] ${modulePath} (from ${referrer})`);
      return;
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("javascript") || ct.includes("text/")) {
      const code = await res.text();
      const importRegex = /(?:import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]|import\(['"]([^'"]+)['"]\))/g;
      let match;
      while ((match = importRegex.exec(code)) !== null) {
        const target = match[1] || match[2];
        if (target && !target.endsWith(".css") && !target.endsWith(".png") && !target.endsWith(".jpg") && !target.endsWith(".svg")) {
          let resolved = target;
          if (target.startsWith(".")) {
            const basePath = modulePath.substring(0, modulePath.lastIndexOf("/") + 1);
            resolved = new URL(target, `http://localhost:3000${basePath}`).pathname + new URL(target, `http://localhost:3000${basePath}`).search;
          }
          await crawl(resolved, modulePath);
        }
      }
    }
  } catch (err) {
    errors.push({ modulePath, referrer, error: err.message });
    console.error(`[EXCEPTION] ${modulePath} (from ${referrer}):`, err.message);
  }
}

async function run() {
  console.log("Crawling from dev client entry...");
  await crawl("/@id/virtual:tanstack-start-dev-client-entry", "http://localhost:3000/");
  console.log(`\nDone. Visited ${visited.size} modules. Errors found: ${errors.length}`);
  for (const e of errors) {
    console.log("Error detail:", e);
  }
}

run();
