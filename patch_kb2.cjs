const fs = require('fs');
let file = fs.readFileSync('src/lib/support/kb-mining.server.ts', 'utf8');
file = file.replace(/const current = messages\[i\];/g, 'const current = messages[i]!;');
file = file.replace(/const next = messages\[i \+ 1\];/g, 'const next = messages[i + 1]!;');
file = file.replace(/const rawQuestion = pair\.userMsg\.body\?\.\["text"\] \|\| "";/g, 'const rawQuestion = (pair.userMsg.body?.["text"] as string) || "";');
file = file.replace(/const rawAnswer = pair\.adminMsg\.body\?\.\["text"\] \|\| "";/g, 'const rawAnswer = (pair.adminMsg.body?.["text"] as string) || "";');
file = file.replace(/existing\.usageCount/g, 'existing!.usageCount');
fs.writeFileSync('src/lib/support/kb-mining.server.ts', file);
