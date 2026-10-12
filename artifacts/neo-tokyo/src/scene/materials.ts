import * as THREE from 'three';

export const sharedUniforms = { uTime: { value: 0 } };

const HASH = `
float nt_h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
`;

/** Facade material: procedural world-space windows, neon edges, crowns and storefronts. */
export function createBuildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color('#14132a'), roughness: 0.42, metalness: 0.5, envMapIntensity: 0.45 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aBox; attribute vec3 aTint; attribute vec2 aMeta;
varying vec3 vWP; varying vec3 vWN; varying vec4 vBox; varying vec3 vTint; varying vec2 vMeta;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
mat4 ntM = modelMatrix;
#ifdef USE_INSTANCING
ntM = modelMatrix * instanceMatrix;
#endif
vWP = (ntM * vec4(transformed, 1.0)).xyz;
vWN = normalize(mat3(ntM) * objectNormal);
vBox = aBox; vTint = aTint; vMeta = aMeta;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
varying vec3 vWP; varying vec3 vWN; varying vec4 vBox; varying vec3 vTint; varying vec2 vMeta;
${HASH}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec3 n = normalize(vWN);
  float isSide = 1.0 - step(0.5, abs(n.y));
  float alongX = step(0.5, abs(n.x));
  float hc = mix(vWP.x, vWP.z, alongX);
  float center = mix(vBox.x, vBox.y, alongX);
  float halfW = mix(vBox.z, vBox.w, alongX);
  float u = hc - center + halfW;
  float style = fract(vMeta.x * 5.13);
  vec2 cs = mix(vec2(2.6, 3.4), vec2(1.6, 3.9), step(0.7, fract(vMeta.x * 17.3)));
  vec2 cell = vec2(u / cs.x, vWP.y / cs.y);
  vec2 id = floor(cell); vec2 f = fract(cell);
  float win = step(0.14, f.x) * step(f.x, 0.86) * step(0.2, f.y) * step(f.y, 0.8);
  float r = nt_h21(id + vec2(vMeta.x * 31.7, n.x * 7.0 + n.z * 13.0));
  float density = 0.45 + 0.25 * fract(vMeta.x * 3.7);
  float lit = step(density, r) * step(5.0, vWP.y);
  float flick = 0.9 + 0.1 * sin(uTime * (1.5 + r * 5.0) + r * 40.0);
  vec3 warm = mix(vec3(1.0, 0.6, 0.3), vec3(0.55, 0.78, 1.0), step(0.7, fract(r * 7.3)));
  vec3 wc = mix(warm, vTint, step(0.88, fract(r * 3.1)));
   vec3 em = win * lit * wc * (0.13 + 0.6 * fract(r * 11.0)) * flick;
  float edgeD = halfW - abs(hc - center);
   em += step(0.55, style) * smoothstep(0.45, 0.0, edgeD) * vTint * 1.15;
  float crown = smoothstep(0.7, 0.0, abs(vWP.y - (vMeta.y - 1.1)));
   em += crown * vTint * 1.3 * step(0.3, style);
   em += step(0.86, style) * step(0.93, fract(vWP.y / 6.8)) * vTint * 0.7;
  float store = step(0.4, vWP.y) * step(vWP.y, 4.0);
   em += store * (0.35 + 0.65 * step(0.45, fract(u / 5.5))) * mix(vec3(1.0, 0.82, 0.6), vTint, 0.45) * 0.38;
  totalEmissiveRadiance += em * isSide;
  diffuseColor.rgb *= mix(1.0, 0.55, win * isSide);
}`,
      );
  };
  m.customProgramCacheKey = () => 'nt-building-v1';
  return m;
}

/** Atlas-driven sign material: one draw call for all signs of a kind. */
export function createSignMaterial(tex: THREE.Texture, cols: number, rows: number, brightness = 1.8) {
  const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false });
  m.color.setScalar(brightness);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aCell; varying float vCell;`)
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
vCell = aCell;
#ifdef USE_MAP
float ntCell = floor(aCell);
vMapUv = (uv + vec2(mod(ntCell, ${cols}.0), floor(ntCell / ${cols}.0))) / vec2(${cols}.0, ${rows}.0);
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; varying float vCell;`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float ntSeed = fract(vCell) * 10.0;
float ntFl = step(0.82, fract(ntSeed * 0.731));
float ntOn = step(0.18, fract(sin(floor(uTime * 9.0) + ntSeed * 91.7) * 43758.5453));
diffuseColor.rgb *= mix(1.0, ntOn, ntFl) * (0.92 + 0.08 * sin(uTime * 3.0 + ntSeed * 6.0));`,
      );
  };
  m.customProgramCacheKey = () => `nt-sign-${cols}x${rows}-${brightness}`;
  return m;
}

const JP_FONT = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
const H_TEXT = ['カラオケ 歌広場', 'ラーメン 一燈', '居酒屋 夜桜', 'PACHINKO 銀河', 'HOTEL 新宿', '電脳 DENNOU', '寿司 二十四時', '麒麟 KIRIN', 'ネオン市場', 'ゲームセンター', '東京 NIGHT', '薬 PHARMACY', 'BAR 月光', 'CYBER 渋谷', '夜行 YAKO', '焼肉 炎'];
const V_TEXT = ['ラーメン', 'カラオケ', '居酒屋', 'ホテル', '薬局', '寿司', '電脳街', '麻雀', '焼鳥', '占い', '未来', '喫茶', '酒場', '漫画', '夜市', '銭湯'];
const SIGN_COLORS = ['#ff2d75', '#00e5ff', '#ffb21e', '#b46bff', '#ff4a2a', '#3dffb5', '#ff6ad5', '#fff2c4'];

