// Original procedural atmosphere; motion and palette are adapted to Voyager's art direction.
export function createSpace(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;
  const vertex = `#version 300 es
    in vec2 p;
    void main(){gl_Position=vec4(p,0.,1.);}`;
  const fragment = `#version 300 es
    precision mediump float;
    uniform vec2 resolution;
    uniform float time;
    out vec4 color;
    float grain(vec2 p){return fract(sin(dot(p,vec2(51.17,93.41)))*12731.31);}
    float noise(vec2 p){vec2 a=floor(p),b=fract(p);b=b*b*(3.-2.*b);
      return mix(mix(grain(a),grain(a+vec2(1.,0.)),b.x),mix(grain(a+vec2(0.,1.)),grain(a+1.),b.x),b.y);}
    float cloud(vec2 p){float n=0.,w=.5;for(int i=0;i<5;i++){n+=noise(p)*w;p=mat2(.87,-.48,.48,.87)*p*2.04;w*=.5;}return n;}
    void main(){
      vec2 uv=gl_FragCoord.xy/resolution, p=(gl_FragCoord.xy-.5*resolution)/resolution.y;
      float t=time*.018;
      vec2 bend=vec2(cloud(p*1.7+vec2(t,0.)),cloud(p*1.7+vec2(8.,t)));
      float n=cloud(p*2.4+bend*2.1-vec2(t*.2,t*.5));
      float light=smoothstep(.25,.85,n)*smoothstep(.1,1.,uv.x);
      vec3 ink=mix(vec3(.020,.027,.051),vec3(.075,.16,.29),light);
      float dust=pow(max(0.,1.-length(fract(p*70.)-.5)*7.),7.);
      dust*=step(.986,grain(floor(p*70.)));
      ink+=dust*vec3(.5,.64,.85);
      color=vec4(ink,1.);
    }`;
  const shaders = [];
  const program = gl.createProgram();
  if (!program) return null;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ]) {
    const shader = gl.createShader(type);
    if (!shader) {
      gl.deleteProgram(program);
      return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      shaders.forEach((s) => gl.deleteShader(s));
      gl.deleteProgram(program);
      return null;
    }
    shaders.push(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    shaders.forEach((s) => gl.deleteShader(s));
    gl.deleteProgram(program);
    return null;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const resolution = gl.getUniformLocation(program, "resolution"),
    clock = gl.getUniformLocation(program, "time");
  let frame = 0,
    running = false,
    dead = false,
    elapsed = 0,
    last = 0;
  function draw() {
    if (dead || gl.isContextLost()) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(clock, elapsed / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 1.25);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    draw();
  }
  function loop(now) {
    if (!running || dead) return;
    if (now - last >= 32) {
      elapsed += last ? Math.min(now - last, 100) : 0;
      last = now;
      draw();
    }
    frame = requestAnimationFrame(loop);
  }
  function setRunning(value) {
    if (dead || running === value) return;
    running = value;
    last = 0;
    cancelAnimationFrame(frame);
    if (running) frame = requestAnimationFrame(loop);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const lost = (event) => {
    event.preventDefault();
    setRunning(false);
    canvas.hidden = true;
  };
  canvas.addEventListener("webglcontextlost", lost);
  resize();
  return {
    setRunning,
    dispose() {
      setRunning(false);
      dead = true;
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      gl.deleteBuffer(buffer);
      shaders.forEach((s) => gl.deleteShader(s));
      gl.deleteProgram(program);
    },
  };
}
