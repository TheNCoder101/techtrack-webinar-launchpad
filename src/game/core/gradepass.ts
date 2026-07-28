import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// V3 Track A6: lightweight always-on-capable grade pass — a single tiny
// ShaderPass adding a vignette + very subtle radial chromatic aberration.
// Deliberately SEPARATE from the heavy selective-bloom/SMAA pipeline in
// postfx.ts, which stays behind its own (currently off-for-every-tier)
// Phase 4 real-device gate. This module is the cheapest possible composer:
// scene render -> grade -> OutputPass, three fullscreen ops total.
//
// Like postfx.ts, this statically imports the three.js postprocessing tree,
// so it must ONLY ever be loaded via dynamic import() (Game.initGradeFX) to
// stay out of the main chunk for tiers that never enable it.
//
// Tone mapping/AA notes:
// - Rendering into a composer target skips the material-level ACES chunk
//   (three only tone-maps when drawing to the canvas); OutputPass reapplies
//   renderer.toneMapping + sRGB at the end, so this path matches the direct
//   render path's A1 look exactly.
// - Composer targets bypass the canvas's native MSAA, so the scene target is
//   created with `samples: 4` (WebGL2 multisampled renderbuffer) to keep
//   edge quality equivalent to the direct path.

const GRADE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Vignette + chromatic aberration in one pass. Both effects key off the
// squared distance from screen center, so the middle of the frame (crosshair,
// the player's own character) stays completely clean and the effect ramps in
// toward corners. Runs pre-tonemap in linear space, which is where a
// brightness-multiplying vignette belongs.
const GRADE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uVignetteStrength;
uniform float uCaStrength;
varying vec2 vUv;
void main() {
  vec2 centered = vUv - 0.5;
  float d2 = dot(centered, centered); // 0 center .. 0.5 corner

  // Radial chromatic aberration: fringe grows with d^3 (d2 * normalize-ish),
  // effectively zero across the middle half of the screen.
  vec2 caOffset = centered * (d2 * uCaStrength);
  vec4 base = texture2D(tDiffuse, vUv);
  float r = texture2D(tDiffuse, vUv - caOffset).r;
  float b = texture2D(tDiffuse, vUv + caOffset).b;

  float vig = 1.0 - smoothstep(0.12, 0.52, d2) * uVignetteStrength;
  gl_FragColor = vec4(vec3(r, base.g, b) * vig, base.a);
}
`;

const VIGNETTE_STRENGTH = 0.3;
// In UV units at the corner: 0.5 (corner d2) * 0.012 * corner radius ~= a
// 2-3 physical-pixel fringe at 390pt/3x — visible as "lens", not as blur.
const CA_STRENGTH = 0.012;

export interface GradeFXPipeline {
  /** Renders one frame through the grade chain (replaces renderer.render). */
  render(): void;
  /** Mirror of renderer.setSize — pass CSS pixel dimensions. */
  setSize(width: number, height: number): void;
  /** Releases all render targets/materials. The pipeline must not be used after. */
  dispose(): void;
}

export function createGradeFXPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera
): GradeFXPipeline {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // HalfFloat keeps the pre-tonemap HDR range (matches what EffectComposer
  // would allocate by default); samples:4 restores MSAA lost by leaving the
  // canvas framebuffer (no-op renderbuffer fallback on WebGL1).
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,
  });

  const composer = new EffectComposer(renderer, target);
  const scenePass = new RenderPass(scene, camera);
  const gradeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uVignetteStrength: { value: VIGNETTE_STRENGTH },
      uCaStrength: { value: CA_STRENGTH },
    },
    vertexShader: GRADE_VERT,
    fragmentShader: GRADE_FRAG,
  });
  const gradePass = new ShaderPass(gradeMaterial, "tDiffuse");
  const outputPass = new OutputPass();
  composer.addPass(scenePass);
  composer.addPass(gradePass);
  composer.addPass(outputPass);

  return {
    render(): void {
      composer.render();
    },

    setSize(width: number, height: number): void {
      // EffectComposer multiplies by the renderer's current pixel ratio.
      composer.setSize(width, height);
    },

    dispose(): void {
      // EffectComposer.dispose only releases its own targets, not added
      // passes — dispose those explicitly (same pattern as postfx.ts).
      scenePass.dispose();
      gradePass.dispose();
      outputPass.dispose();
      composer.dispose();
    },
  };
}
