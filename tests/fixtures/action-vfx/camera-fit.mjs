// Test-only finite camera fitting and projection evidence. The runtime keeps
// its own scene, gameplay target and geometry ownership.
export function boxCorners(THREE, box) {
  if (box.isEmpty() || [...box.min.toArray(), ...box.max.toArray()].some(value => !Number.isFinite(value) || Math.abs(value) > 1000000)) throw Error('Finite bounded framing box required');
  const points = []; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) points.push(new THREE.Vector3(x, y, z)); return points;
}
export function fitCameraToBox(THREE, camera, box, padding = 1.12) {
  const corners = boxCorners(THREE, box), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  if (!camera.isPerspectiveCamera || padding < 1.05 || padding > 2 || size.length() <= 0) throw Error('Finite padded perspective fit required');
  const direction = new THREE.Vector3(.7, .4, 1.8).normalize(); camera.position.copy(center).add(direction); camera.lookAt(center); camera.updateMatrixWorld(true);
  const inverse = camera.quaternion.clone().invert(), tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanX = tanY * camera.aspect;
  const local = corners.map(point => point.clone().sub(center).applyQuaternion(inverse));
  const distance = Math.max(.01, ...local.flatMap(point => [point.z + padding * Math.abs(point.x) / tanX, point.z + padding * Math.abs(point.y) / tanY]));
  camera.position.copy(center).addScaledVector(direction, distance); camera.lookAt(center); camera.near = Math.max(.0001, (distance - Math.max(...local.map(point => point.z))) * .01); camera.far = distance + size.length() * 3;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  return {minimum: box.min.toArray(), maximum: box.max.toArray(), padding, center: center.toArray(), distance, near: camera.near, far: camera.far};
}
export function projectionEvidence(camera, groups) {
  let count = 0, maximumAbsX = 0, maximumAbsY = 0, minimumZ = 1, maximumZ = -1;
  for (const group of groups) for (const point of group.points) {
    if (++count > 32768) throw Error('Framing projection point budget exceeded');
    const projected = point.clone().project(camera); maximumAbsX = Math.max(maximumAbsX, Math.abs(projected.x)); maximumAbsY = Math.max(maximumAbsY, Math.abs(projected.y)); minimumZ = Math.min(minimumZ, projected.z); maximumZ = Math.max(maximumZ, projected.z);
    if (![projected.x, projected.y, projected.z].every(Number.isFinite) || Math.abs(projected.x) > .999999 || Math.abs(projected.y) > .999999 || projected.z < -1 || projected.z > 1) throw Error('Actual promised render extent is clipped: ' + group.role + ' ' + JSON.stringify(projected.toArray()));
  }
  return {status: 'passed', points: count, maximumAbsX, maximumAbsY, minimumZ, maximumZ, groups: groups.map(group => ({role: group.role, points: group.points.length}))};
}
