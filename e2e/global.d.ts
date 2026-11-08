// Mirrors the dev/e2e stats probe in src/scene/voxel/stats.tsx (e2e has its own tsconfig).
interface Window {
  __hideoutStats?: {
    calls: number;
    triangles: number;
    frames: number;
    voxelTriangles: number;
    zoom: number;
    minZoom: number;
    maxZoom: number;
    azimuth: number;
    polar: number;
  };
}
