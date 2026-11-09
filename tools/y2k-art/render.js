/**
 * Y2K Futurism art, rendered in the browser with three.js:
 *  - orb-portrait / orb-landscape: a liquid glass orb with water-like caustics
 *    over horizontal light streaks (late-90s CGI wallpaper style), dark;
 *  - torus / blob: chrome objects on a transparent background, for the edges.
 * Everything is procedural (no downloaded textures), so the pictures are ours
 * and ship under the repository's own terms.
 *
 * ?scene=<name> picks the scene. The finished frame is exposed as
 * window.__art = { name, dataUrl } (WebP) for tools/y2k-art/render.mjs.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const SCENES = {
  'orb-portrait': { width: 900, height: 1600, kind: 'orb', camZ: 6.4, orbX: 0.42, orbY: 0.95 },
  'orb-landscape': { width: 1600, height: 1000, kind: 'orb', camZ: 5.6, orbX: 1.75, orbY: 0.2 },
  torus: { width: 560, height: 560, kind: 'torus' },
  blob: { width: 560, height: 560, kind: 'blob' },
};

/** Small deterministic PRNG so every run draws the same picture. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * Equirectangular environment. 'night' (behind the orb): deep navy sky with a
 * band of horizontal speed streaks at the horizon. 'chrome' (for the metal
 * objects): a bright silver-blue sky over a dark ground with a sharp horizon,
 * the classic liquid-chrome reflection. Both get a white "sun" and soft light
 * panels for highlights.
 */
function environmentCanvas(kind) {
  const chrome = kind === 'chrome';
  const W = 2048;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H);
  const stops = chrome
    ? [[0, '#f4f8ff'], [0.3, '#b9c9ea'], [0.47, '#7f97cf'], [0.5, '#0a1024'], [0.62, '#26324f'], [1, '#0b1020']]
    : [[0, '#000105'], [0.38, '#050d33'], [0.5, '#1c3bd0'], [0.56, '#071450'], [1, '#01020a']];
  for (const [at, color] of stops) sky.addColorStop(at, color);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  const rand = rng(2000);
  {
    for (let i = 0; i < (chrome ? 90 : 320); i++) {
      const y = H * (0.5 + (rand() - 0.5) * (chrome ? 0.5 : 0.3) * (0.3 + rand()));
      const len = W * (0.08 + rand() * 0.5);
      const x = rand() * W;
      const h = 1 + rand() * 7;
      const color = rand() < 0.35 ? '255,255,255' : rand() < 0.6 ? '170,205,255' : '80,120,255';
      const a = 0.2 + rand() * 0.75;
      const grad = g.createLinearGradient(x, 0, x + len, 0);
      grad.addColorStop(0, `rgba(${color},0)`);
      grad.addColorStop(0.5, `rgba(${color},${a})`);
      grad.addColorStop(1, `rgba(${color},0)`);
      g.filter = `blur(${1 + rand() * 3}px)`;
      g.fillStyle = grad;
      g.fillRect(x, y, len, h);
      if (x + len > W) g.fillRect(x - W, y, len, h); // wrap around the seam
    }
  }
  g.filter = 'blur(18px)';
  // Soft light panels (studio-style) for chrome highlights.
  for (const [x, y, w, h, a] of [
    [0.12, 0.18, 0.1, 0.16, 0.85],
    [0.62, 0.14, 0.16, 0.08, 0.7],
    [0.86, 0.3, 0.05, 0.22, 0.6],
    [0.4, 0.78, 0.2, 0.05, 0.35],
  ]) {
    g.fillStyle = `rgba(225,236,255,${a})`;
    g.fillRect(x * W, y * H, w * W, h * H);
  }
  // The sun.
  g.filter = 'none';
  const sun = g.createRadialGradient(0.3 * W, 0.32 * H, 0, 0.3 * W, 0.32 * H, 90);
  sun.addColorStop(0, 'rgba(255,255,255,1)');
  sun.addColorStop(0.25, 'rgba(235,242,255,0.95)');
  sun.addColorStop(1, 'rgba(120,160,255,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H);
  return c;
}

/** Smooth sphere-like mesh (no UV seam, so reflections stay clean). */
function smoothBall(detail, displace) {
  let geo = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    v.multiplyScalar(1 + displace(v.x, v.y, v.z));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT licence).
const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

