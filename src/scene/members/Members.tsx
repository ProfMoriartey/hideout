// All 13 members' figures and props in one merged mesh plus one point cloud
// of particles: two draw calls for the whole cast. Poses, loops, breathing,
// the "?" and the celebration burst run in the vertex shader from the shared
// per-member levels (levels.ts, stepped by RoomLights); this component only
// advances time, so the Canvas never re-renders for a state change.

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { AdditiveBlending, ShaderMaterial } from 'three';
import { buildArts } from './arts';
import { buildCast, buildSparks } from './figure';
import { levels, MEMBER_COUNT, reducedMotion } from './levels';

/** Uniforms shared by both materials; page-lifetime like the levels they point at. */
const shared = {
  uTime: { value: 0 },
  uMotion: { value: 1 },
  uWork: { value: levels.work },
  uCelebrate: { value: levels.celebrate },
};
const uPx = { value: 1 };

const COMMON = /* glsl */ `
#define N ${MEMBER_COUNT}
uniform float uTime;
uniform float uMotion;
uniform float uWork[N];
uniform float uCelebrate[N];
`;

const CAST_VERTEX = /* glsl */ `
${COMMON}
uniform float uLight[N];
uniform float uStale[N];
attribute vec3 pivot;
attribute vec4 axis;
attribute vec4 motion;
attribute vec4 info;
varying vec3 vColor;

vec3 turn(vec3 v, vec3 k, float a) {
  float c = cos(a);
  return v * c + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - c);
}

void main() {
  int m = int(info.x + 0.5);
  float work = uWork[m];
  float cel = uCelebrate[m];
  float awake = max(work, cel);
  float wave = sin(uTime * abs(motion.y) + motion.z) * uMotion;
  float amount = mix(motion.w, axis.w, awake) + motion.x * wave * work;
  vec3 p = position;
  if (motion.y < 0.0) p += axis.xyz * amount;
  else if (amount != 0.0) p = pivot + turn(position - pivot, axis.xyz, amount);
  // Slow breathing while asleep; a hop while celebrating (body parts only).
  p.y += info.y * sin(uTime * 1.3 + motion.z + float(m)) * (1.0 - awake) * uMotion;
  if (info.w > 0.5 && info.w < 1.5) p.y += cel * abs(sin(uTime * 9.0)) * 0.3 * uMotion;
  // The stale "?" collapses to its pivot unless stale.
  if (info.w > 1.5) p = mix(pivot, p, uStale[m]);
  float k = info.z > 1.5 ? 1.0 : info.z > 0.5 ? 0.22 + 0.9 * work + 0.8 * cel : 0.9 * uLight[m];
  vColor = color * k;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const CAST_FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
  #include <colorspace_fragment>
}
`;

const SPARK_VERTEX = /* glsl */ `
${COMMON}
uniform float uPx;
attribute vec4 seed;
varying vec3 vColor;
varying float vAlpha;

void main() {
  int m = int(seed.x + 0.5);
  float c = uCelebrate[m] * uMotion;
  float f = fract(uTime * 0.45 + seed.y);
  vec3 p = position + vec3(seed.z * 0.5 * f, 2.4 * f, seed.w * 0.5 * f);
  float a = uWork[m] * uMotion * (1.0 - f) * smoothstep(0.0, 0.15, f);
  if (c > 0.02) {
    // Done: the same points burst outwards and fade with the celebration.
    p = position + vec3(seed.z, 0.6 + seed.y, seed.w) * (1.0 - c) * 2.6;
    a = c;
  }
  vColor = color;
  vAlpha = a;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = a > 0.01 ? uPx * 0.22 : 0.0;
}
`;

const SPARK_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float s = 1.0 - smoothstep(0.15, 0.5, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vColor, vAlpha * s);
  #include <colorspace_fragment>
}
`;

export function Members() {
  const built = useMemo(() => {
    const arts = buildArts();
    const cast = new ShaderMaterial({
      name: 'members-cast',
      vertexShader: CAST_VERTEX,
      fragmentShader: CAST_FRAGMENT,
      vertexColors: true,
      toneMapped: false,
      uniforms: { ...shared, uLight: { value: levels.light }, uStale: { value: levels.stale } },
    });
    const sparks = new ShaderMaterial({
      name: 'members-sparks',
      vertexShader: SPARK_VERTEX,
      fragmentShader: SPARK_FRAGMENT,
      vertexColors: true,
      toneMapped: false,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { ...shared, uPx },
    });
    return {
      cast: buildCast(arts).geometry,
      sparks: buildSparks(arts),
      castMat: cast,
      sparkMat: sparks,
      shared,
    };
  }, []);
  useEffect(
    () => () => {
      built.cast.dispose();
      built.sparks.dispose();
      built.castMat.dispose();
      built.sparkMat.dispose();
    },
    [built],
  );

  useFrame(({ clock, camera, gl }) => {
    shared.uTime.value = clock.elapsedTime;
    shared.uMotion.value = reducedMotion() ? 0 : 1;
    // Orthographic zoom is CSS pixels per world unit; points are sized in device pixels.
    uPx.value = camera.zoom * gl.getPixelRatio();
  });

  return (
    <group name="members">
      <mesh
        name="cast"
        geometry={built.cast}
        material={built.castMat}
        matrixAutoUpdate={false}
        // Vertices move in the shader; the cast spans the whole hideout anyway.
        frustumCulled={false}
      />
      <points
        name="sparks"
        geometry={built.sparks}
        material={built.sparkMat}
        matrixAutoUpdate={false}
        frustumCulled={false}
      />
    </group>
  );
}
