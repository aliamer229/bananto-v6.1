import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/components/AdminDashboard.tsx', 'utf8');

const regex = /let fetchedProducts: any\[\] \| undefined = Array\.isArray\(data\.products\) \? data\.products : undefined;\s*let d1Count: number \| null = typeof data\.totalProducts === "number" \? data\.totalProducts : null;\s*\/\/ If \/api\/data returned no products, attempt dedicated \/api\/admin\/products\s*if \(!fetchedProducts \|\| fetchedProducts\.length === 0\) \{\s*try \{\s*let adminTimeout = false;\s*const adminCtrl = new AbortController\(\);\s*const adminTimer = setTimeout\(\(\) => \{\s*adminTimeout = true;\s*adminCtrl\.abort\(\);\s*\}, 20000\);\s*const onAdminSignalAbort = \(\) => adminCtrl\.abort\(\);\s*signal\.addEventListener\("abort", onAdminSignalAbort\);\s*const adminRes = await fetch\("\/api\/admin\/products", \{\s*credentials: "include",\s*signal: adminCtrl\.signal,\s*\}\);\s*clearTimeout\(adminTimer\);\s*signal\.removeEventListener\("abort", onAdminSignalAbort\);\s*if \(adminRes\.ok\) \{\s*const adminData = await adminRes\.json\(\);\s*if \(Array\.isArray\(adminData\?\.products\) && adminData\.products\.length > 0\) \{\s*fetchedProducts = adminData\.products;\s*d1Count = adminData\.d1Count \?\? adminData\.products\.length;\s*\}\s*\}\s*\} catch \(adminErr\) \{\s*console\.warn\("\[AdminDashboard:adminProductsFetchFailed\]", adminErr\);\s*\}\s*\}/g;

file = file.replace(regex, `      let fetchedProducts: any[] | undefined = undefined;
      let d1Count: number | null = typeof data.totalProducts === "number" ? data.totalProducts : null;
      
      try {
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
        signal.removeEventListener("abort", onAdminSignalAbort);

        if (adminRes.ok) {
          const adminData = await adminRes.json();
          if (Array.isArray(adminData?.products)) {
            fetchedProducts = adminData.products;
            d1Count = adminData.d1Count ?? adminData.products.length;
          }
        } else {
           throw new Error(\`Admin products HTTP \${adminRes.status}\`);
        }
      } catch (adminErr) {
        console.warn("[AdminDashboard:adminProductsFetchFailed]", adminErr);
        throw adminErr;
      }`);

writeFileSync('src/components/AdminDashboard.tsx', file);