/** Glowing water-caustic wisps inside the orb (additive, drawn over the glass). */
function causticsMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
      void main(){
        vPos = position;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
      void main(){
        vec3 q = vPos * 1.6;
        q += 0.45 * vec3(snoise(q*0.9+3.1), snoise(q*0.9+7.7), snoise(q*0.9+1.3));
        float n = snoise(q*1.4) + 0.5*snoise(q*2.9+11.0);
        float ridge = pow(1.0 - abs(n), 7.0);
        float fine = pow(1.0 - abs(snoise(q*4.2+5.0)), 10.0) * 0.6;
        float facing = clamp(dot(vNormal, vView), 0.0, 1.0);
        float rim = pow(1.0 - facing, 2.2);
        float a = (ridge + fine) * (0.35 + 0.65 * facing) + rim * 0.35;
        vec3 col = mix(vec3(0.35,0.5,1.0), vec3(0.92,0.96,1.0), clamp(ridge*1.2,0.0,1.0));
        gl_FragColor = vec4(col * a * 0.85, 1.0);
      }`,
  });
}

function render() {
  const name = new URLSearchParams(location.search).get('scene') ?? 'orb-portrait';
  const cfg = SCENES[name];
  if (!cfg) throw new Error(`Unknown scene ${name}`);
  const alpha = cfg.kind !== 'orb';

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(cfg.width, cfg.height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = alpha ? 1.0 : 0.85;
  renderer.setClearColor(0x000000, alpha ? 0 : 1);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const envTex = new THREE.CanvasTexture(environmentCanvas(alpha ? 'chrome' : 'night'));
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(envTex).texture;

  const camera = new THREE.PerspectiveCamera(32, cfg.width / cfg.height, 0.1, 100);

  if (cfg.kind === 'orb') {
    scene.background = envTex;
    scene.backgroundBlurriness = 0.02;
    scene.backgroundIntensity = 0.5;
    scene.backgroundRotation.set(0, 0.4, 0);
    camera.position.set(0, 0.05, cfg.camZ);
    camera.lookAt(0, 0, 0);

    const wobble = (x, y, z) => 0.018 * Math.sin(5.1 * x + 1.3) * Math.sin(4.3 * y + 0.7) + 0.012 * Math.sin(7.7 * z + 2.1);
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xaecbff,
      metalness: 0,
      roughness: 0.04,
      transmission: 1,
      thickness: 1.6,
      ior: 1.36,
      attenuationColor: new THREE.Color(0x2c4dff),
      attenuationDistance: 2.4,
      iridescence: 0.35,
      iridescenceIOR: 1.25,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.5,
    });
    const orb = new THREE.Mesh(smoothBall(48, wobble), glass);
    orb.position.set(cfg.orbX, cfg.orbY, 0);
    orb.rotation.set(0.25, -0.4, 0.1);
    scene.add(orb);

    const inner = new THREE.Mesh(smoothBall(32, () => -0.02), causticsMaterial());
    inner.position.copy(orb.position);
    inner.rotation.copy(orb.rotation);
    inner.renderOrder = 2;
    scene.add(inner);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(cfg.width, cfg.height), 0.55, 0.7, 0.78));
    composer.addPass(new OutputPass());
    composer.render();
  } else {
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    const chrome = new THREE.MeshPhysicalMaterial({
      color: 0xf2f6ff,
      metalness: 1,
      roughness: 0.05,
      iridescence: 0.45,
      iridescenceIOR: 1.6,
      iridescenceThicknessMinimum: 200,
      iridescenceThicknessMaximum: 600,
      clearcoat: 1,
      envMapIntensity: 1.25,
    });
    let mesh;
    if (cfg.kind === 'torus') {
      mesh = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.36, 96, 192), chrome);
      mesh.rotation.set(1.05, 0.35, 0.5);
    } else {
      const blobby = (x, y, z) =>
        0.22 * Math.sin(2.2 * x + 0.4) * Math.cos(1.7 * y - 0.3) + 0.16 * Math.sin(2.6 * z + 1.9) * Math.sin(1.3 * x + 2.2) + 0.08 * Math.cos(3.1 * y + 0.8);
      mesh = new THREE.Mesh(smoothBall(48, blobby), chrome);
      mesh.scale.setScalar(1.05);
      mesh.rotation.set(0.4, 0.9, 0.1);
    }
    scene.add(mesh);
    renderer.render(scene, camera);
  }

  const dataUrl = renderer.domElement.toDataURL('image/webp', alpha ? 0.9 : 0.82);
  window.__art = { name, dataUrl };
  document.getElementById('status').textContent = `${name}: done`;
}

try {
  render();
} catch (err) {
  window.__art = { error: String(err) };
  document.getElementById('status').textContent = String(err);
}