function drawSignCell(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string, vertical: boolean, i: number) {
  const col = SIGN_COLORS[i % SIGN_COLORS.length];
  const style = i % 3;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = style === 1 ? col : '#0a0612';
  ctx.fillRect(0, 0, w, h);
  if (style !== 1) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.lineWidth = 6;
  ctx.strokeStyle = style === 1 ? '#fff6ea' : col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 18;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = style === 1 ? '#120818' : style === 2 ? '#fff6ea' : col;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (vertical) {
    const chars = Array.from(text);
    const size = Math.min(w * 0.72, (h - 40) / chars.length);
    ctx.font = `900 ${size}px ${JP_FONT}`;
    chars.forEach((c, k) => ctx.fillText(c, w / 2, 24 + size * (k + 0.5) + ((h - 48) - size * chars.length) / 2));
  } else {
    let size = h * 0.52;
    ctx.font = `900 ${size}px ${JP_FONT}`;
    const mw = ctx.measureText(text).width;
    if (mw > w - 50) size *= (w - 50) / mw;
    ctx.font = `900 ${size}px ${JP_FONT}`;
    ctx.fillText(text, w / 2, h / 2 + 2);
  }
  ctx.restore();
}

export function createSignAtlas(vertical: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const cols = vertical ? 8 : 2;
  const rows = vertical ? 2 : 8;
  const cw = 1024 / cols, ch = 1024 / rows;
  const draw = () => {
    ctx.clearRect(0, 0, 1024, 1024);
    for (let i = 0; i < 16; i++) {
      const c = i % cols, rr = Math.floor(i / cols);
      // canvas row 0 is top; texture v=0 is bottom -> flip row so cell index maps consistently
      drawSignCell(ctx, c * cw, (rows - 1 - rr) * ch, cw, ch, vertical ? V_TEXT[i] : H_TEXT[i], vertical, i + (vertical ? 3 : 0));
    }
  };
  draw();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, cols, rows, redraw: () => { draw(); tex.needsUpdate = true; } };
}

export function createWindowTexture(base: string, lit: string[], w = 256, h = 512, cx = 16, cy = 48, seed = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cwid = w / cx, chei = h / cy;
  for (let x = 0; x < cx; x++)
    for (let y = 0; y < cy; y++) {
      const v = rnd();
      if (v < 0.42) continue;
      ctx.globalAlpha = 0.35 + rnd() * 0.65;
      ctx.fillStyle = lit[Math.floor(rnd() * lit.length)];
      ctx.fillRect(x * cwid + 2, y * chei + 2, cwid - 4, chei - 4);
    }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createNoiseTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // blobby puddles: sum of a few soft circles over noise
  const field = new Float32Array(size * size);
  for (let k = 0; k < 40; k++) {
    const px = rnd() * size, py = rnd() * size, rad = 10 + rnd() * 40;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let dx = Math.abs(x - px); dx = Math.min(dx, size - dx);
        let dy = Math.abs(y - py); dy = Math.min(dy, size - dy);
        const d = Math.sqrt(dx * dx + dy * dy) / rad;
        if (d < 1) field[y * size + x] += (1 - d) * (1 - d);
      }
  }
  for (let i = 0; i < size * size; i++) {
    const puddle = Math.min(1, field[i] * 1.6);
    const v = Math.floor((0.85 - puddle * 0.75 + rnd() * 0.12) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v));
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const SCREEN_WORDS = ['東京', '夜雨', '未来', '渋谷', 'NEO', '電脳', '光'];
export function createScreenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (t: number) => {
    const hueA = (340 + Math.sin(t * 0.3) * 30 + 360) % 360;
    const hueB = (185 + Math.cos(t * 0.23) * 25) % 360;
    const g = ctx.createLinearGradient(0, 0, 512, 288);
    g.addColorStop(0, `hsl(${hueA} 95% 52%)`);
    g.addColorStop(0.55, `hsl(${(hueA + 300) % 360} 70% 18%)`);
    g.addColorStop(1, `hsl(${hueB} 95% 50%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 288);
    // concentric pulse rings
    ctx.strokeStyle = 'rgba(255,240,230,0.25)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      const rad = ((t * 80 + k * 70) % 350);
      ctx.beginPath();
      ctx.arc(390, 120, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    const idx = Math.floor(t / 3) % SCREEN_WORDS.length;
    const ph = (t % 3) / 3;
    const slide = ph < 0.15 ? (1 - ph / 0.15) * 300 : 0;
    ctx.fillStyle = '#fff6ee';
    ctx.font = `900 150px ${JP_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = ph > 0.92 ? (1 - ph) / 0.08 : 1;
    ctx.fillText(SCREEN_WORDS[idx], 30 - slide, 125);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(8,4,16,0.75)';
    ctx.fillRect(0, 232, 512, 56);
    ctx.fillStyle = '#ffd36b';
    ctx.font = `700 28px ${JP_FONT}`;
    const ticker = 'NEO TOKYO  /  AFTER DARK  /  雨の夜、渋谷  /  TOKYO TOWER 333M  /  SKYTREE 634M  /  ';
    const tw = ctx.measureText(ticker).width;
    const off = -((t * 90) % tw);
    ctx.fillText(ticker + ticker + ticker, off, 262);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < 288; y += 3) ctx.fillRect(0, y, 512, 1);
    tex.needsUpdate = true;
  };
  draw(0);
  return { tex, draw };
}
