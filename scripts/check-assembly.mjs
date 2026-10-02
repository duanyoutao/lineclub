import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { damp } from "../src/motion.ts";
import { PARTS } from "../src/viewer-parts.ts";
async function load(name) {
  const b = await readFile(
    new URL("../public/assets/" + name, import.meta.url),
  );
  return (
    await new GLTFLoader().parseAsync(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      "",
    )
  ).scene;
}
const [original, assembly] = await Promise.all([
  load("archive-cassette.glb"),
  load("archive-assembly.glb"),
]);
const parts = new Map();
// The viewer reads assemblyPart off the top-level nodes and walks up from a hit,
// so that is the contract. A glTF exporter may split a multi-material object into
// several primitives (Blender 5.2 splits Titanium_Fasteners), and those child
// meshes carry no tag of their own.
for (const node of assembly.children)
  assert.ok(
    node.userData.assemblyPart,
    `Top-level node ${node.name} must carry assemblyPart`,
  );
const topLevelParts = new Set(
  assembly.children.map((node) => node.userData.assemblyPart),
);
const vertices = (scene, collect = false) => {
  const points = new Map();
  scene.updateMatrixWorld(true);
  scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const surface = mesh.material.name.replace(/\.\d+$/, "");
    if (surface === "Carbon_Ink") return;
    if (collect) {
      let owner = mesh;
      while (owner && !owner.userData.assemblyPart) owner = owner.parent;
      assert.ok(owner, "Every mesh belongs to a physical assembly");
      parts.set(
        owner.userData.assemblyPart,
        (parts.get(owner.userData.assemblyPart) || 0) + 1,
      );
    }
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const point = new THREE.Vector3()
        .fromBufferAttribute(position, i)
        .applyMatrix4(mesh.matrixWorld);
      points.set(surface + ":" + point.toArray().join(","), { surface, point });
    }
  });
  return points;
};
const a = vertices(original),
  b = vertices(assembly, true);
const expectedParts = [
  "carrier",
  "cover",
  "fasteners",
  "optical-core",
  "optical-lenses",
  "substrate",
];
assert.deepEqual(
  [...parts.keys()].sort(),
  expectedParts,
  "The assembly asset must expose exactly the six physical groups",
);
assert.deepEqual(
  [...topLevelParts].sort(),
  expectedParts,
  "Every group must have at least one top-level node, or the viewer builds an empty group",
);
// The viewer groups meshes and targets part selection by these ids, so the code
// and the baked asset have to agree; renaming either side breaks selection.
assert.deepEqual(
  PARTS.map((part) => part.id).sort(),
  expectedParts,
  "PARTS in src/viewer-parts.ts must match the ids in the assembly asset",
);
for (const part of PARTS)
  assert.ok(parts.get(part.id), `Part ${part.id} has no mesh in the assembly`);
assert.equal(
  new Set(PARTS.map((part) => part.depth)).size,
  PARTS.length,
  "Exploded depths must be distinct so the layers separate",
);
// Compare actual distances: rounding to a fixed grid can split equivalent
// float32 coordinates on either side of a rounding boundary after Blender joins.
function maxVertexError(from, to) {
  const surfaces = new Map();
  for (const { surface, point } of to.values()) {
    if (!surfaces.has(surface)) surfaces.set(surface, []);
    surfaces.get(surface).push(point);
  }
  let max = 0;
  for (const { surface, point } of from.values()) {
    const candidates = surfaces.get(surface) || [];
    let nearest = Infinity;
    for (const candidate of candidates)
      nearest = Math.min(nearest, point.distanceToSquared(candidate));
    max = Math.max(max, Math.sqrt(nearest));
  }
  return max;
}
const vertexError = Math.max(maxVertexError(a, b), maxVertexError(b, a));
assert.ok(
  vertexError < 1e-5,
  `Regrouping must retain assembled geometry within float32 tolerance: ${vertexError}`,
);
const height = new THREE.Box3()
  .setFromObject(assembly)
  .getSize(new THREE.Vector3()).y;
assert.ok(Math.abs(height - 3.7) < 1e-5);
// Interrupted motion retains position and velocity, then converges exactly enough
// for the viewer to snap to the original assembly pose.
const spread = { value: 0, velocity: 0 };
for (let i = 0; i < 25; i++) damp(spread, 1, 5.5, 1 / 60);
const interrupted = spread.value;
damp(spread, 0, 5.5, 1 / 60);
assert.ok(
  Math.abs(spread.value - interrupted) < 0.05,
  "Reassembly must not jump on reversal",
);
for (let i = 0; i < 180; i++) damp(spread, 0, 5.5, 1 / 60);
assert.ok(Math.abs(spread.value) < 0.0001 && Math.abs(spread.velocity) < 0.001);
console.log(
  JSON.stringify(
    {
      parts: Object.fromEntries(parts),
      uniqueSurfaceVertices: a.size,
      vertexError,
      modelHeight: height,
      reassembly: spread.value,
      checks: "passed",
    },
    null,
    2,
  ),
);
