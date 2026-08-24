import fs from 'fs';

async function run() {
  const response = await fetch("https://assets.banan.to/Pages/Glb/SwitchCase.glb");
  const buffer = await response.arrayBuffer();
  fs.writeFileSync("SwitchCase.glb", Buffer.from(buffer));
  console.log("Downloaded. Size:", buffer.byteLength);
}
run();
