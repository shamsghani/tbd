import * as THREE from 'three';

/**
 * 3D Gaussian Splat & Spatial Card Viewer
 * - Renders photos as thousands of soft, dense Gaussian splats
 * - Default 3D depth set to lowest subtle value (prevents spiky tearing)
 * - Splat size set to largest value (luscious, soft, overlapping Gaussian clouds)
 * - The Polaroid frame physically tilts in 3D perspective with the image
 */
export class HologramViewer {
  constructor(container, frameElement) {
    this.container = container;
    this.frameElement = frameElement; // The outer Polaroid card element
    this.width = container.clientWidth || 300;
    this.height = container.clientHeight || 375;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 50);
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

    // Default configuration requested:
    // Lowest 3D depth (subtle, clean, no spiky distortion)
    this.depthScale = 0.24;
    // Biggest splat size (lush, overlapping, soft Gaussian disks)
    this.splatSize = 2.85;

    // Tilt tracking
    this.mouse = new THREE.Vector2(0, 0);
    this.targetMouse = new THREE.Vector2(0, 0);

    this.initInteraction();
    this.initResize();

    this.animate = this.animate.bind(this);
    this.animationId = requestAnimationFrame(this.animate);
  }

  initInteraction() {
    // Gyroscope tracking for mobile phone
    const handleOrientation = (e) => {
      if (e.gamma !== null && e.beta !== null) {
        // Roll: left/right (-25 to 25 deg)
        const roll = Math.max(-25, Math.min(25, e.gamma)) / 25;
        // Pitch: front/back (-25 to 25 deg from nominal 45 deg viewing angle)
        const pitch = Math.max(-25, Math.min(25, e.beta - 45)) / 25;
        this.targetMouse.x = roll;
        this.targetMouse.y = -pitch;
      }
    };

    if (window.DeviceOrientationEvent) {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        window.addEventListener('click', () => {
          DeviceOrientationEvent.requestPermission()
            .then(res => {
              if (res === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
              }
            })
            .catch(() => {});
        }, { once: true });
      } else {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    }

    // Touch and mouse fallback
    const onMove = (clientX, clientY) => {
      const rect = this.container.getBoundingClientRect();
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
      this.targetMouse.x = Math.max(-1, Math.min(1, nx));
      this.targetMouse.y = Math.max(-1, Math.min(1, ny));
    };

    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });
  }

  initResize() {
    window.addEventListener('resize', () => {
      this.width = this.container.clientWidth || 300;
      this.height = this.container.clientHeight || 375;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
      if (this.currentMesh && this.currentMesh.material.uniforms) {
        this.currentMesh.material.uniforms.uResolution.value.set(this.width, this.height);
      }
    });
  }

  async loadMemory(photoUrl, depthUrl) {
    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      if (this.currentMesh.geometry) this.currentMesh.geometry.dispose();
      if (this.currentMesh.material) this.currentMesh.material.dispose();
      this.currentMesh = null;
    }

    // Update dimensions on modal open
    this.width = this.container.clientWidth || 300;
    this.height = this.container.clientHeight || 375;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);

    const [colorTex, depthTex] = await Promise.all([
      this.loadTexture(photoUrl),
      this.loadTexture(depthUrl)
    ]);

    colorTex.generateMipmaps = true;
    colorTex.minFilter = THREE.LinearMipmapLinearFilter;
    depthTex.generateMipmaps = true;
    depthTex.minFilter = THREE.LinearMipmapLinearFilter;

    // Dense grid of Gaussian splats: 280 x 350 ~ 98,000 splats
    const cols = 280;
    const rows = 350;
    const count = cols * rows;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);

    let idx = 0;
    let uvIdx = 0;

    const planeW = 1.0;
    const planeH = planeW * (rows / cols);

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
        uMouse: { value: new THREE.Vector2(0, 0) },
        uTime: { value: 0 }
      },
      vertexShader: `
        uniform sampler2D uDepthMap;
        uniform float uDepthScale;
        uniform float uSplatSize;
        uniform vec2 uResolution;
        uniform vec2 uMouse;
        uniform float uTime;

        varying vec2 vUv;
        varying float vDepth;

        void main() {
          vUv = uv;
          
          // Normalized depth
          float depthVal = texture2D(uDepthMap, uv).r;
          vDepth = depthVal;

          vec3 pos = position;
          
          // Subtle, delicate 3D displacement (lowest value = clean, zero tearing)
          pos.z += (depthVal - 0.5) * uDepthScale;
          
          // Micro breathing motion
          pos.z += sin(uTime * 1.2 + pos.x * 4.0) * 0.003;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          // Gaussian splat point size (largest value = rich, overlapping, continuous)
          float baseSize = uSplatSize * 9.5;
          gl_PointSize = baseSize * (uResolution.y / 700.0) * (1.6 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform sampler2D uColorMap;
        uniform vec2 uMouse;
        uniform float uTime;
        varying vec2 vUv;
        varying float vDepth;

        void main() {
          vec2 coord = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(coord, coord);
          
          // Splat boundary
          if (r2 > 1.0) discard;

          vec4 color = texture2D(uColorMap, vUv);

          // Authentic soft Gaussian alpha falloff
          float alpha = exp(-2.1 * r2);

          // Subtle holographic light reflection across splats when tilting
          float sheen = sin((vUv.x + vUv.y + uMouse.x * 0.5 + uMouse.y * 0.5) * 5.0 + uTime * 0.3) * 0.5 + 0.5;
          vec3 holoGleam = vec3(
            sin(sheen * 3.14 + 0.0),
            sin(sheen * 3.14 + 2.0),
            sin(sheen * 3.14 + 4.0)
          ) * 0.06 * (1.0 - vDepth * 0.5);

          gl_FragColor = vec4(color.rgb + holoGleam, color.a * alpha);
        }
      `
    });

    this.currentMesh = new THREE.Points(geometry, material);
    this.scene.add(this.currentMesh);
  }

  loadTexture(url) {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(url, resolve, undefined, reject);
    });
  }

  animate(time) {
    this.animationId = requestAnimationFrame(this.animate);

    // Smooth spring interpolation for tilt
    this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.1;
    this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.1;

    // 1. Move the 3D camera inside the canvas
    const rotX = -this.mouse.y * 0.28;
    const rotY = this.mouse.x * 0.38;
    this.camera.position.x = Math.sin(rotY) * 2.2;
    this.camera.position.z = Math.cos(rotY) * 2.2;
    this.camera.position.y = Math.sin(rotX) * 2.2;
    this.camera.lookAt(0, 0, 0);

    // 2. Also physically tilt the Polaroid card FRAME with the image!
    if (this.frameElement) {
      const degX = (-this.mouse.y * 12).toFixed(2);
      const degY = (this.mouse.x * 14).toFixed(2);
      const shadowX = (-this.mouse.x * 20).toFixed(1);
      const shadowY = (this.mouse.y * 20 + 35).toFixed(1);

      this.frameElement.style.transform = `perspective(900px) rotateX(${degX}deg) rotateY(${degY}deg) scale(1)`;
      this.frameElement.style.boxShadow = `${shadowX}px ${shadowY}px 70px rgba(0, 0, 0, 0.85), 0 0 35px rgba(255, 200, 122, 0.12)`;
    }

    if (this.currentMesh && this.currentMesh.material.uniforms) {
      this.currentMesh.material.uniforms.uMouse.value.copy(this.mouse);
      this.currentMesh.material.uniforms.uTime.value = time * 0.001;
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    cancelAnimationFrame(this.animationId);
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
