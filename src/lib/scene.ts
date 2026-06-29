export function createEmptyScene() {
  return {
    version: 1,
    environment: {
      background: '#1a1a2e',
      fog: null,
      ambientLight: { color: '#ffffff', intensity: 0.5 },
      directionalLight: { color: '#ffffff', intensity: 1, position: [10, 10, 10] },
    },
    camera: {
      position: [0, 5, 10],
      target: [0, 0, 0],
      fov: 75,
    },
    objects: [],
  };
}
