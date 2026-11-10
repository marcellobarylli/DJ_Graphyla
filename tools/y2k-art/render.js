/**
 * Y2K Futurism art, rendered in the browser with three.js:
 *  - orb-portrait / orb-landscape: a liquid glass orb with water-like caustics
 *    over horizontal light streaks (late-90s CGI wallpaper style), dark;
 *  - torus / blob: chrome objects on a transparent background, for the edges;
 *  - man / woman: full-body chrome figures wearing DJ headphones, on a
 *    transparent background (meshes from bodies.py, see figureScene);
 *  - man-dance / woman-dance: sprite sheets of the same figures dancing
 *    (src/ui/djSheet.ts has the layout, pose.js the choreography).
 * The orb, torus and blob are procedural (no downloaded textures), and the
 * figures are built from MakeHuman's CC0 assets, so the pictures are ours and
 * ship under the repository's own terms.
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
import { DJ_SHEET } from '../../src/ui/djSheet.ts';
import { dancePose, movePose, posed, readFigure, stillPose } from './pose.js';

const SCENES = {
  'orb-portrait': { width: 900, height: 1600, kind: 'orb', camZ: 6.4, orbX: 0.42, orbY: 0.95 },
  'orb-landscape': { width: 1600, height: 1000, kind: 'orb', camZ: 5.6, orbX: 1.75, orbY: 0.2 },
  torus: { width: 560, height: 560, kind: 'torus' },
  blob: { width: 560, height: 560, kind: 'blob' },
  man: { kind: 'figure', figure: 'man', turn: 0.38 },
  woman: { kind: 'figure', figure: 'woman', turn: -0.38 },
  // The sheets are drawn at 3/4 of the still's size: plenty for a figure in motion, and much lighter.
  'man-dance': { kind: 'figure', figure: 'man', turn: 0.38, dance: true, scale: 0.75 },
  'woman-dance': { kind: 'figure', figure: 'woman', turn: -0.38, dance: true, scale: 0.75 },
};

/**
 * The frames of a figure scene: one still, or a dance sheet with the loop
 * on the first row and the spin on the second. Each frame is a pose and an
 * extra turn (radians) of the whole figure.
 */
function figureFrames(cfg) {
  if (!cfg.dance) return [[{ rotations: stillPose(cfg.figure), spin: 0 }]];
  const { loopFrames, moveFrames } = DJ_SHEET;
  return [
    Array.from({ length: loopFrames }, (_, i) => ({ rotations: dancePose(cfg.figure, i / loopFrames), spin: 0 })),
    Array.from({ length: moveFrames }, (_, i) => movePose(cfg.figure, (i + 0.5) / moveFrames)),
  ];
}

/** Small deterministic PRNG so every run draws the same picture. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * Equirectangular environment. 'night' (behind the orb): deep navy sky with a
 * band of horizontal speed streaks at the horizon. 'chrome' (for the metal
 * objects): a bright silver-blue sky over a dark ground with a sharp horizon,
 * the classic liquid-chrome reflection. 'figure' (for the people): a cloudy
 * sky over a soft grey-blue ground, so no part of a body mirrors black. Both get a white "sun" and soft light
 * panels for highlights.
 */
