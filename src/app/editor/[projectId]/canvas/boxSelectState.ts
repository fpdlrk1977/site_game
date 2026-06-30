// Signals that a pointerdown was consumed by a 3D object in the scene,
// so EditorCanvas should not initiate a box-select drag for that press.
// Set by EditorObjectInstance onPointerDown; read & cleared in EditorCanvas handlePointerDown.
export const pointerDownOnObjectRef = { current: false };
