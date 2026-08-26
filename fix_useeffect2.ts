import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/components/AdminDashboard.tsx', 'utf8');

const regex = /React\.useEffect\(\(\) => \{\s*let cancelled = false;\s*const isCancelled = \(\) => cancelled;\s*const run = async \(\) => \{\s*for \(let attempt = 0; attempt < 3; attempt\+\+\) \{\s*if \(cancelled\) return;\s*if \(await loadFromDb\(isCancelled\)\) return;\s*await new Promise\(\(resolve\) => setTimeout\(resolve, 1000 \* 2 \*\* attempt\)\);\s*\}\s*\};\s*void run\(\);\s*return \(\) => \{\s*cancelled = true;\s*\};\s*\}, \[loadFromDb\]\);/g;

file = file.replace(regex, `React.useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (controller.signal.aborted) return;
        if (await loadFromDb(controller.signal)) return;
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    };
    void run();

    return () => {
      controller.abort();
    };
  }, [loadFromDb]);`);

writeFileSync('src/components/AdminDashboard.tsx', file);
