import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { BLOOM_LAYER } from "./constants";

// EffectComposer post pipeline with *selective* bloom. This module statically
// imports the three.js postprocessing tree, so it must ONLY ever be loaded via
// dynamic import() (Game.initPostFX) — never `import ... from "./postfx"` at
// the top of a file that ships in the main chunk. That keeps the whole
// composer/pass code out of the eagerly-loaded bundle for the (currently: all)
// quality tiers that leave postFX off.
//
// Selective-bloom technique: bloom targets (muzzle-flash particles, tracer
// lines) are additionally tagged with BLOOM_LAYER at creation time. Each frame
// we render *only that layer* into a reduced-resolution offscreen composer,
// blur it with UnrealBloomPass, then render the normal full scene and
// additively composite the bloom texture over it. This differs from the
// canonical three.js "unreal bloom selective" example (which re-renders the
// whole scene with non-bloom materials swapped to black so occluders still
// mask bloom sources): rendering just the layer skips the second full scene
// pass and the per-frame material swap entirely — a near-free bloom render on
// mobile — at the cost of bloom not being depth-occluded by scene geometry.
// For sub-100ms muzzle flashes and tracers that tradeoff is invisible in
// practice and is the whole reason this can run on a phone.

/** Per-axis scale of the bloom composer's buffers relative to the canvas —
 *  0.5 per axis = quarter the pixels. Bloom is a big soft blur; it survives
 *  low resolution basically unharmed, and this keeps the pass cheap at
 *  pixelRatio 2. */
const BLOOM_RESOLUTION_SCALE = 0.5;
const BLOOM_STRENGTH = 1.2;
const BLOOM_RADIUS = 0.4;
// Everything drawn on BLOOM_LAYER is an intentional bloom source, so no
// luminance threshold is needed.
const BLOOM_THRESHOLD = 0;

const MIX_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const MIX_FRAG = `
uniform sampler2D baseTexture;
uniform sampler2D bloomTexture;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
}
`;

export interface PostFXPipeline {
  /** Renders one frame through the composer chain (replaces renderer.render). */
  render(): void;
  /** Mirror of renderer.setSize — pass CSS pixel dimensions. */
  setSize(width: number, height: number): void;
  /** Releases all render targets/materials. The pipeline must not be used after. */
  dispose(): void;
}

export function createPostFXPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera
): PostFXPipeline {
  const size = renderer.getSize(new THREE.Vector2());

  // Offscreen composer: renders ONLY BLOOM_LAYER objects (against the clear
  // color — the sky/world live on layer 0 and are skipped), then blurs them.
  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  const bloomScenePass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x * BLOOM_RESOLUTION_SCALE, size.y * BLOOM_RESOLUTION_SCALE),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD
  );
  bloomComposer.addPass(bloomScenePass);
  bloomComposer.addPass(bloomPass);
  bloomComposer.setSize(size.x * BLOOM_RESOLUTION_SCALE, size.y * BLOOM_RESOLUTION_SCALE);

  // Main composer: normal scene render → additive bloom composite → SMAA
  // (compensates for the native MSAA lost by rendering into composer targets;
  // must run before OutputPass, it works in linear space) → OutputPass
  // (linear→sRGB, matching what a direct renderer.render to canvas does).
  const finalComposer = new EffectComposer(renderer);
  const scenePass = new RenderPass(scene, camera);
  const mixMaterial = new THREE.ShaderMaterial({
    uniforms: {
      baseTexture: { value: null },
      bloomTexture: { value: bloomComposer.renderTarget2.texture },
    },
    vertexShader: MIX_VERT,
    fragmentShader: MIX_FRAG,
  });
  const mixPass = new ShaderPass(mixMaterial, "baseTexture");
  const smaaPass = new SMAAPass();
  const outputPass = new OutputPass();
  finalComposer.addPass(scenePass);
  finalComposer.addPass(mixPass);
  finalComposer.addPass(smaaPass);
  finalComposer.addPass(outputPass);

  return {
    render(): void {
      // Bloom-layer-only render: the camera's mask is temporarily narrowed to
      // BLOOM_LAYER, so this pass draws just the handful of tagged objects.
      camera.layers.set(BLOOM_LAYER);
      bloomComposer.render();
      camera.layers.set(0);
      finalComposer.render();
    },

    setSize(width: number, height: number): void {
      bloomComposer.setSize(width * BLOOM_RESOLUTION_SCALE, height * BLOOM_RESOLUTION_SCALE);
      finalComposer.setSize(width, height);
    },

    dispose(): void {
      // EffectComposer.dispose only releases its own targets, not added
      // passes — dispose those explicitly.
      bloomScenePass.dispose();
      bloomPass.dispose();
      scenePass.dispose();
      mixPass.dispose();
      smaaPass.dispose();
      outputPass.dispose();
      bloomComposer.dispose();
      finalComposer.dispose();
      camera.layers.set(0);
    },
  };
}
