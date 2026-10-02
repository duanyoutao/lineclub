import * as THREE from "three";

/**
 * Per-document artwork for the information substrate.
 *
 * The procedural models carry no UV coordinates, so this follows the archive
 * label's approach: a separate textured plane laid on the face rather than
 * texturing the mesh itself. The plane is parented to the substrate's own
 * diffuser panel, which keeps it out of CardAppearance's one-level walk over
 * group children (that pass disposes the map of any child without a surface
 * name) while still moving with the panel during 拆解.
 *
 * The material is opaque with an alpha cutout rather than transparent: the
 * substrate sits behind the frosted cover, and WebGL's screen-space transmission
 * only resolves opaque geometry behind the glass.
 */
export function findDiffuserPanel(root: THREE.Object3D) {
  let panel: THREE.Mesh | undefined;
  root.traverse((node) => {
    if (panel || !(node as THREE.Mesh).isMesh) return;
    if (node.userData.surface === "Optical_Diffuser") panel = node as THREE.Mesh;
  });
  return panel;
}

export function loadSubstrateTexture(
  source: string,
  resolve: (path: string) => string,
) {
  return new THREE.TextureLoader()
    .loadAsync(resolve(source))
    .then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    });
}

/** Lay the artwork on the panel's front face, fitted with the image's own aspect. */
export function createSubstrateDecal(
  panel: THREE.Mesh,
  texture: THREE.Texture,
  margin = 0.92,
) {
  panel.geometry.computeBoundingBox();
  const box = panel.geometry.boundingBox!.clone();
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const image = texture.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image?.height ? image.width / image.height : 1;
  let width = size.x * margin;
  let height = width / aspect;
  if (height > size.y * margin) {
    height = size.y * margin;
    width = height * aspect;
  }
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      alphaTest: 0.5,
      toneMapped: false,
    }),
  );
  // The cassette faces +Z, and the panel geometry is already in the model frame.
  decal.position.set(center.x, center.y, box.max.z + 0.004);
  panel.add(decal);
  return decal;
}

/** Drops a decal and the texture it owns; nothing is shared between decals. */
export function disposeSubstrateDecal(decal?: THREE.Mesh) {
  if (!decal) return;
  decal.removeFromParent();
  decal.geometry.dispose();
  const material = decal.material as THREE.MeshBasicMaterial;
  material.map?.dispose();
  material.dispose();
}
