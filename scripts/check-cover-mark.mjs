// The Rhine Lab mark printed on the archive cover reuses the interface's own
// SVG strokes as flat bands. Where its strokes cross (the two lobes, and the two
// strokes of the +) separate shells must not interpenetrate: interior walls then
// show through the neighbouring band and fight it in the depth buffer under the
// long detail lens, which reads as a dark patch that flickers while the camera
// moves. This check proves the printed silhouette is unchanged and that no two
// triangles of the mark meet anywhere but along their own edges.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// COVER_MARK_FILES lets a previous export be fingerprinted again, which is how
// the recorded silhouette below is re-derived after an intentional art change.
const FILES = (process.env.COVER_MARK_FILES ?? 'public/assets/archive-cassette.glb,public/assets/archive-assembly.glb').split(',');
const MATERIAL = 'Cover_Mark';
// Rasterised footprint of the printed mark on the cover plane, svg user units.
// The printed silhouette of the release before the union. Triangulation changes
// move a few boundary pixels in the raster, so the area is compared with a
// tolerance while the bounding box has to match exactly; a real change to the
// mark moves thousands of pixels.
const GOLDEN = { pixels: 459450, width: 1.75, height: 0.79493, tolerance: 0.005 };
// The printed planes from art/build_archive.py: MARK_DEPTH -0.110, MARK_THICK 0.003,
// MARK_STEP 0.0016 and the export's doubled depth axis, so stroke i prints at 0.226 - 0.0032 i.
const PRINTED_PLANES = [0, 1, 2, 3, 4].map(i => Number((0.226 - 0.0032 * i).toFixed(6)));
const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const EPS = 1e-9;

function glb(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  return { json, bin: buffer.subarray(20 + jsonLength + 8) };
}
function accessor(json, bin, index) {
  const a = json.accessors[index], bv = json.bufferViews[a.bufferView];
  const [Type, size] = COMP[a.componentType], n = NUM[a.type];
  const offset = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = bv.byteStride ?? 0;
  const out = new Type(a.count * n);
  if (!stride || stride === size * n) out.set(new Type(bin.buffer, bin.byteOffset + offset, a.count * n));
  else for (let i = 0; i < a.count; i++) out.set(new Type(bin.buffer, bin.byteOffset + offset + i * stride, n), i * n);
  return out;
}
const mul = (m, v) => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
];
function nodeMatrix(node) {
  if (!node) return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function markTriangles(buffer, material) {
  const { json, bin } = glb(buffer);
  const index = json.materials.findIndex(m => m.name === material);
  assert.ok(index >= 0, `material ${material} is missing`);
  const triangles = [];
  json.meshes.forEach((mesh, meshIndex) => {
    if (!mesh.primitives.some(p => p.material === index)) return;
    const matrix = nodeMatrix(json.nodes.find(n => n.mesh === meshIndex));
    for (const primitive of mesh.primitives) {
      if (primitive.material !== index || (primitive.mode ?? 4) !== 4) continue;
      const position = accessor(json, bin, primitive.attributes.POSITION);
      const normalAttribute = accessor(json, bin, primitive.attributes.NORMAL);
      const indices = accessor(json, bin, primitive.indices);
      for (let i = 0; i < indices.length; i += 3) {
        const key = [indices[i], indices[i + 1], indices[i + 2]].map(v => `${meshIndex}:${v}`);
        const point = [0, 1, 2].map(k => {
          const v = indices[i + k] * 3;
          return mul(matrix, [position[v], position[v + 1], position[v + 2]]);
        });
        const normal = [0, 1, 2].map(k => {
          const v = indices[i + k] * 3;
          return [normalAttribute[v], normalAttribute[v + 1], normalAttribute[v + 2]];
        }).reduce((sum, n) => [sum[0] + n[0] / 3, sum[1] + n[1] / 3, sum[2] + n[2] / 3], [0, 0, 0]);
        triangles.push({ point, key, normal });
      }
    }
  });
  assert.ok(triangles.length > 200, 'the printed mark is missing from the export');
  return triangles;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const unit = v => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const signs = values => values.every(v => v > EPS) || values.every(v => v < -EPS);
const faceNormal = triangle => cross(sub(triangle.point[1], triangle.point[0]), sub(triangle.point[2], triangle.point[0]));
/** Strictly inside a triangle's own plane, ignoring winding. */
function inside(point, triangle) {
  const normal = unit(cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0])));
  const side = [0, 1, 2].map(i => dot(cross(sub(triangle[(i + 1) % 3], triangle[i]), sub(point, triangle[i])), normal));
  return signs(side);
}
/** Interior contact between two triangles; touching edges and vertices stay silent. */
function contact(a, b) {
  const n2 = cross(sub(b.point[1], b.point[0]), sub(b.point[2], b.point[0]));
  const d = a.point.map(v => dot(n2, sub(v, b.point[0])));
  if (signs(d)) return null;
  const n1 = cross(sub(a.point[1], a.point[0]), sub(a.point[2], a.point[0]));
  const e = b.point.map(v => dot(n1, sub(v, a.point[0])));
  if (signs(e)) return null;
  if (d.every(v => Math.abs(v) < EPS)) {
    const overlap = b.point.some(p => inside(p, a.point)) || a.point.some(p => inside(p, b.point));
    return overlap ? { kind: 'coplanar', at: a.point[0] } : null;
  }
  const cuts = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    if ((d[i] > 0) !== (d[j] > 0)) cuts.push(mix(a.point[i], a.point[j], d[i] / (d[i] - d[j])));
  }
  if (cuts.length !== 2) return null;
  const middle = mix(cuts[0], cuts[1], 0.5);
  if (Math.hypot(...sub(cuts[0], cuts[1])) < 1e-6) return null;
  // A shared edge cuts along both boundaries; a real pierce runs through both insides.
  return inside(middle, a.point) && inside(middle, b.point) ? { kind: 'crossing', at: middle } : null;
}

