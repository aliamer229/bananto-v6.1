const fs = require('fs');
const glb = fs.readFileSync('public/source/SwitchCase.glb');

const chunk0Len = glb.readUInt32LE(12);
const jsonStr = glb.toString('utf8', 20, 20 + chunk0Len);
const json = JSON.parse(jsonStr);

const chunk1Start = 20 + chunk0Len;
const chunk1Len = glb.readUInt32LE(chunk1Start);
const binStart = chunk1Start + 8;

const accessor = json.accessors[10]; // TEXCOORD_0 of placeholder
const bufferView = json.bufferViews[accessor.bufferView];

const uvStart = binStart + bufferView.byteOffset;
const uvs = [];
for (let i = 0; i < accessor.count; i++) {
  const u = glb.readFloatLE(uvStart + i * 8);
  const v = glb.readFloatLE(uvStart + i * 8 + 4);
  uvs.push([u, v]);
}
console.log("UVs:");
uvs.forEach((uv, i) => console.log(i, uv[0].toFixed(4), uv[1].toFixed(4)));
