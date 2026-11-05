// Independent second GLB parse and mixer evaluation. This test oracle does not
// call the action scheduler, use its normalized clips, or certify model quality.
export function createGlbPoseOracle({THREE, clone, source, declaration}) {
  function pose({actionId, time, movementMatrix}) {
    const action = declaration.actions.find(value => value.id === actionId), clip = source.animations.find(value => value.name === action?.clip);
    if (!action || !clip || !Number.isFinite(time) || time < 0) throw Error('Exact independently parsed composite clip and time required');
    const scene = new THREE.Scene(), movement = new THREE.Group(), visual = clone(source.scene); movement.matrixAutoUpdate = false; movement.matrix.copy(movementMatrix); scene.add(movement); movement.add(visual);
    const mixer = new THREE.AnimationMixer(visual), playback = mixer.clipAction(clip); playback.setLoop(THREE.LoopOnce, 1); playback.clampWhenFinished = true; playback.play(); mixer.setTime(Math.min(time, action.duration));
    scene.updateMatrixWorld(true); visual.traverse(node => { if (node.isSkinnedMesh) node.skeleton.update(); });
    return {visual, dispose() { mixer.stopAllAction(); mixer.uncacheRoot(visual); movement.removeFromParent(); }};
  }
  const nodes = root => { const result = []; root.traverse(node => result.push(node)); if (result.length > 10000) throw Error('Independent pose node budget exceeded'); return result; };
  return Object.freeze({
    compare({visualRoot, movementMatrix, actionId, time}) {
      const expected = pose({actionId, time, movementMatrix});
      try {
        visualRoot.updateWorldMatrix(true, true); visualRoot.traverse(node => { if (node.isSkinnedMesh) node.skeleton.update(); });
        const actualNodes = nodes(visualRoot), expectedNodes = nodes(expected.visual); if (actualNodes.length !== expectedNodes.length) throw Error('Actual model hierarchy differs from independent GLB parse');
        let maximumMatrixError = 0, maximumVertexError = 0, sampledVertices = 0, sampledMeshes = 0;
        for (let index = 0; index < actualNodes.length; index++) {
          const actual = actualNodes[index], reference = expectedNodes[index];
          if (actual.name !== reference.name || actual.type !== reference.type) throw Error('Actual model node identity differs from independent GLB parse');
          for (let component = 0; component < 16; component++) maximumMatrixError = Math.max(maximumMatrixError, Math.abs(actual.matrixWorld.elements[component] - reference.matrixWorld.elements[component]));
          if (actual.isMesh && sampledMeshes < 32) {
            const count = actual.geometry.getAttribute('position')?.count; if (!count || count !== reference.geometry.getAttribute('position')?.count) throw Error('Actual mesh differs from independent source'); sampledMeshes++;
            for (const vertex of new Set([0, Math.floor(count / 2), count - 1])) {
              const a = actual.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(actual.matrixWorld), b = reference.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(reference.matrixWorld);
              maximumVertexError = Math.max(maximumVertexError, a.distanceTo(b)); sampledVertices++;
            }
          }
        }
        if (!Number.isFinite(maximumMatrixError) || !Number.isFinite(maximumVertexError) || maximumMatrixError > 1e-5 || maximumVertexError > 1e-5) throw Error('Actual delivered composite pose differs from independent GLB oracle: ' + JSON.stringify({time, maximumMatrixError, maximumVertexError}));
        return {status: 'passed', time, action: actionId, nodes: actualNodes.length, sampledMeshes, sampledVertices, maximumMatrixError, maximumVertexError,
          source: 'Separate parse of the exact delivered GLB; separate Three.js mixer and original exported composite clip', scope: 'All node matrices and bounded sampled deformed vertices; no full-surface or human visual acceptance'};
      } finally { expected.dispose(); }
    },
    release({actionId, cue, movementMatrix, actualOrigin}) {
      const expected = pose({actionId, time: cue.start, movementMatrix});
      try {
        const anchor = declaration.anchors.find(value => value.id === cue.anchor), candidates = nodes(expected.visual).filter(node => node.userData?.name === anchor.node || node.name === anchor.node);
        if (candidates.length !== 1) throw Error('Independent GLB exported anchor is missing or ambiguous');
        const local = new THREE.Matrix4().compose(new THREE.Vector3(...cue.transform.position), new THREE.Quaternion(...cue.transform.orientation), new THREE.Vector3().setScalar(cue.transform.scale));
        const position = new THREE.Vector3().setFromMatrixPosition(candidates[0].matrixWorld.clone().multiply(local)).toArray(), error = Math.hypot(...position.map((value, index) => value - actualOrigin[index]));
        if (!Number.isFinite(error) || error > 1e-5) throw Error('Actual release origin differs from independent exact GLB pose: ' + JSON.stringify({cue: cue.id, time: cue.start, expected: position, actual: actualOrigin, error}));
        return {cue: cue.id, time: cue.start, expectedOrigin: position, actualOrigin: [...actualOrigin], error, status: 'passed'};
      } finally { expected.dispose(); }
    }
  });
}
