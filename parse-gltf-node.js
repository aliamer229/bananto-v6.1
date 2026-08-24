import { readFileSync } from 'fs';
const glb = readFileSync('SwitchCase.glb');
console.log(glb.toString('utf8').substring(0, 100));
