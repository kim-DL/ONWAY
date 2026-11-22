import { Camera, Mesh, NoBlending, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer } from "three";

// The clear face transmits the page through the canvas. Only the curved lip
// reflects the two studio lights. All light intensities are achromatic.
const fragmentShader = `
  varying vec2 vUv;
  uniform vec2 size;
  uniform vec2 lightOffset;

  void main() {
    vec2 p = (vUv - 0.5) * size;
    float radius = size.y * 0.5;
    float straight = max(0.0, size.x * 0.5 - radius);
    vec2 radial = p - vec2(clamp(p.x, -straight, straight), 0.0);
    float inset = radius - length(radial);
    float coverage = smoothstep(0.0, fwidth(inset), inset);
    float bevel = clamp(1.0 - inset / 5.5, 0.0, 1.0);
    vec2 slope = radial / max(0.001, length(radial)) * bevel;
    vec3 normal = vec3(slope, sqrt(max(0.0, 1.0 - dot(slope, slope))));
    vec3 reflected = reflect(vec3(0.0, 0.0, -1.0), normal);
    vec3 light = normalize(vec3(vec2(-0.48, 0.76) + lightOffset, 0.58));
    float strip = pow(max(dot(reflected, light), 0.0), 5.0);
    float counter = pow(max(dot(reflected, vec3(-light.xy, light.z)), 0.0), 12.0);
    float fresnel = pow(1.0 - normal.z, 1.15);
    float shade = bevel * (0.10 + 0.17 * max(0.0, -dot(slope, light.xy)));
    float glint = clamp(strip * 0.92 + counter * 0.60 + fresnel * 0.54, 0.0, 1.0);
    float opacity = glint + shade * (1.0 - glint);
    gl_FragColor = vec4(vec3(glint / max(opacity, 0.001)), coverage * bevel * opacity);
  }
`;

export function mountGlass(host: HTMLElement) {
  const button = host.parentElement!;
  const canvas = document.createElement("canvas");
  const options = { alpha: true, premultipliedAlpha: false, depth: false, powerPreference: "low-power" } as const;
  const context = canvas.getContext("webgl2", options);
  if (!(context instanceof WebGL2RenderingContext)) return;
  const renderer = new WebGLRenderer({ canvas, context, ...options });
  renderer.setClearColor(0, 0);
  canvas.style.cssText = "display:block;width:100%;height:100%";
  const uniforms = { size: { value: new Vector2() }, lightOffset: { value: new Vector2() } };
  const material = new ShaderMaterial({
    uniforms, fragmentShader,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
    blending: NoBlending, depthTest: false, depthWrite: false,
  });
  const geometry = new PlaneGeometry(2, 2);
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const camera = new Camera();
  const motion = matchMedia("(prefers-reduced-motion: no-preference)");
  let frame = 0;
  function draw() {
    frame = 0;
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height || document.hidden || renderer.getContext().isContextLost()) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (width !== uniforms.size.value.x || height !== uniforms.size.value.y || ratio !== renderer.getPixelRatio()) {
      uniforms.size.value.set(width, height);
      renderer.setDrawingBufferSize(width, height, ratio);
    }
    renderer.render(scene, camera);
  }
  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function point(event: PointerEvent) {
    if (!motion.matches) return;
    const bounds = button.getBoundingClientRect();
    uniforms.lightOffset.value.set(
      ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.8,
      (0.5 - (event.clientY - bounds.top) / bounds.height) * 0.65,
    );
    schedule();
  }
  function reset() { uniforms.lightOffset.value.set(0, 0); schedule(); }

  host.append(canvas);
  draw();
  const sizeObserver = new ResizeObserver(schedule);
  sizeObserver.observe(host);
  button.addEventListener("pointermove", point);
  button.addEventListener("pointerdown", point);
  button.addEventListener("pointerleave", reset);
  motion.addEventListener("change", reset);
  document.addEventListener("visibilitychange", reset);
  canvas.addEventListener("webglcontextrestored", schedule);
  return () => {
    cancelAnimationFrame(frame);
    sizeObserver.disconnect();
    button.removeEventListener("pointermove", point);
    button.removeEventListener("pointerdown", point);
    button.removeEventListener("pointerleave", reset);
    motion.removeEventListener("change", reset);
    document.removeEventListener("visibilitychange", reset);
    canvas.removeEventListener("webglcontextrestored", schedule);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };
}
