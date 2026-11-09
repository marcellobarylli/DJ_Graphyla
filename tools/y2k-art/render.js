/**
 * Y2K Futurism art, rendered in the browser with three.js:
 *  - orb-portrait / orb-landscape: a liquid glass orb with water-like caustics
 *    over horizontal light streaks (late-90s CGI wallpaper style), dark;
 *  - torus / blob: chrome objects on a transparent background, for the edges;
 *  - head: a chrome human bust wearing DJ headphones, on a transparent
 *    background (a raymarched signed-distance sculpture, see headScene).
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
  head: { width: 640, height: 760, kind: 'head' },
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
 * the classic liquid-chrome reflection. 'bust' (for the head): the same with
 * the horizon lowered, so a face looking ahead mirrors sky, not ground. Both get a white "sun" and soft light
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
  const stops = kind === 'bust'
    ? [[0, '#ffffff'], [0.2, '#c9d7f2'], [0.45, '#7d96d4'], [0.68, '#3550a4'], [0.72, '#0d1430'], [0.84, '#3d3448'], [1, '#1d1922']]
    : chrome
    ? [[0, '#f4f8ff'], [0.3, '#b9c9ea'], [0.47, '#7f97cf'], [0.5, '#0a1024'], [0.62, '#26324f'], [1, '#0b1020']]
    : [[0, '#000105'], [0.38, '#050d33'], [0.5, '#1c3bd0'], [0.56, '#071450'], [1, '#01020a']];
  for (const [at, color] of stops) sky.addColorStop(at, color);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  const rand = rng(2000);
  if (kind === 'bust') {
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
 * The chrome bust: a head with DJ headphones, modelled as a signed distance
 * field and raymarched in a fragment shader. The head is mirror chrome that
 * reflects the 'chrome' environment, with warm copper in the creases (like
 * late-90s CGI renders); the headphones are blue-anodised chrome with dark
 * glossy cushions. Rendered at twice the size and scaled down for clean edges.
 */
