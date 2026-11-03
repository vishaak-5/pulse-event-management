import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/*
 * The landing hero: a vortex of neon light strands with pulses flowing along
 * them, a soft core glow and drifting dust. Everything is additive-blended
 * custom shaders - no post-processing pass, so it stays cheap on laptops.
 */

const STRAND_COUNT = 34
const DUST_COUNT = 700

const strandVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const strandFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOffset;
  uniform float uSpeed;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float along = vUv.x;
    // Neon tube look: bright at the silhouette, dimmer facing the camera.
    float rim = pow(1.0 - abs(dot(vNormal, vView)), 1.6);
    // Pulses of light travelling along the strand.
    float p = fract(along * 1.6 - uTime * uSpeed + uOffset);
    float pulse = smoothstep(0.0, 0.08, p) * (1.0 - smoothstep(0.08, 0.42, p));
    // Fade the strand ends so nothing is cut off hard.
    float ends = smoothstep(0.0, 0.12, along) * (1.0 - smoothstep(0.82, 1.0, along));
    vec3 base = mix(uColorA, uColorB, smoothstep(0.1, 0.9, along));
    vec3 col = base * (0.22 + rim * 0.9) + uColorC * pulse * 1.6;
    float alpha = ends * (0.18 + rim * 0.55 + pulse * 0.9);
    gl_FragColor = vec4(col * alpha, alpha);
  }
`

const glowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float g = pow(max(0.0, 1.0 - d), 2.6) * (0.85 + 0.15 * sin(uTime * 0.8));
    gl_FragColor = vec4(uColor * g, g);
  }
`

const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const dustVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.25 + aSeed * 12.0) * 0.18;
    p.x += cos(uTime * 0.18 + aSeed * 9.0) * 0.14;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (2.0 + aSeed * 3.0) * uPixelRatio * (6.0 / -mv.z);
    vAlpha = 0.25 + 0.6 * fract(aSeed * 7.13);
  }
`

const dustFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(uColor * a, a);
  }
`

const MINT = new THREE.Color('#5ef2b0')
const TEAL = new THREE.Color('#1fb6a6')
const LIME = new THREE.Color('#d6ff72')

function strandCurve(i: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = []
  const k = i / STRAND_COUNT
  const twist = 0.35 + k * 0.5
  for (let s = 0; s <= 48; s++) {
    const t = s / 48
    const angle = t * Math.PI * 2.4 + k * 1.3
    const radius = 1.25 + Math.sin(t * Math.PI) * (1.35 + k * 0.5) + Math.sin(t * 9 + i) * 0.04
    pts.push(new THREE.Vector3(
      Math.cos(angle) * radius + (t - 0.5) * 2.2,
      Math.sin(angle) * radius * 0.55 + Math.sin(t * Math.PI * 2 + k * 4) * twist,
      Math.sin(angle) * radius * 0.6 - (t - 0.5) * 1.5,
    ))
  }
  return new THREE.CatmullRomCurve3(pts)
}

function Strands({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null)
  const materials = useRef<THREE.ShaderMaterial[]>([])

  const strands = useMemo(() => Array.from({ length: STRAND_COUNT }, (_, i) => {
    const geometry = new THREE.TubeGeometry(strandCurve(i), 220, 0.006 + (i % 5) * 0.004, 8, false)
    const material = new THREE.ShaderMaterial({
      vertexShader: strandVertex,
      fragmentShader: strandFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOffset: { value: (i * 0.137) % 1 },
        uSpeed: { value: 0.08 + (i % 7) * 0.012 },
        uColorA: { value: TEAL },
        uColorB: { value: MINT },
        uColorC: { value: i % 6 === 0 ? LIME : MINT },
      },
    })
    return { geometry, material }
  }), [])

  materials.current = strands.map((s) => s.material)

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    for (const m of materials.current) m.uniforms.uTime.value = reduced ? 2 : t
    const g = group.current
    if (!g) return
    if (!reduced) g.rotation.z += delta * 0.03
    // Ease toward the pointer for a light parallax.
    g.rotation.x += ((state.pointer.y * 0.18) - g.rotation.x) * 0.04
    g.rotation.y += ((state.pointer.x * 0.28) - g.rotation.y) * 0.04
  })

  return (
    <group ref={group} rotation={[0.2, -0.3, -0.35]} position={[1.1, 0, 0]}>
      {strands.map((s, i) => <mesh key={i} geometry={s.geometry} material={s.material} />)}
    </group>
  )
}

function CoreGlow() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: glowVertex,
    fragmentShader: glowFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color('#1c8f6c') }, uTime: { value: 0 } },
  }), [])
  useFrame((s) => { material.uniforms.uTime.value = s.clock.elapsedTime })
  return (
    <mesh position={[1.2, 0, -1.5]} material={material}>
      <planeGeometry args={[9, 7]} />
    </mesh>
  )
}

function Dust() {
  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(DUST_COUNT * 3)
    const seeds = new Float32Array(DUST_COUNT)
    for (let i = 0; i < DUST_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16
      positions[i * 3 + 1] = (Math.random() - 0.5) * 9
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1
      seeds[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const m = new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uColor: { value: MINT },
      },
    })
    return { geometry: g, material: m }
  }, [])
  useFrame((s) => { material.uniforms.uTime.value = s.clock.elapsedTime })
  return <points geometry={geometry} material={material} />
}

export default function HeroScene() {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 7], fov: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      frameloop={reduced ? 'demand' : 'always'}
      aria-hidden
    >
      <CoreGlow />
      <Strands reduced={reduced} />
      <Dust />
    </Canvas>
  )
}
