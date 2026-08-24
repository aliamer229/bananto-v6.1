import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// The file is on the server, but we can't easily parse it in Node because GLTFLoader requires a DOM or polyfills.
// However, we can just fetch it inside the React component and find the meshes there.
