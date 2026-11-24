import { useEffect, useRef } from 'react';

// The public-domain Natural Earth land mask and shaded Earth imagery are baked
// into one equirectangular atlas. Project that atlas onto a lit orthographic disc.
const fragment = `
precision highp float;
uniform sampler2D atlas;
uniform float angle;
uniform float pixels;
varying vec2 position;
void main() {
  vec2 p = position * 1.006;
  float r = length(p);
  if (r >= 1.0) discard;
  float z = sqrt(max(0.0, 1.0-dot(p,p)));
  float tilt = 0.23;
  float lat = asin(clamp(p.y*cos(tilt)+z*sin(tilt),-1.0,1.0));
  float lon = atan(p.x,z*cos(tilt)-p.y*sin(tilt))+angle;
  vec3 land = texture2D(atlas,vec2(fract(0.5+lon/6.2831853),0.5-lat/3.14159265)).rgb;
  float light = .36+.72*clamp(dot(vec3(p,z),vec3(-.55,.50,.68)),0.0,1.0);
  // A few polished stones catch light as their longitude passes the viewer.
  vec2 cell = floor(vec2(lon / 6.2831853 + .5, .5-lat/3.14159265)*vec2(192.,96.));
  float facet = fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
  float glaze = pow(max(dot(vec3(p,z),normalize(vec3(-.38,.42,.82))),0.),17.)
              * smoothstep(.87,.99,facet)*.35;
  vec3 rim = vec3(.20,.37,.25)*pow(1.0-z,4.0);
  gl_FragColor=vec4(land*light+rim+vec3(.89,.98,.66)*glaze,clamp((1.0-r)*pixels*.5,0.0,1.0));
}`;

export function AtlasGlobe({ moving, turn }: { moving: boolean; turn: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const offset = useRef(0);
  const params = useRef({ moving, turn });
  const redraw = useRef<() => void>(() => {});
  useEffect(() => { params.current = { moving, turn }; redraw.current(); }, [moving, turn]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = el.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) {
      // Keep the instrument operable when WebGL is disabled.
      let step = 0;
      let visible = true;
      const paint = () => {
        const index = ((step + Math.round((params.current.turn + offset.current) * 24 / Math.PI)) % 48 + 48) % 48;
        el.style.backgroundPosition = (index % 8) * 100 / 7 + '% ' + Math.floor(index / 8) * 20 + '%';
      };
      const frames = new Image();
      frames.onload = () => {
        el.style.backgroundImage = "url('/atlas/globe-frames.webp')";
        el.style.backgroundSize = '800% 600%';
        paint();
      };
      frames.src = '/atlas/globe-frames.webp';
      redraw.current = paint;
      const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
      observer.observe(el);
      const timer = window.setInterval(() => {
        if (params.current.moving && visible && !document.hidden) { step++; paint(); }
      }, 1200);
      return () => {
        frames.onload = null; redraw.current = () => {}; observer.disconnect(); clearInterval(timer);
      };
    }
    const program = gl.createProgram();
    if (!program) return;
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, 'attribute vec2 point; varying vec2 position; void main(){position=point;gl_Position=vec4(point,0.,1.);}'],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(kind);
      if (!shader) return;
      gl.shaderSource(shader, source); gl.compileShader(shader);
      gl.attachShader(program, shader); gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return; }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const point = gl.getAttribLocation(program, 'point');
    gl.enableVertexAttribArray(point); gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);
    const angle = gl.getUniformLocation(program, 'angle');
    const pixels = gl.getUniformLocation(program, 'pixels');
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
    for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.LINEAR);
    const img = new Image();
    let easedTurn = 0;
    let rotation = .35, previous = 0, frame = 0, visible = true, ready = false;
    function draw(time: number) {
      frame = 0;
      if (!ready || !visible || document.hidden) { previous = 0; return; }
      if (params.current.moving && previous) rotation += Math.min(time-previous, 80)*.000095;
      const elapsed = previous ? Math.min(time - previous, 80) : 16;
      const target = params.current.turn + offset.current;
      easedTurn = params.current.moving ? easedTurn + (target - easedTurn) * (1 - Math.exp(-elapsed / 82)) : target;
      previous = time;
      gl!.uniform1f(angle, rotation + easedTurn);
      gl!.uniform1f(pixels, el!.width);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      if (params.current.moving) frame = requestAnimationFrame(draw);
    }
    const refresh = () => { cancelAnimationFrame(frame); previous = 0; frame = requestAnimationFrame(draw); };
    redraw.current = refresh;
    const resize = new ResizeObserver(() => {
      const size = Math.max(1, Math.min(960, Math.round(el.clientWidth * (window.devicePixelRatio || 1))));
      el.width = el.height = size; gl.viewport(0,0,size,size); refresh();
    });
    resize.observe(el);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; refresh(); });
    observer.observe(el);
    document.addEventListener('visibilitychange',refresh);
    img.onload = () => {
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);
      // Prefilter small tesserae so the coastline stays steady near the limb.
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      ready = true; refresh();
    };
    img.src = '/atlas/earth.webp';
    return () => {
      img.onload = null; redraw.current = () => {}; cancelAnimationFrame(frame);
      observer.disconnect(); resize.disconnect(); document.removeEventListener('visibilitychange',refresh);
      gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program);
    };
  }, []);
  return <canvas ref={canvas} className="atlas-globe" role="img"
    aria-label="Rotating Earth in jade and limestone mosaic. Use the globe controls to turn it."
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, start: offset.current };
    }}
    onPointerMove={event => {
      if (!drag.current || !event.isPrimary) return;
      offset.current = drag.current.start - (event.clientX - drag.current.x) * Math.PI / event.currentTarget.clientWidth;
      redraw.current();
    }}
    onLostPointerCapture={() => { drag.current = null; }}
  />;
}
