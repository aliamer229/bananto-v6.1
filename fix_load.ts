import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/components/AdminDashboard.tsx', 'utf8');

file = file.replace(
  `const loadFromDb = React.useCallback(async (isCancelled: () => boolean): Promise<boolean> => {
    let res: Response | null = null;
    const fetchController = new AbortController();
    const timer = setTimeout(() => fetchController.abort(), 12000);

    try {
      res = await fetch("/api/admin/store", {
        credentials: "include",
        signal: fetchController.signal,
      });
      clearTimeout(timer);`,
  `const loadFromDb = React.useCallback(async (signal: AbortSignal): Promise<boolean> => {
    let res: Response | null = null;
    let isTimeout = false;
    const fetchController = new AbortController();
    
    const timer = setTimeout(() => {
      isTimeout = true;
      fetchController.abort();
    }, 25000);

    const onOuterAbort = () => fetchController.abort();
    if (signal.aborted) return true;
    signal.addEventListener("abort", onOuterAbort);

    try {
      res = await fetch("/api/admin/store", {
        credentials: "include",
        signal: fetchController.signal,
      });
      clearTimeout(timer);`
);

file = file.replace(
  `const data = await res.json();
      if (isCancelled()) return true;`,
  `const data = await res.json();
      if (signal.aborted) return true;`
);

file = file.replace(
  `        try {
          const adminCtrl = new AbortController();
          const adminTimer = setTimeout(() => adminCtrl.abort(), 8000);
          const adminRes = await fetch("/api/admin/products", {
            credentials: "include",
            signal: adminCtrl.signal,
          });
          clearTimeout(adminTimer);`,
  `        try {
          let adminTimeout = false;
          const adminCtrl = new AbortController();
          const adminTimer = setTimeout(() => {
            adminTimeout = true;
            adminCtrl.abort();
          }, 20000);

          const onAdminSignalAbort = () => adminCtrl.abort();
          signal.addEventListener("abort", onAdminSignalAbort);

          const adminRes = await fetch("/api/admin/products", {
            credentials: "include",
            signal: adminCtrl.signal,
          });
          clearTimeout(adminTimer);
          signal.removeEventListener("abort", onAdminSignalAbort);`
);

file = file.replace(
  `      return true;
    } catch (err) {
      clearTimeout(timer);
      if (isCancelled()) return true;
      console.error("DB load failed", err);
      canWrite.current = true; // Keep write capability open for working modules
      setDbError("تعذر قراءة البيانات من قاعدة البيانات — تم تفعيل وضع الحماية.");
      setDbErrorDetail(await describeLoadFailure(res, err));
      setIsLoaded(true);
      setProductLoadStatus((prev) => (products.length > 0 ? "loaded_with_data" : "failed"));
      return false;
    }
  }, [products.length]);`,
  `      return true;
    } catch (err) {
      clearTimeout(timer);
      signal.removeEventListener("abort", onOuterAbort);
      
      if (signal.aborted) return true;
      console.error("DB load failed", err);
      canWrite.current = true;

      const isAbortError = err instanceof Error && err.name === "AbortError";
      if (isAbortError && isTimeout) {
        setDbError("استغرق تحميل البيانات وقتًا أطول من المتوقع. أعد المحاولة.");
        setDbErrorDetail("انتهى وقت الطلب المسموح (Timeout)");
      } else if (isAbortError) {
        setDbError("");
      } else {
        setDbError("تعذر قراءة البيانات من قاعدة البيانات — تم تفعيل وضع الحماية.");
        describeLoadFailure(res, err).then(setDbErrorDetail);
      }
      setIsLoaded(true);
      setProductLoadStatus((prev) => (prev === "loaded_with_data" || prev === "loaded_empty" ? prev : "failed"));
      return false;
    }
  }, []);`
);

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

file = file.replace(
  `const ok = await loadFromDb(() => false);`,
  `const fakeController = new AbortController();\n      const ok = await loadFromDb(fakeController.signal);`
);

writeFileSync('src/components/AdminDashboard.tsx', file);
console.log('Done!');
