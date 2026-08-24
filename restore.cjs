const fs = require('fs');
let content = fs.readFileSync('src/SwitchBox3D.tsx', 'utf-8');

// Remove the appended GLBCase and SwitchBox3D
content = content.split('function GLBCase({ url, texture, groupRef }) {')[0];

// Restore SwitchBox3D name
content = content.replace('function SwitchBoxProcedural({', 'export function SwitchBox3D({');

// Restore default export
content += '\nexport default SwitchBox3D;\n';

fs.writeFileSync('src/SwitchBox3D.tsx', content);
