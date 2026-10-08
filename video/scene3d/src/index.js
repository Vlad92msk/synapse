// WebGL-сцена блока 12: Scene3D.mount(container, { width, height, slides }) → { seek(t), dispose() }.
// slides: [{ id, start, trans, end, steps: { <build-шаг>: t } }] — тайминги слайдов real-one / real-module / real-app.
// seek(t) рисует кадр строго по времени t (без requestAnimationFrame), назад тоже можно.
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildStory, framing, FOV, TUBE } from './story.js'
import { clamp, smooth, kickFn, flashFn, hash, easeIO } from './motion.js'

const BG = '#232321'
const REST_ALPHA = 0.5, HEAT_TAIL = 0.3 // связь в покое: прозрачность пунктира; длина остывающего следа (доля линии)
const DOF = 0.0032, DOF_MAX = 0.0028 // размытие (доля ширины кадра) на глубине 2·D и его предел
const C1 = new THREE.Color('#FB923C'), C2 = new THREE.Color('#EA580C')

// тор-«C»: разрез по центру смотрит вдоль +X, концы скруглены (как stroke-linecap: round в логотипе)
function ringGeometry(gapDeg) {
  const gap = (gapDeg * Math.PI) / 180, arc = 2 * Math.PI - gap
  const torus = new THREE.TorusGeometry(1, TUBE, 48, 220, arc)
  torus.rotateZ(gap / 2)
  const paint = (g, colorAt) => {
    const p = g.attributes.position, c = new Float32Array(p.count * 3), tmp = new THREE.Color()
    for (let i = 0; i < p.count; i++) { colorAt(p.getX(i), p.getY(i), tmp); c.set([tmp.r, tmp.g, tmp.b], i * 3) }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  }
  // градиент вдоль дуги: светлый конец → тёмный конец
  const along = (x, y, out) => { let a = Math.atan2(y, x); if (a < 0) a += 2 * Math.PI; out.copy(C1).lerp(C2, clamp((a - gap / 2) / arc)) }
  paint(torus, along)
  const cap = (ang, col) => { const s = new THREE.SphereGeometry(TUBE, 32, 20); s.translate(Math.cos(ang), Math.sin(ang), 0); paint(s, (x, y, o) => o.copy(col)); return s }
  return mergeGeometries([torus, cap(gap / 2, C1), cap(-gap / 2, C2)])
}
function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  for (const [o, col] of stops) gr.addColorStop(o, col)
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}
// материал связи: в покое — полупрозрачный пунктир; там, где прошёл импульс, линия «накаляется» — становится
// сплошной и яркой, за головой импульса тянется остывающий след. uPulse[i] = (положение головы 0..1 вдоль
// трубки, направление ±1, сила); uLit — подсветка всей линии шагом сценария
const MAX_HEAT = 4
function linkMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uColor: { value: color }, uOpacity: { value: 1 }, uLit: { value: 0 }, uDash: { value: new THREE.Vector2(1, 0) },
      uPulse: { value: Array.from({ length: MAX_HEAT }, () => new THREE.Vector3(0, 1, 0)) },
    }]),
    vertexShader: `varying float vS;
      #include <fog_pars_vertex>
      void main(){ vS = uv.y; vec4 mvPosition = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity, uLit; uniform vec2 uDash; uniform vec3 uPulse[${MAX_HEAT}]; varying float vS;
      #include <fog_pars_fragment>
      void main(){
        float heat = 0.;
        for (int i = 0; i < ${MAX_HEAT}; i++) {
          float d = (uPulse[i].x - vS) * uPulse[i].y; // > 0 — импульс здесь уже прошёл
          heat = max(heat, uPulse[i].z * (d >= 0. ? exp(-d / ${HEAT_TAIL.toFixed(2)}) : smoothstep(.04, 0., -d)));
        }
        float ph = fract(vS * uDash.x + uDash.y), aa = fwidth(vS * uDash.x) * 1.2;
        float dash = smoothstep(0., aa, ph) * (1. - smoothstep(.58, .58 + aa, ph));
        float solid = clamp(max(heat, smoothstep(.3, 1., uLit)), 0., 1.);
        float a = mix(dash * ${REST_ALPHA.toFixed(2)}, 1., solid);
        gl_FragColor = vec4(uColor * (.85 + 2.4 * uLit + 4. * heat), a * uOpacity);
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  })
}

THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping( vec3 color ) {
    color *= toneMappingExposure;
    const float a = 0.6;
    vec3 over = max(color - a, 0.0);
    return min(color, vec3(a)) + (1.0 - a) * (1.0 - exp(-over / (1.0 - a)));
  }`)

