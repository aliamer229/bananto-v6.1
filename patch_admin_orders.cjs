const fs = require('fs');
let file = fs.readFileSync('src/routes/api/admin.orders.ts', 'utf8');
file = file.replace(/if \(data\.action === "send_credentials"\) \{[\s\S]*?\} else if \(/, 'if (');
file = file.replace(/import \{ stageCredentials, evaluateOrderAutoCompletion \} from "@\/lib\/orders.server";/, 'import { evaluateOrderAutoCompletion } from "@/lib/orders.server";');
fs.writeFileSync('src/routes/api/admin.orders.ts', file);
