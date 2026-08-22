const fs = require('fs');
const buffer = fs.readFileSync('SwitchCase.glb');
const magic = buffer.readUInt32LE(0);
const jsonChunkLength = buffer.readUInt32LE(12);
const jsonStr = buffer.toString('utf8', 20, 20 + jsonChunkLength);
const json = JSON.parse(jsonStr);
console.log(JSON.stringify(json.nodes.map(n => n.name), null, 2));
