import * as THREE from 'three';

/**
 * 3D Gaussian Splat & Spatial Hologram Renderer
 * Handles interactive 3D rendering with Gaussian alpha falloff,
 * depth displacement, camera orbit, and mobile tilt support.
 */
export class SplatViewer {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth || 800;
    this.height = container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 100);
    this.camera.position.set(0, 0, 2.2);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.container.appendChild(this.renderer.domElement);

    this.textureLoader = new THREE.TextureLoader();
    this.currentMesh = null;
    this.currentMode = 'splat'; // 'splat' | 'points' | 'photo'
    this.depthScale = 1.35;
    this.splatSize = 1.25;

    // Interaction tracking
    this.targetRotation = { x: 0, y: 0 };
    this.currentRotation = { x: 0, y: 0 };
    this.targetDistance = 2.2;
    this.currentDistance = 2.2;
    this.isDragging = false;
    this.prevMousePos = { x: 0, y: 0 };

    this.initControls();
    this.initResizeListener();
    this.animate = this.animate.bind(this);
    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  initControls() {
    const el = this.renderer.domElement;

    const onPointerDown = (e) => {
      this.isDragging = true;
      this.prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e) => {
      if (!this.isDragging) {
        // Subtle mouse parallax hover effect when not dragging
        const rect = el.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        this.targetRotation.y = nx * 0.25;
        this.targetRotation.x = -ny * 0.18;
        return;
      }
      const dx = e.clientX - this.prevMousePos.x;
      const dy = e.clientY - this.prevMousePos.y;
      this.targetRotation.y += dx * 0.006;
      this.targetRotation.x += dy * 0.006;
      // Clamp pitch to avoid flipping
      this.targetRotation.x = Math.max(-0.6, Math.min(0.6, this.targetRotation.x));
      this.targetRotation.y = Math.max(-1.0, Math.min(1.0, this.targetRotation.y));
      this.prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = () => {
      this.isDragging = false;
    };

    const onWheel = (e) => {
      e.preventDefault();
      this.targetDistance += e.deltaY * 0.0015;
      this.targetDistance = Math.max(1.2, Math.min(3.5, this.targetDistance));
    };

    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    // Gyroscope tilt support for mobile
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') {
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma !== null && e.beta !== null) {
          const gx = Math.max(-30, Math.min(30, e.gamma)) / 30; // Left-Right
          const gy = Math.max(-30, Math.min(30, e.beta - 45)) / 30; // Front-Back
          this.targetRotation.y = gx * 0.35;
          this.targetRotation.x = gy * 0.25;
        }
      });
    }
  }

  initResizeListener() {
    window.addEventListener('resize', () => {
      this.width = this.container.clientWidth;
      this.height = this.container.clientHeight;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
      if (this.currentMesh && this.currentMesh.material.uniforms) {
        this.currentMesh.material.uniforms.uResolution.value.set(this.width, this.height);
      }
    });
  }

  async loadMemory(memory) {
    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      if (this.currentMesh.geometry) this.currentMesh.geometry.dispose();
      if (this.currentMesh.material) this.currentMesh.material.dispose();
      this.currentMesh = null;
    }

    this.targetRotation = { x: 0, y: 0 };
    this.targetDistance = memory.cameraZ || 2.2;
    this.depthScale = memory.defaultDepth || 1.4;

    const [colorTex, depthTex] = await Promise.all([
      this.loadTexture(memory.photo),
      this.loadTexture(memory.depth)
    ]);

    colorTex.generateMipmaps = true;
    colorTex.minFilter = THREE.LinearMipmapLinearFilter;
    depthTex.generateMipmaps = true;
    depthTex.minFilter = THREE.LinearMipmapLinearFilter;

    // Grid resolution for points: 280 x 360 ~ 100k splat points
    const cols = 280;
    const rows = 360;
    const count = cols * rows;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);

    let idx = 0;
    let uvIdx = 0;

    const aspect = memory.aspect || (9 / 16);
    const planeW = 1.0;
    const planeH = planeW / aspect;

    for (let y = 0; y < rows; y++) {
      const v = y / (rows - 1);
      const py = (v - 0.5) * planeH;
      for (let x = 0; x < cols; x++) {
        const u = x / (cols - 1);
        const px = (u - 0.5) * planeW;

        positions[idx * 3 + 0] = px;
        positions[idx * 3 + 1] = py;
        positions[idx * 3 + 2] = 0;

        uvs[uvIdx * 2 + 0] = u;
        uvs[uvIdx * 2 + 1] = v;

        idx++;
        uvIdx++;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uColorMap: { value: colorTex },
        uDepthMap: { value: depthTex },
        uDepthScale: { value: this.depthScale },
        uSplatSize: { value: this.splatSize },
        uResolution: { value: new THREE.Vector2(this.width, this.height) },
        uMode: { value: this.getModeUniformValue(this.currentMode) },
        uTime: { value: 0 }
      },
      vertexShader: `
        uniform sampler2D uDepthMap;
        uniform float uDepthScale;
        uniform float uSplatSize;
        uniform vec2 uResolution;
        uniform float uMode; // 0 = splat, 1 = points, 2 = photo
        uniform float uTime;

        varying vec2 vUv;
        varying float vDepth;

        void main() {
          vUv = uv;
          
          // Read normalized depth
          float depthVal = texture2D(uDepthMap, uv).r;
          vDepth = depthVal;

          vec3 pos = position;
          
          // If in photo mode (uMode == 2), flatten depth
          float actualDepth = mix(depthVal * uDepthScale, 0.0, step(1.5, uMode));
          
          // Perspective projection outwards based on depth
          pos.z += actualDepth * 0.45;
          pos.x *= (1.0 + actualDepth * 0.15);
          pos.y *= (1.0 + actualDepth * 0.15);

          // Subtle harmonic ambient motion
          pos.z += sin(uTime * 1.5 + pos.x * 3.0) * 0.004;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          // Point attenuation
          float baseSize = mix(uSplatSize * 9.0, uSplatSize * 4.0, step(0.5, uMode));
          gl_PointSize = baseSize * (uResolution.y / 800.0) * (1.8 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform sampler2D uColorMap;
        uniform float uMode; // 0 = splat, 1 = points, 2 = photo
        varying vec2 vUv;
        varying float vDepth;

        void main() {
          // Point coordinates in [-1, 1]
          vec2 coord = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(coord, coord);
          
          if (r2 > 1.0) discard;

          vec4 color = texture2D(uColorMap, vUv);

          // Gaussian splat alpha kernel
          if (uMode < 0.5) {
            // Gaussian falloff
            float alpha = exp(-2.2 * r2);
            gl_FragColor = vec4(color.rgb, color.a * alpha);
          } else if (uMode < 1.5) {
            // Crisp digital point cloud
            float alpha = smoothstep(1.0, 0.7, r2);
            // Slight cyber sheen
            vec3 tinted = mix(color.rgb, color.rgb + vec3(0.05, 0.08, 0.12), 0.2);
            gl_FragColor = vec4(tinted, alpha * 0.95);
          } else {
            // Flat/disc photo mode
            gl_FragColor = color;
          }
        }
      `
    });

    this.currentMesh = new THREE.Points(geometry, material);
    this.scene.add(this.currentMesh);
  }

  loadTexture(url) {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (tex) => resolve(tex),
        undefined,
        (err) => reject(err)
      );
    });
  }

  getModeUniformValue(mode) {
    switch (mode) {
      case 'points': return 1.0;
      case 'photo': return 2.0;
      case 'splat':
      default: return 0.0;
    }
  }

  setMode(mode) {
    this.currentMode = mode;
    if (this.currentMesh && this.currentMesh.material.uniforms) {
      this.currentMesh.material.uniforms.uMode.value = this.getModeUniformValue(mode);
    }
  }

  setDepthScale(scale) {
    this.depthScale = scale;
    if (this.currentMesh && this.currentMesh.material.uniforms) {
      this.currentMesh.material.uniforms.uDepthScale.value = scale;
    }
  }

  setSplatSize(size) {
    this.splatSize = size;
    if (this.currentMesh && this.currentMesh.material.uniforms) {
      this.currentMesh.material.uniforms.uSplatSize.value = size;
    }
  }

  resetCamera() {
    this.targetRotation = { x: 0, y: 0 };
    this.targetDistance = 2.2;
  }

  animate(time) {
    this.animationFrameId = requestAnimationFrame(this.animate);

    // Smooth camera damping
    this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.08;
    this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.08;
    this.currentDistance += (this.targetDistance - this.currentDistance) * 0.08;

    this.camera.position.x = Math.sin(this.currentRotation.y) * this.currentDistance;
    this.camera.position.z = Math.cos(this.currentRotation.y) * this.currentDistance;
    this.camera.position.y = Math.sin(this.currentRotation.x) * this.currentDistance;
    this.camera.lookAt(0, 0, 0);

    if (this.currentMesh && this.currentMesh.material.uniforms) {
      this.currentMesh.material.uniforms.uTime.value = time * 0.001;
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    cancelAnimationFrame(this.animationFrameId);
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}