// подписи узлов сцены — рендер убирает такие же подписи из 2D-вёрстки слайдов
export const LABELS = [...new Set(buildStory([]).nodes.flatMap((n) => n.labels.map((l) => l.text)))]

export function mount(container, { width = 1920, height = 1080, slides = [] } = {}) {
  const story = buildStory(slides)
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(width, height)
  // свой тон-маппинг: до 0.6 — без изменений (фон остаётся ровно #232321, цвета колец — как в логотипе),
  // выше — мягкое плечо, чтобы блики и вспышки не выгорали в белое
  renderer.toneMapping = THREE.CustomToneMapping
  renderer.toneMappingExposure = 1
  renderer.domElement.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%'
  container.appendChild(renderer.domElement)
  const labelsEl = document.createElement('div')
  labelsEl.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:hidden'
  container.appendChild(labelsEl)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(BG)
  scene.fog = new THREE.Fog(BG, 1000, 5000)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.5
  const camera = new THREE.PerspectiveCamera(FOV, width / height, 10, 100000)
  // свет: тёплый ключевой сверху-слева, контровой оранжевый сзади, мягкое заполнение
  const key = new THREE.DirectionalLight(0xfff0e0, 2.6); key.position.set(-1.1, 1.4, 1.5)
  const rim = new THREE.DirectionalLight(0xff8a3d, 2.2); rim.position.set(1.3, -0.5, -1.3)
  const fill = new THREE.HemisphereLight(0xffe6d0, 0x1a1410, 0.5)
  scene.add(key, rim, fill)

  // ─ постобработка: MSAA-цель в HDR → bloom → тон-маппинг и sRGB ─
  const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, rt)
  composer.addPass(new RenderPass(scene, camera))
  // глубина резкости: в фокусе — плоскость главного кольца, дальние кольца и линии слегка размыты
  const dof = new BokehPass(scene, camera, { focus: 1, aperture: 0, maxblur: DOF_MAX })
  composer.addPass(dof)
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.55, 0.82)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  // фон слайдов: тёплое свечение из правого верхнего угла (как radial-gradient в вёрстке) + лёгкий дизеринг,
  // чтобы плавные градиенты не расслаивались на полосы после сжатия видео
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(width, height) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec2 px = vec2(vUv.x, 1. - vUv.y) * uRes;
        float R = 0.55 * length(vec2(0.85 * uRes.x, uRes.y));
        float a = 0.141 * clamp(1. - length(px - vec2(0.85 * uRes.x, 0.)) / R, 0., 1.);
        c.rgb = mix(c.rgb, vec3(0.976, 0.451, 0.086), a);
        c.rgb += (h(gl_FragCoord.xy) + h(gl_FragCoord.xy + 17.3) - 1.) / 255.;
        gl_FragColor = c;
      }`,
  }))

  // ─ объекты ─
  const geoCache = {}
  const ringGeo = (g) => (geoCache[g] ??= ringGeometry(g))
  const sphereGeo = new THREE.SphereGeometry(1, 40, 24)
  const haloTex = radialTexture([[0, 'rgba(255,170,90,0.9)'], [0.25, 'rgba(249,115,22,0.35)'], [1, 'rgba(249,115,22,0)']])
  const ringMat = () => new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.3, metalness: 0.08, clearcoat: 0.7, clearcoatRoughness: 0.18,
    emissive: new THREE.Color('#EA580C'), emissiveIntensity: 0.05, transparent: true,
  })
  for (const n of story.nodes) {
    n.mat = n.kind === 'dot' ? new THREE.MeshPhysicalMaterial({ color: '#F97316', roughness: 0.32, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: new THREE.Color('#EA580C'), emissiveIntensity: 0.12, transparent: true }) : ringMat()
    if (n.kind === 'ring') { n.ring = new THREE.Mesh(ringGeo(n.gap ?? 74), n.mat); scene.add(n.ring) }
    if (n.kind === 'dot' || n.dot) {
      n.dotMat = n.kind === 'dot' ? n.mat : new THREE.MeshPhysicalMaterial({ color: '#F97316', roughness: 0.32, clearcoat: 0.6, emissive: new THREE.Color('#EA580C'), emissiveIntensity: 0.12, transparent: true })
      n.dotMesh = new THREE.Mesh(sphereGeo, n.dotMat); scene.add(n.dotMesh)
    }
    if (n.kind === 'ring') {
      n.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true }))
      scene.add(n.halo)
    }
    for (const l of n.labels) {
      const el = document.createElement('div')
      el.textContent = l.text
      el.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;font-family:${l.font === 'inter' ? 'Inter, sans-serif' : "'JetBrains Mono', monospace"};font-weight:700;font-size:${l.size}px;color:${l.color};opacity:0;will-change:transform;transform-origin:${l.place === 'right' ? '0 50%' : '50% 0'};text-shadow:0 2px 12px rgba(20,20,18,0.85)`
      labelsEl.appendChild(el)
      l.el = el
    }
  }
  // связи — светящиеся трубки (единичный цилиндр, растягивается между концами)
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true)
  const LINE = new THREE.Color('#F97316')
  for (const l of story.links) {
    l.mat = linkMaterial(LINE)
    l.pulses = story.pulses.filter((p) => p.l === l)
    l.mesh = new THREE.Mesh(cyl.clone(), l.mat) // своя геометрия: концы трубки разной толщины
    scene.add(l.mesh)
  }
  // импульсы: голова + хвост из угасающих шариков
  const TRAIL = 7
  const pulsePool = []
  const pulseMesh = () => {
    const g = []
    for (let j = 0; j < TRAIL; j++) {
      const m = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.32), transparent: true, depthWrite: false, fog: true, blending: THREE.AdditiveBlending }))
      scene.add(m); g.push(m)
    }
    pulsePool.push(g); return g
  }
  // звёздная пыль на разной глубине (параллакс при движении камеры) + редкие крупные размытые пылинки
  // у самой камеры (боке) — дают ощущение глубины при отъездах
  const dustLayer = (count, seed, place, sizeAt, maxPx, alpha, soft) => {
    const pos = new Float32Array(count * 3), sz = new Float32Array(count), ph = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const r = (k) => hash(i * 7.13 + k + seed)
      pos.set(place(r), i * 3); sz[i] = sizeAt(r); ph[i] = r(5) * 6.283
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1))
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1))
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: 540 / Math.tan((FOV / 2) * Math.PI / 180) }, uNear: { value: 400 } },
      vertexShader: `attribute float aSize; attribute float aPh; uniform float uTime, uPx, uNear; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); float d = -mv.z; gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uPx / max(d, 1.), 0.8, ${maxPx.toFixed(1)});
          vA = (0.55 + 0.45 * sin(uTime * 0.7 + aPh)) * smoothstep(uNear, uNear * 3., d) * (1. - smoothstep(14000., 26000., d)); }`,
      fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - .5); float a = smoothstep(.5, ${soft.toFixed(2)}, r) * vA;
        gl_FragColor = vec4(vec3(1., .8, .62) * ${alpha.toFixed(2)}, a * ${alpha.toFixed(2)}); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    scene.add(new THREE.Points(g, mat))
    return mat
  }
  const dustMats = [
    dustLayer(2600, 0, (r) => [(r(1) - 0.5) * 22000 - 1500, (r(2) - 0.5) * 13000 + 1500, -14000 + r(3) * 19000], (r) => 6 + 34 * Math.pow(r(4), 3), 4.5, 0.8, 0.1),
    dustLayer(70, 99, (r) => [(r(1) - 0.5) * 9000 - 800, (r(2) - 0.5) * 5000 + 1000, -500 + r(3) * 7500], (r) => 60 + 140 * r(4), 46, 0.13, 0.0),
  ]

  // ─ кадр ─
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2])
  const tmpM = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0)
  const vX = new THREE.Vector3(), vY = new THREE.Vector3(), vZ = new THREE.Vector3(), vT = new THREE.Vector3()
  const cR = new THREE.Vector3(), cU = new THREE.Vector3(), cB = new THREE.Vector3()
  const MAX_TILT = 0.19 // предел наклона кольца от плоскости кадра, рад (≈11°)
  // точка мира → экран (px от центра кадра, y вверх)
  const scr = (p, out) => { vT.copy(p).project(camera); out[0] = vT.x * width / 2; out[1] = vT.y * height / 2; return out }
  // направление от узла к точке — в плоскости кадра: так, как эта точка видна от узла на экране
  const aimTo = [0, 0]
  const aim = (n, target) => { scr(target, aimTo); return new THREE.Vector3().addScaledVector(cR, aimTo[0] - n.sc[0]).addScaledVector(cU, aimTo[1] - n.sc[1]).normalize() }
  // поворот направления a → b вокруг оси взгляда (разрез поворачивается «по циферблату»)
  const turn = (a, b, k, vd) => {
    const pa = a.clone().addScaledVector(vd, -a.dot(vd)), pb = b.clone().addScaledVector(vd, -b.dot(vd))
    if (pa.lengthSq() < 1e-6 || pb.lengthSq() < 1e-6) return a.clone().lerp(b, k).normalize()
    pa.normalize(); pb.normalize()
    let ang = Math.atan2(vd.dot(new THREE.Vector3().crossVectors(pa, pb)), pa.dot(pb))
    if (Math.abs(ang) > Math.PI - 0.05) ang = Math.PI - 0.05
    const out = pa.applyAxisAngle(vd, ang * k)
    out.addScaledVector(vd, a.dot(vd) + (b.dot(vd) - a.dot(vd)) * k)
    return out.normalize()
  }
  // толщина связи у конца: чем дальше конец от камеры, тем тоньше — сильнее, чем даёт одна перспектива
  // (на экране ширина ∝ глубина^-(1 + TAPER)), иначе на тонкой линии глубины не видно
  const TAPER = 1.5
  const thick = (p, D) => clamp(Math.pow(D / Math.max(1, vT.copy(camera.position).sub(p).dot(cB)), TAPER), 0.3, 1.8)
  const cylBase = cyl.attributes.position.array
  const sum = (arr, t, f) => arr.reduce((s, x) => s + x.amp * f(t - x.t), 0)

  function seek(t) {
    // камера: дробный масштаб + медленный облёт (непрерывен по времени, поэтому переходы между слайдами гладкие)
    const { sig, yaw, pitch, shift, center = 0, zoom = 1 } = story.camera(t)
    const fr = { ...framing(sig) }
    fr.D *= zoom // zoom < 1 — камера ближе
    const T = V(fr.T)
    if (shift) { T.x += shift[0] * fr.S; T.y -= shift[1] * fr.S } // сдвиг кадра в px: сцена уезжает влево-вверх
    // center → 1: камера смотрит на начало координат (кольцо messenger), кольцо — на 100 px ниже середины кадра,
    // чтобы соседи сверху не заходили под шапку слайда
    if (center) { T.multiplyScalar(1 - center); T.y += 100 * fr.S * zoom * center }
    camera.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(fr.D).add(T)
    camera.up.copy(up)
    camera.lookAt(T)
    camera.near = fr.D * 0.04; camera.far = fr.D * 12
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    scene.fog.near = fr.D; scene.fog.far = fr.D * 2.6 // воздушная дымка: дальнее тусклее
    dof.uniforms.focus.value = fr.D; dof.uniforms.aperture.value = DOF / fr.D
    for (const m of dustMats) { m.uniforms.uTime.value = t; m.uniforms.uNear.value = fr.D * 0.12 }
    // оси экрана в мире: все кольца лежат в плоскости, параллельной кадру (вправо, вверх, на зрителя) —
    // такая плоскость проецируется без искажений, кольцо остаётся кругом и у края кадра
    cR.setFromMatrixColumn(camera.matrixWorld, 0); cU.setFromMatrixColumn(camera.matrixWorld, 1); cB.setFromMatrixColumn(camera.matrixWorld, 2)

    // узлы: положение, размер, видимость
    for (const n of story.nodes) {
      n.P = V(n.pos(t))
      const kick = sum(n.kicks, t, kickFn), flash = sum(n.flashes, t, flashFn)
      n.kick = Math.max(-1.2, Math.min(1.2, kick)); n.flash = Math.min(1.1, flash)
      const breath = n.breath != null && t > n.breath ? 0.035 * Math.sin((t - n.breath) * 2 - n.P.length() * 0.0009) * smooth(t - n.breath, 0, 1.5) : 0
      n.v = n.alive(t) ? clamp(n.vis(t)) * (n.dim ? n.dim(t) : 1) : 0
      n.s = n.R(t) * n.pop(t) * (1 + 0.07 * kick + breath)
      n.d = n.dot ? clamp(n.dot(t)) : 0
      n.sc = scr(n.P, [0, 0])
    }
    // направление разреза: родитель — к среднему направлению на детей, ребёнок — к разрезу родителя.
    // Два прохода: сначала по центрам, потом дети целятся точно в точку разреза родителя.
    const gapPoint = (n) => n.P.clone().addScaledVector(n.g, n.s)
    for (let pass = 0; pass < 2; pass++) {
      for (const n of story.nodes) {
        if (n.kind !== 'ring') continue
        const dc = new THREE.Vector3(), dp = new THREE.Vector3()
        let wc = 0, wp = 0
        for (const l of story.links) {
          const w = clamp(l.w(t)) * clamp(l.op(t))
          if (w <= 0.001) continue
          if (l.a === n) { dc.addScaledVector(aim(n, l.b.P), w); wc = Math.max(wc, w) }
          if (l.b === n) { dp.addScaledVector(aim(n, pass && l.a.g ? gapPoint(l.a) : l.a.P), w); wp = Math.max(wp, w) }
        }
        if (dc.lengthSq() < 1e-8) wc = 0
        if (dp.lengthSq() < 1e-8) wp = 0
        let g
        if (wc > 0 && wp > 0) g = turn(dc.normalize(), dp.normalize(), 1 - wc, cB)
        else if (wc > 0) g = dc.normalize()
        else if (wp > 0) g = dp.normalize()
        else { // связей нет — прежнее направление, уложенное в плоскость кадра (камера могла улететь)
          g = (n.g0 ?? cR).clone(); g.addScaledVector(cB, -g.dot(cB))
          if (g.lengthSq() < 1e-6) g.copy(cR)
          g.normalize()
        }
        if (pass) n.g = g; else n.g1 = g
      }
      for (const n of story.nodes) if (n.kind === 'ring' && !pass) { n.g = n.g1; n.g0 ??= n.g1.clone() }
    }
    for (const n of story.nodes) if (n.kind === 'ring') n.g0 = n.g.clone()

    for (const n of story.nodes) {
      const ring = n.ring
      if (ring) {
        const show = n.v > 0.002 && n.s * (1 - n.d) > 0.5
        ring.visible = show
        n.halo.visible = show
        if (show) {
          // кольцо — лицом к зрителю (плоскость кадра), разрез повёрнут в этой плоскости. Объём — наклон в
          // несколько градусов вокруг оси разреза: разрез он не сдвигает, а кольцо не сплющивает (cos 11° ≈ 0.98)
          vX.copy(n.g)
          const th = clamp(n.tilt + 0.045 * Math.sin(t * 0.5 + n.ph) + 0.1 * n.kick, -MAX_TILT, MAX_TILT) * (1 - (n.flat ? n.flat(t) : 0))
          vZ.copy(cB).applyAxisAngle(vX, th)
          vY.crossVectors(vZ, vX)
          tmpM.makeBasis(vX, vY, vZ)
          ring.quaternion.setFromRotationMatrix(tmpM)
          ring.position.copy(n.P)
          ring.scale.setScalar(n.s * (1 - n.d * 0.999))
          n.mat.opacity = n.v * (1 - n.d)
          n.mat.emissiveIntensity = 0.05 + 0.75 * n.flash + 0.1 * (n.glow ? n.glow(t) : 0)
          n.halo.position.copy(n.P)
          n.halo.scale.setScalar(n.s * 4.2)
          n.halo.material.opacity = n.v * (1 - n.d) * (0.08 + 0.12 * (n.glow ? n.glow(t) : 0) + 0.35 * n.flash)
        }
      }
      if (n.dotMesh) {
        const r = n.kind === 'dot' ? n.s : n.dotR * n.d
        const show = n.v > 0.002 && r > 0.3
        n.dotMesh.visible = show
        if (show) {
          n.dotMesh.position.copy(n.P)
          n.dotMesh.scale.setScalar(r)
          n.dotMat.opacity = n.v * (n.kind === 'dot' ? 1 : smooth(n.d, 0, 0.4))
          n.dotMat.emissiveIntensity = 0.12 + 1.2 * n.flash
        }
      }
    }
    // связи: от точки разреза до точки разреза
    const end = (n) => (n.kind === 'ring' && n.g ? gapPoint(n) : n.P)
    for (const l of story.links) {
      const w = clamp(l.w(t)), op = clamp(l.op(t)) * Math.min(l.a.v, l.b.v)
      if (w < 0.002 || op < 0.002) { l.mesh.visible = false; continue }
      const A = end(l.a), B = end(l.b)
      const [p0, p1] = l.grow === 'a' ? [A, B] : [B, A]
      const q1 = p0.clone().lerp(p1, w)
      const dir = q1.clone().sub(p0), len = dir.length()
      if (len < 0.5) { l.mesh.visible = false; continue }
      l.A = A; l.B = B
      l.mesh.visible = true
      l.mesh.position.copy(p0).addScaledVector(dir, 0.5)
      l.mesh.quaternion.setFromUnitVectors(up, dir.normalize())
      // конус: радиус у каждого конца — по его глубине (нижнее основание цилиндра — p0, верхнее — q1)
      const r = l.rpx * l.S
      l.rA = r * thick(A, fr.D); l.rB = r * thick(B, fr.D)
      const [r0, r1] = l.grow === 'a' ? [l.rA, l.rB] : [l.rB, l.rA]
      const rq = r0 + (r1 - r0) * w
      const pa = l.mesh.geometry.attributes.position
      for (let i = 0; i < pa.count; i++) { const k = cylBase[i * 3 + 1] > 0 ? rq : r0; pa.array[i * 3] = cylBase[i * 3] * k; pa.array[i * 3 + 2] = cylBase[i * 3 + 2] * k }
      pa.needsUpdate = true
      l.mesh.scale.set(1, len, 1)
      const lit = clamp(l.lit(t))
      const U = l.mat.uniforms
      U.uLit.value = lit; U.uOpacity.value = op
      U.uDash.value.set(len / (r * 11), -t * (l.dashed ? 0.9 : 0.3)) // шаг пунктира — по базовой толщине (на дальнем конце не мельчает); медленно течёт от p0
      // накал: голова каждого импульса на этой связи (в координате трубки) и остывание после прилёта
      let k = 0
      for (const p of l.pulses) {
        const x = (t - p.t0) / p.dur
        if (x < -0.05 || k >= MAX_HEAT) continue
        const cool = x > 1 ? Math.exp(-(x - 1) * p.dur / 0.45) : smooth(x, -0.05, 0.05)
        if (cool < 0.01) continue
        const q = easeIO(clamp(x)), fwd = (l.grow === 'a') === !p.fromB
        U.uPulse.value[k++].set(fwd ? q : 1 - q, fwd ? 1 : -1, Math.min(1, p.amp * 1.2) * cool)
      }
      for (; k < MAX_HEAT; k++) U.uPulse.value[k].z = 0
    }
    // импульсы
    let used = 0
    for (const p of story.pulses) {
      const x = (t - p.t0) / p.dur
      if (x < -0.05 || x > 1.15 || !p.l.mesh.visible) continue
      const g = pulsePool[used] ?? pulseMesh(); used++
      const [A, B] = p.fromB ? [p.l.B, p.l.A] : [p.l.A, p.l.B]
      const [ra, rb] = p.fromB ? [p.l.rB, p.l.rA] : [p.l.rA, p.l.rB]
      g.forEach((m, j) => {
        const q = easeIO(clamp(x - j * 0.035))
        const r = ra + (rb - ra) * q // импульс худеет и толстеет вместе с линией
        const fade = Math.sin(Math.PI * clamp(x * 1.05)) * (1 - j / TRAIL)
        m.visible = fade > 0.01
        m.position.copy(A).lerp(B, q)
        m.scale.setScalar(r * (j === 0 ? 4.6 : 3.2 - j * 0.38))
        m.material.opacity = clamp(fade)
        m.material.color.setRGB(1, 0.62, 0.32).multiplyScalar(p.amp * (j === 0 ? 7 : 3.5))
      })
    }
    for (let i = used; i < pulsePool.length; i++) pulsePool[i].forEach((m) => (m.visible = false))

    composer.render()

    // подписи: HTML поверх canvas, позиция — проекция центра узла
    const v = new THREE.Vector3(), right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    for (const n of story.nodes) {
      for (const l of n.labels) {
        const a = clamp(l.vis(t)) * n.v * l.alpha
        if (a < 0.01) { l.el.style.opacity = 0; continue }
        v.copy(n.P).project(camera)
        const sx = (v.x * 0.5 + 0.5) * width, sy = (-v.y * 0.5 + 0.5) * height
        const e = n.P.clone().addScaledVector(right, n.s * (1 + TUBE)).project(camera)
        const rp = Math.abs((e.x * 0.5 + 0.5) * width - sx)
        // подпись живёт на глубине узла: дальняя — мельче и тусклее
        const f = fr.D / Math.max(1, vT.copy(camera.position).sub(n.P).dot(cB))
        const ls = clamp(f, 0.76, 1.12).toFixed(3)
        l.el.style.opacity = (a * clamp(Math.pow(f, 1.6), 0.58, 1)).toFixed(3)
        l.el.style.transform = l.place === 'right'
          ? `translate(${(sx + rp + 18 + (l.dx ? l.dx(t) : 0)).toFixed(1)}px, ${sy.toFixed(1)}px) translateY(-50%) scale(${ls})`
          : `translate(${(sx + (l.ox ?? 0)).toFixed(1)}px, ${(sy + rp + 8).toFixed(1)}px) translateX(-50%) scale(${ls})`
      }
    }
  }
  function dispose() {
    renderer.dispose(); composer.dispose?.(); rt.dispose()
    container.removeChild(renderer.domElement); container.removeChild(labelsEl)
  }
  return { seek, dispose, canvas: renderer.domElement }
}