function environmentCanvas(kind) {
  const chrome = kind !== 'night';
  const W = 2048;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H);
  const stops = kind === 'figure'
    ? [[0, '#ffffff'], [0.2, '#c9d7f2'], [0.45, '#7d96d4'], [0.6, '#3550a4'], [0.65, '#111a44'], [0.78, '#4d5878'], [1, '#8a91a8']]
    : chrome
    ? [[0, '#f4f8ff'], [0.3, '#b9c9ea'], [0.47, '#7f97cf'], [0.5, '#0a1024'], [0.62, '#26324f'], [1, '#0b1020']]
    : [[0, '#000105'], [0.38, '#050d33'], [0.5, '#1c3bd0'], [0.56, '#071450'], [1, '#01020a']];
  for (const [at, color] of stops) sky.addColorStop(at, color);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  const rand = rng(2000);
  if (kind === 'figure') {
    // Soft cumulus over the sky, so the chrome has something to mirror.
    for (let i = 0; i < 60; i++) {
      const x = rand() * W;
      const y = H * (0.08 + rand() * 0.58);
      const r = 60 + rand() * 150;
      const pick = rand();
      const shade = pick < 0.42 ? '255,255,255' : pick < 0.68 ? '120,145,205' : '18,28,80';
      g.filter = `blur(${24 + rand() * 30}px)`;
      g.fillStyle = `rgba(${shade},${0.25 + rand() * 0.5})`;
      for (const dx of [0, -W, W]) {
        g.beginPath();
        g.ellipse(x + dx, y, r * (1.6 + rand()), r * 0.55, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.filter = 'none';
  }
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

/**
 * A chrome DJ: a full-body human figure (tools/y2k-art/bodies, built from
 * MakeHuman's CC0 base mesh by bodies.py, posed by pose.js) in mirror chrome,
 * wearing blue-chrome headphones with dark glossy cushions. The figure is
 * turned a little toward the page. Every frame is rendered at twice the size
 * and scaled down, into a grid of DJ_SHEET frames (one row per animation).
 *
 * The camera frames the still figure as the first 560 × 1300 pictures did;
 * the frame adds room above and at the sides (for raised hands) without
 * changing the projection, so the figure keeps its size and spot.
 *
 * `?preview=0.25` renders a small, quick preview (for working on the dance).
 */
async function figureScene(cfg, preview = 0) {
  const SS = preview ? 1 : 2;
  const scale = (cfg.scale ?? 1) * (preview || 1);
  const { frameWidth, frameHeight } = DJ_SHEET;
  const fw = Math.round(frameWidth * scale);
  const fh = Math.round(frameHeight * scale);
  const W = fw * SS;
  const H = fh * SS;
  const [bin, meta] = await Promise.all([
    fetch(new URL(`./bodies/${cfg.figure}.bin`, import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL(`./bodies/${cfg.figure}.json`, import.meta.url)).then((r) => r.json()),
  ]);
  const fig = readFigure(bin, meta);
  const still = posed(fig, stillPose(cfg.figure));
  const geo = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(still.positions), 3);
  geo.setAttribute('position', position);
  geo.setIndex(new THREE.BufferAttribute(fig.index, 1));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const envTex = new THREE.CanvasTexture(environmentCanvas('figure'));
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(envTex).texture;

  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xf4f6fb,
    metalness: 1,
    roughness: 0.06,
    iridescence: 0.3,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [200, 500],
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.2,
  });
  const blueChrome = chrome.clone();
  blueChrome.color = new THREE.Color(0xa4bbff);
  blueChrome.iridescence = 0.3;
  const cushion = new THREE.MeshPhysicalMaterial({ color: 0x06080f, metalness: 0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 });

  const figure = new THREE.Group();
  figure.add(new THREE.Mesh(geo, chrome));

  // Headphones in the head's own frame: x right, y up, z forward. The skull
  // is rigid, so its size is the same in every pose; only the frame moves.
  const { size } = still.head;
  const phones = new THREE.Group();
  const halfW = size[0] / 2;
  const cupR = size[1] * 0.2;
  const cupX = halfW + cupR * 0.3;
  const cupY = -size[1] * 0.2;
  const cupZ = -size[2] * 0.12;
  for (const side of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(cupR, cupR * 0.94, cupR * 0.6, 64), blueChrome);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(side * cupX, cupY, cupZ);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(cupR * 0.62, cupR * 0.07, 16, 64), blueChrome);
    cap.rotation.y = Math.PI / 2;
    cap.position.set(side * (cupX + cupR * 0.3), cupY, cupZ);
    const pad = new THREE.Mesh(new THREE.TorusGeometry(cupR * 0.72, cupR * 0.26, 24, 64), cushion);
    pad.rotation.y = Math.PI / 2;
    pad.scale.set(1, 1, 0.75);
    pad.position.set(side * (cupX - cupR * 0.36), cupY, cupZ);
    phones.add(cup, cap, pad);
  }
  // Band: a half ellipse from the top of one cup over the skull to the other.
  const baseY = cupY + cupR * 0.4;
  const topY = size[1] * 0.56;
  const arc = new THREE.CatmullRomCurve3(
    Array.from({ length: 41 }, (_, i) => {
      const a = Math.PI - (i / 40) * Math.PI;
      return new THREE.Vector3(Math.cos(a) * cupX, baseY + Math.sin(a) * (topY - baseY), cupZ);
    }),
  );
  const band = new THREE.Mesh(new THREE.TubeGeometry(arc, 160, size[1] * 0.035, 20), blueChrome);
  band.scale.z = 2.2; // a flat strap, wider front to back
  band.position.z = cupZ - cupZ * 2.2;
  phones.add(band);
  const holder = new THREE.Group();
  holder.matrixAutoUpdate = false;
  holder.add(phones);
  figure.add(holder);
  scene.add(figure);

  // The first pictures' camera (a 560 × 1300 view of the still figure), widened
  // to the frame: the same projection, with the extra room above and at the sides.
  const fov = 18;
  const camera = new THREE.PerspectiveCamera(fov, 560 / 1300, 1, 400);
  const h = still.height * 1.04;
  const dist = h / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  camera.position.set(0, h * 0.52, dist);
  camera.lookAt(0, h * 0.49, 0);
  camera.setViewOffset(560, 1300, -(frameWidth - 560) / 2, -(frameHeight - 1300), frameWidth, frameHeight);

  const rows = figureFrames(cfg);
  const cols = Math.max(...rows.map((r) => r.length));
  const out = document.createElement('canvas');
  out.width = fw * cols;
  out.height = fh * rows.length;
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  const frame = new THREE.Matrix4();
  rows.forEach((row, r) =>
    row.forEach(({ rotations, spin }, c) => {
      const p = posed(fig, rotations, still);
      position.array.set(p.positions);
      position.needsUpdate = true;
      geo.computeVertexNormals();
      const { center, axes } = p.head;
      frame.set(
        axes[0][0], axes[0][1], axes[0][2], center[0],
        axes[1][0], axes[1][1], axes[1][2], center[1],
        axes[2][0], axes[2][1], axes[2][2], center[2],
        0, 0, 0, 1,
      );
      holder.matrix.copy(frame);
      holder.matrixWorldNeedsUpdate = true;
      figure.rotation.y = cfg.turn + spin;
      renderer.render(scene, camera);
      g.drawImage(renderer.domElement, c * fw, r * fh, fw, fh);
    }),
  );
  document.body.appendChild(out);
  renderer.domElement.remove();
  // The dance sheets at a lower quality: no visible difference, about a fifth smaller.
  return out.toDataURL('image/webp', cfg.dance ? 0.7 : 0.9);
}

async function render() {
  const name = new URLSearchParams(location.search).get('scene') ?? 'orb-portrait';
  const cfg = SCENES[name];
  if (!cfg) throw new Error(`Unknown scene ${name}`);
  if (cfg.kind === 'figure') {
    const preview = Number(new URLSearchParams(location.search).get('preview') ?? 0);
    window.__art = { name, dataUrl: await figureScene(cfg, preview) };
    document.getElementById('status').textContent = `${name}: done`;
    return;
  }
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

render().catch((err) => {
  window.__art = { error: String(err) };
  document.getElementById('status').textContent = String(err);
});
