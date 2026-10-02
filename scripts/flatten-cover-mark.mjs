// Re-derive the printed Rhine Lab mark in the exported GLBs as one flat face per
// stroke, matching art/build_archive.py. The Blender build that produced these
// assets (glTF I/O v5.2.40) is newer than any Blender installed here, so the
// shipped models are brought in line by keeping the printed face of every stroke
// and dropping its walls and back face: the walls are what pierced the
// neighbouring stroke and flickered under the long detail lens, while the printed
// plane and the silhouette stay exactly where they were. Re-running this on an
// already flattened export changes nothing.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const MATERIAL = 'Cover_Mark';
const JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
// art/build_archive.py: MARK_DEPTH -0.110, MARK_THICK 0.003, MARK_STEP 0.0016 and
// the export's doubling of the depth axis, so stroke i prints at 0.226 - 0.0032 i.
const PLANES = [0, 1, 2, 3, 4].map(i => Number((0.226 - 0.0032 * i).toFixed(6)));
const PLANE_TOLERANCE = 1e-4;
const FLAT = 0.9;
const files = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
const check = process.argv.includes('--check');
if (!files.length) files.push('public/assets/archive-cassette.glb', 'public/assets/archive-assembly.glb');

function parse(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) throw new Error('not a glb');
  const chunks = {};
  for (let offset = 12; offset < buffer.readUInt32LE(8);) {
    const length = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4);
    chunks[type] = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;
  }
  return { json: JSON.parse(chunks[JSON_CHUNK].toString('utf8')), bin: Buffer.from(chunks[BIN_CHUNK]) };
}
function write(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
  jsonBytes.copy(jsonChunk);
  const binChunk = Buffer.alloc(Math.ceil(bin.length / 4) * 4, 0);
  bin.copy(binChunk);
  json.buffers[0].byteLength = binChunk.length;
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12); out.writeUInt32LE(JSON_CHUNK, 16); jsonChunk.copy(out, 20);
  const header = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, header); out.writeUInt32LE(BIN_CHUNK, header + 4); binChunk.copy(out, header + 8);
  return out;
}
const SIZE = { 5126: 4, 5125: 4, 5123: 2 };
const Type = componentType => componentType === 5125 ? Uint32Array : componentType === 5123 ? Uint16Array : Float32Array;
function view(json, bin, accessor) {
  const { bufferView, byteOffset = 0, count, componentType, type } = json.accessors[accessor];
  const components = type === 'VEC3' ? 3 : type === 'VEC2' ? 2 : 1;
  const view = json.bufferViews[bufferView];
  const offset = (view.byteOffset ?? 0) + byteOffset;
  const stride = view.byteStride ?? 0;
  if (!stride) return new (Type(componentType))(bin.buffer, bin.byteOffset + offset, count * components);
  const data = new (Type(componentType))(count * components);
  for (let i = 0; i < count; i++)
    for (let c = 0; c < components; c++)
      data[i * components + c] = new (Type(componentType))(bin.buffer, bin.byteOffset + offset + i * stride + c * SIZE[componentType], 1)[0];
  return data;
}

const report = [];
for (const file of files) {
  const { json, bin } = parse(await readFile(resolve(file)));
  const material = json.materials.findIndex(m => m.name === MATERIAL);
  if (material < 0) throw new Error(`${file}: ${MATERIAL} is missing`);
  const planes = {};
  let before = 0, after = 0;
  json.meshes.forEach(mesh => {
    for (const primitive of mesh.primitives) {
      if (primitive.material !== material) continue;
      if (primitive.indices === undefined) throw new Error(`${file}: the printed mark is not indexed`);
      const indices = view(json, bin, primitive.indices);
      const normals = view(json, bin, primitive.attributes.NORMAL);
      const positions = view(json, bin, primitive.attributes.POSITION);
      const kept = [], renormalize = new Set();
      for (let i = 0; i < indices.length; i += 3) {
        const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
        const z = (normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2]) / 3;
        if (Math.abs(z) < FLAT) continue;
        const plane = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3;
        const index = PLANES.findIndex(expected => Math.abs(expected - plane) < PLANE_TOLERANCE);
        if (index < 0) continue;
        kept.push(a, b, c);
        planes[index] = (planes[index] ?? 0) + 1;
        for (const vertex of [a, b, c]) renormalize.add(vertex);
      }
      // The + and - strokes were exported inside out; the print always faces out.
      // Renormalise only once the selection is complete, because some strokes
      // share vertices between their printed face and the dropped back face.
      for (const vertex of renormalize) {
        normals[vertex * 3] = 0; normals[vertex * 3 + 1] = 0; normals[vertex * 3 + 2] = 1;
      }
      before += indices.length / 3;
      after += kept.length / 3;
      if (!check) {
        indices.set(kept);
        json.accessors[primitive.indices].count = kept.length;
      }
    }
  });
  report.push({ file, trianglesBefore: before, trianglesAfter: after, printedFacesPerStroke: PLANES.map((_, i) => planes[i] ?? 0) });
  if (!check) await writeFile(resolve(file), write(json, bin));
}
console.log(JSON.stringify(report, null, 2));
console.log(check ? 'Checked the printed faces without writing.' : 'Kept one printed face per stroke of the cover mark; all other geometry untouched.');
