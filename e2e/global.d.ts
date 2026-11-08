// Mirrors the dev/e2e stats probe in src/scene/voxel/stats.tsx.
interface Window {
  __hideoutStats?: { calls: number; triangles: number; frames: number; voxelTriangles: number };
}
