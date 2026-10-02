/**
 * The six physical groups the archive box separates into. These ids must match
 * the `assemblyPart` extras baked into public/assets/archive-assembly.glb: the
 * viewer groups meshes by them and part selection targets them. Kept in its own
 * dependency-free module so scripts/check-assembly.mjs can assert the match
 * without importing the WebGL viewer.
 */
export const PARTS = [
  { id: "fasteners", label: "紧固件", en: "FASTENERS", depth: 2.75 },
  { id: "cover", label: "透明盖板", en: "OPTICAL COVER", depth: 1.85 },
  {
    id: "optical-lenses",
    label: "折射环组",
    en: "REFRACTIVE RINGS",
    depth: 0.75,
  },
  { id: "optical-core", label: "光学核心", en: "OPTICAL CORE", depth: -0.15 },
  { id: "substrate", label: "信息基板", en: "SUBSTRATE", depth: -1.1 },
  { id: "carrier", label: "背板与框架", en: "CARRIER", depth: -2.05 },
] as const;
