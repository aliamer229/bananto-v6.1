const fs = require('fs');
let code = fs.readFileSync('vite.config.ts', 'utf8');

const hookAdd = `
            const tslibPkg = path.resolve(nitro.options.output.serverDir, "node_modules/tslib/package.json");
            if (fs.existsSync(tslibPkg)) {
              let pkg = fs.readFileSync(tslibPkg, "utf8");
              pkg = pkg.replace(/"\\.\\/tslib\\.es6\\.mjs"/g, '"./tslib.js"');
              fs.writeFileSync(tslibPkg, pkg);
            }
`;

code = code.replace('console.log(`\\n[Nitro Hook] Successfully appended ChatRealtimeDO export\\n`);', hookAdd + 'console.log(`\\n[Nitro Hook] Successfully appended ChatRealtimeDO export\\n`);');

fs.writeFileSync('vite.config.ts', code);