function headScene(cfg) {
  const SS = 2;
  const W = cfg.width * SS;
  const H = cfg.height * SS;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.setClearColor(0x000000, 0);

  const envTex = new THREE.CanvasTexture(environmentCanvas('bust'));
  envTex.colorSpace = THREE.SRGBColorSpace;
  envTex.wrapS = THREE.RepeatWrapping;

  // Turn the face toward the viewer's right (the page, when it sits on the
  // left), tilt it slightly down like a statue.
  // ?yaw=<radians> overrides the turn, to check the profile while sculpting.
  const yaw = Number(new URLSearchParams(location.search).get('yaw') ?? 0.5);
  const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.02, yaw, -0.04, 'YXZ'));
  const toLocal = new THREE.Matrix3().setFromMatrix4(rot).transpose();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      envMap: { value: envTex },
      resolution: { value: new THREE.Vector2(W, H) },
      toLocal: { value: toLocal },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D envMap;
      uniform vec2 resolution;
      uniform mat3 toLocal;
      varying vec2 vUv;

      float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0-h); }
      float smax(float a, float b, float k){ return -smin(-a, -b, k); }
      float sdEllipsoid(vec3 p, vec3 r){ float k0 = length(p/r); float k1 = length(p/(r*r)); return k0*(k0-1.0)/k1; }
      float sdCapsule(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p-a, ba = b-a; float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0); return length(pa - ba*h) - r; }
      float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2){
        vec3 ba = b - a; float l2 = dot(ba,ba); float rr = r1 - r2; float a2 = l2 - rr*rr; float il2 = 1.0/l2;
        vec3 pa = p - a; float y = dot(pa,ba); float z = y - l2; vec3 xv = pa*l2 - ba*y; float x2 = dot(xv,xv);
        float y2 = y*y*l2; float z2 = z*z*l2; float k = sign(rr)*rr*rr*x2;
        if (sign(z)*a2*z2 > k) return sqrt(x2 + z2)*il2 - r2;
        if (sign(y)*a2*y2 < k) return sqrt(x2 + y2)*il2 - r1;
        return (sqrt(x2*a2*il2) + y*rr)*il2 - r1;
      }
      // Rounded cylinder along x: radius ra, half length h, edge rounding rb.
      float sdCylX(vec3 p, float ra, float h, float rb){
        vec2 d = vec2(length(p.yz) - ra + rb, abs(p.x) - h + rb);
        return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - rb;
      }
      float sdTorusX(vec3 p, float R, float r){ return length(vec2(length(p.yz) - R, p.x)) - r; }
      float sdBox2(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

      float sdHead(vec3 p){
        vec3 q = vec3(abs(p.x), p.y, p.z);
        // Skull and face masses.
        float d = sdEllipsoid(p - vec3(0.0, 0.3, -0.12), vec3(0.72, 0.84, 0.9));
        d = smin(d, sdEllipsoid(p - vec3(0.0, -0.25, 0.0), vec3(0.6, 0.8, 0.74)), 0.25);
        // Jaw line to the chin.
        d = smin(d, sdCapsule(q, vec3(0.52, -0.3, -0.1), vec3(0.17, -0.82, 0.44), 0.12), 0.22);
        d = smin(d, sdEllipsoid(p - vec3(0.0, -0.86, 0.5), vec3(0.2, 0.14, 0.13)), 0.14);
        // Cheekbones, cheeks and brow.
        d = smin(d, sdEllipsoid(q - vec3(0.42, -0.04, 0.5), vec3(0.17, 0.12, 0.16)), 0.18);
        d = smin(d, sdEllipsoid(q - vec3(0.34, -0.32, 0.42), vec3(0.2, 0.22, 0.2)), 0.2);
        d = smin(d, sdCapsule(q, vec3(0.0, 0.3, 0.74), vec3(0.4, 0.3, 0.58), 0.09), 0.14);
        // Eye sockets, then closed eyes (lids) inside them.
        d = smax(d, -sdEllipsoid(q - vec3(0.29, 0.12, 0.8), vec3(0.17, 0.12, 0.18)), 0.07);
        d = smin(d, sdEllipsoid(q - vec3(0.29, 0.1, 0.62), vec3(0.14, 0.095, 0.11)), 0.035);
        // Lid crease.
        d = smax(d, -sdEllipsoid(q - vec3(0.29, 0.085, 0.73), vec3(0.12, 0.006, 0.03)), 0.012);
        // Nose: bridge to tip, wings.
        d = smin(d, sdRoundCone(p, vec3(0.0, 0.2, 0.74), vec3(0.0, -0.19, 0.94), 0.05, 0.07), 0.1);
        d = smin(d, sdEllipsoid(q - vec3(0.085, -0.22, 0.83), vec3(0.06, 0.05, 0.06)), 0.07);
        d = smax(d, -sdEllipsoid(q - vec3(0.055, -0.275, 0.88), vec3(0.028, 0.012, 0.03)), 0.015);
        // Lips and the line between them.
        d = smin(d, sdEllipsoid(p - vec3(0.0, -0.46, 0.685), vec3(0.14, 0.048, 0.07)), 0.09);
        d = smin(d, sdEllipsoid(p - vec3(0.0, -0.56, 0.65), vec3(0.115, 0.05, 0.07)), 0.1);
        d = smax(d, -sdEllipsoid(p - vec3(0.0, -0.508, 0.74), vec3(0.125, 0.004, 0.04)), 0.008);
        // Philtrum and the hollow under the lower lip.
        d = smax(d, -sdEllipsoid(p - vec3(0.0, -0.37, 0.77), vec3(0.022, 0.05, 0.02)), 0.02);
        d = smax(d, -sdEllipsoid(p - vec3(0.0, -0.67, 0.67), vec3(0.1, 0.03, 0.03)), 0.08);
        // Neck and shoulders.
        d = smin(d, sdCapsule(p, vec3(0.0, -0.55, -0.18), vec3(0.0, -1.7, -0.12), 0.43), 0.22);
        d = smin(d, sdEllipsoid(p - vec3(0.0, -1.95, -0.18), vec3(1.6, 0.42, 0.62)), 0.45);
        return d;
      }

      const vec3 CUP = vec3(0.93, -0.02, -0.08);
      const vec3 BAND = vec3(0.0, 0.32, -0.08);
      // Headphones: x = shells and band, y = cushions.
      vec2 sdPhones(vec3 p){
        vec3 q = vec3(abs(p.x), p.y, p.z);
        vec3 c = q - CUP;
        float shell = sdCylX(c, 0.37, 0.12, 0.06);
        shell = smax(shell, -sdTorusX(c - vec3(0.13, 0.0, 0.0), 0.25, 0.022), 0.01);
        shell = smin(shell, sdCylX(c - vec3(0.11, 0.0, 0.0), 0.15, 0.04, 0.03), 0.02);
        float cushion = sdTorusX((c + vec3(0.15, 0.0, 0.0)) * vec3(1.6, 1.0, 1.0), 0.25, 0.1) / 1.6;
        // Band: an arc over the head that drops straight into the cups.
        vec3 b = q - BAND;
        float radial = b.y > 0.0 ? length(b.xy) - 0.94 : b.x - 0.94;
        float band = sdBox2(vec2(radial, b.z), vec2(0.035, 0.1)) - 0.025;
        band = max(band, -(p.y - CUP.y));
        // Sliders where the band meets the cups.
        float slider = sdBox2(vec2(b.x - 0.94, b.z), vec2(0.05, 0.12)) - 0.02;
        slider = max(slider, abs(q.y - 0.42) - 0.09);
        band = smin(band, slider, 0.03);
        return vec2(min(shell, band), cushion);
      }

      // Returns distance, material (0 head, 1 chrome-blue, 2 cushion).
      vec2 map(vec3 p){
        float h = sdHead(p);
        vec2 ph = sdPhones(p);
        vec2 r = vec2(h, 0.0);
        if (ph.x < r.x) r = vec2(ph.x, 1.0);
        if (ph.y < r.x) r = vec2(ph.y, 2.0);
        return r;
      }

      vec3 calcNormal(vec3 p){
        const vec2 e = vec2(1.0, -1.0) * 0.0015;
        return normalize(e.xyy*map(p + e.xyy).x + e.yyx*map(p + e.yyx).x + e.yxy*map(p + e.yxy).x + e.xxx*map(p + e.xxx).x);
      }
      float calcAO(vec3 p, vec3 n){
        float occ = 0.0, sca = 1.0;
        for (int i = 0; i < 6; i++){
          float h = 0.02 + 0.06*float(i);
          occ += (h - map(p + h*n).x) * sca;
          sca *= 0.8;
        }
        return clamp(1.0 - 2.2*occ, 0.0, 1.0);
      }
      vec3 env(vec3 d, float lod){
        vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
        return textureLod(envMap, uv, lod).rgb;
      }
      vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03)) / (x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }

      void main(){
        vec2 ndc = vUv * 2.0 - 1.0;
        float aspect = resolution.x / resolution.y;
        vec3 ro = vec3(0.0, -0.05, 9.0);
        float f = 1.0 / tan(radians(11.0));
        vec3 rd = normalize(vec3(ndc.x * aspect, ndc.y, -f));
        // Into the head's own frame.
        ro = toLocal * (ro - vec3(0.0, 0.2, 0.0));
        rd = toLocal * rd;

        float t = 6.0; vec2 hit = vec2(-1.0);
        for (int i = 0; i < 220; i++){
          vec2 h = map(ro + rd*t);
          if (h.x < 0.0004*t){ hit = vec2(t, h.y); break; }
          t += h.x * 0.9;
          if (t > 13.0) break;
        }
        if (hit.x < 0.0){ gl_FragColor = vec4(0.0); return; }

        vec3 p = ro + rd*hit.x;
        vec3 n = calcNormal(p);
        vec3 r = reflect(rd, n);
        float ao = calcAO(p, n);
        float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 5.0);
        vec3 col;
        if (hit.y < 0.5){
          // Silver chrome with copper in the creases.
          vec3 tint = mix(vec3(0.95, 0.62, 0.38), vec3(0.93, 0.95, 1.0), smoothstep(0.35, 0.85, ao));
          col = env(r, 1.2) * mix(tint, vec3(1.0), fres) * (0.25 + 0.75*ao);
        } else if (hit.y < 1.5){
          vec3 tint = vec3(0.45, 0.62, 1.0);
          col = env(r, 0.4) * mix(tint, vec3(1.0), fres) * (0.3 + 0.7*ao);
        } else {
          // Dark glossy leather.
          col = vec3(0.012, 0.015, 0.025) + env(r, 3.0) * mix(0.06, 1.0, fres) * 0.5 * ao;
        }
        col *= 1.15;
        col = aces(col);
        col = pow(col, vec3(1.0/2.2));
        // Fade the bust out toward the bottom edge of the picture.
        float alpha = smoothstep(0.0, 0.3, vUv.y);
        gl_FragColor = vec4(col * alpha, alpha);
      }`,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    premultipliedAlpha: true,
  });

  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  renderer.render(scene, new THREE.Camera());

  // Scale the supersampled frame down to the output size.
  const out = document.createElement('canvas');
  out.width = cfg.width;
  out.height = cfg.height;
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(renderer.domElement, 0, 0, cfg.width, cfg.height);
  document.body.appendChild(out);
  renderer.domElement.remove();
  return out.toDataURL('image/webp', 0.9);
}

function render() {
  const name = new URLSearchParams(location.search).get('scene') ?? 'orb-portrait';
  const cfg = SCENES[name];
  if (!cfg) throw new Error(`Unknown scene ${name}`);
  if (cfg.kind === 'head') {
    window.__art = { name, dataUrl: headScene(cfg) };
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

try {
  render();
} catch (err) {
  window.__art = { error: String(err) };
  document.getElementById('status').textContent = String(err);
}
