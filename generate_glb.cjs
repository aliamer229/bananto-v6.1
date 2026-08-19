const fs = require("fs");
const { Scene, Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial } = require("three");
const { GLTFExporter } = require("three/examples/jsm/exporters/GLTFExporter.js");
const { Blob, FileReader } = require("vblob");

// Polyfill for GLTFExporter
global.window = global;
global.Blob = Blob;
global.FileReader = FileReader;
global.document = {
  createElement: () => {
    return {
      getContext: () => {
        return {
          fillRect: () => {},
          drawImage: () => {},
          getImageData: () => {
            return { data: new Uint8ClampedArray(4) };
          },
        };
      },
    };
  },
};

const scene = new Scene();

const boxGeo = new BoxGeometry(1, 1.5, 0.1);
const boxMat = new MeshStandardMaterial({ color: 0x555555 });
const box = new Mesh(boxGeo, boxMat);
box.name = "box";
scene.add(box);

const foilGeo = new BoxGeometry(1.02, 1.52, 0.12);
const foilMat = new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
const foil = new Mesh(foilGeo, foilMat);
foil.name = "foil";
scene.add(foil);

const placeGeo = new PlaneGeometry(1, 1.5);
const placeMat = new MeshStandardMaterial({ color: 0xffffff });
const placeholder = new Mesh(placeGeo, placeMat);
placeholder.name = "placeholder";
placeholder.position.set(0, 0, 0.051);
// Fix UVs to cover 0 to 1
scene.add(placeholder);

const exporter = new GLTFExporter();
exporter.parse(
  scene,
  function (gltf) {
    fs.writeFileSync("public/source/SwitchCase.glb", Buffer.from(gltf));
    console.log("Saved GLB successfully");
  },
  function (error) {
    console.error(error);
  },
  { binary: true },
);