/** Footprint fingerprint: the printed faces rasterised on the cover plane. */
function footprint(triangles, step = 0.0012) {
  const printed = triangles.filter(t => {
    if (Math.abs(t.normal[2]) < 0.9) return false;
    const plane = (t.point[0][2] + t.point[1][2] + t.point[2][2]) / 3;
    return PRINTED_PLANES.some(expected => Math.abs(expected - plane) < 1e-4);
  });
  const xs = printed.flatMap(t => t.point.map(v => v[0])), ys = printed.flatMap(t => t.point.map(v => v[1]));
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const width = Math.ceil((Math.max(...xs) - x0) / step), height = Math.ceil((Math.max(...ys) - y0) / step);
  const grid = new Uint8Array(width * height);
  for (const t of printed) {
    const px = t.point.map(v => (v[0] - x0) / step), py = t.point.map(v => (v[1] - y0) / step);
    const minY = Math.max(0, Math.floor(Math.min(...py))), maxY = Math.min(height - 1, Math.ceil(Math.max(...py)));
    const minX = Math.max(0, Math.floor(Math.min(...px))), maxX = Math.min(width - 1, Math.ceil(Math.max(...px)));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const side = [0, 1, 2].map(i => {
          const j = (i + 1) % 3;
          return (px[j] - px[i]) * (y + 0.5 - py[i]) - (py[j] - py[i]) * (x + 0.5 - px[i]);
        });
        if (side.every(v => v <= EPS) || side.every(v => v >= -EPS)) grid[y * width + x] = 1;
      }
    }
  }
  let pixels = 0;
  for (const value of grid) pixels += value;
  const zs = printed.flatMap(t => t.point.map(v => v[2]));
  return {
    hash: createHash('sha256').update(grid).digest('hex').slice(0, 32),
    pixels,
    width: Math.max(...xs) - x0,
    height: Math.max(...ys) - y0,
    depth: Math.max(...zs) - Math.min(...zs),
  };
}

const results = { material: MATERIAL, files: {}, errors: [] };
for (const file of FILES) {
  const triangles = markTriangles(await readFile(resolve(file)), MATERIAL);
  const plane = t => (t.point[0][2] + t.point[1][2] + t.point[2][2]) / 3;
  let crossing = 0, coplanar = 0, folded = 0;
  const spots = [], folds = [], conflicts = [];
  for (let i = 0; i < triangles.length; i++) {
    for (let j = i + 1; j < triangles.length; j++) {
      if (triangles[i].key.some(k => triangles[j].key.includes(k))) continue;
      const hit = contact(triangles[i], triangles[j]);
      if (!hit) continue;
      if (hit.kind === 'coplanar') {
        coplanar++;
        // A stroke's own offset folds over itself where the spine turns sharply;
        // that stays on one printed plane, so it cannot flicker.
        const sameFace = Math.abs(plane(triangles[i]) - plane(triangles[j])) < 1e-4;
        if (sameFace) { folded++; if (folds.length < 8) folds.push(Number(plane(triangles[i]).toFixed(4))); }
        else {
          conflicts.push({
            planes: [triangles[i], triangles[j]].map(t => Number(plane(t).toFixed(4))),
            normalZ: [triangles[i], triangles[j]].map(t => Math.sign(faceNormal(t)[2])),
            at: hit.at.map(v => Number(v.toFixed(4))),
          });
          spots.push(hit.at);
        }
      } else { crossing++; if (spots.length < 400) spots.push(hit.at); }
    }
  }
  const bounds = spots.length ? [0, 1].map(axis => [Math.min(...spots.map(p => p[axis])), Math.max(...spots.map(p => p[axis]))].map(v => Number(v.toFixed(4)))) : null;
  const key = file.includes('assembly') ? 'assembly' : 'cassette';
  results.files[key] = { file, triangles: triangles.length, crossing, coplanar, coplanarWithinOnePrint: folded, foldedPlanes: folds, coplanarConflicts: conflicts, crossingBoundsXY: bounds, ...footprint(triangles) };
}
await mkdir('verification/cover-mark', { recursive: true });
await writeFile('verification/cover-mark/results.json', JSON.stringify(results, null, 2));
for (const [key, value] of Object.entries(results.files)) {
  assert.equal(value.crossing, 0, `${value.file}: ${value.crossing} triangle pairs pierce each other inside the printed mark (${JSON.stringify(value.crossingBoundsXY)})`);
  assert.equal(value.coplanar, 0, `${value.file}: ${value.coplanar} faces of the print overlap another face on the same plane`);
  assert.ok(Math.abs(value.width - GOLDEN.width) < 1e-3 && Math.abs(value.height - GOLDEN.height) < 1e-3, `${value.file}: the printed silhouette changed size (${value.width} x ${value.height})`);
  assert.ok(Math.abs(value.pixels - GOLDEN.pixels) / GOLDEN.pixels < GOLDEN.tolerance, `${value.file}: the printed area changed (${value.pixels} px vs ${GOLDEN.pixels})`);
}
console.log(JSON.stringify(results, null, 2));
console.log('Printed mark: flat print faces, no piercing shells and an unchanged silhouette.');
