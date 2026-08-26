import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/components/AdminDashboard.tsx', 'utf8');

file = file.replace(
  `  React.useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    const run = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return;
        if (await loadFromDb(isCancelled)) return;
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [loadFromDb]);`,
  `  React.useEffect(() => {
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
  }, [loadFromDb]);`
);

writeFileSync('src/components/AdminDashboard.tsx', file);
