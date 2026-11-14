import * as THREE from 'three';

/**
 * 3D Hologram & Spatial Depth Parallax Viewer
 * - Full aperture fill (NO black borders, NO distorted edges)
 * - Synchronized 3D card tilt and optical parallax
 * - Supports phone gyroscope, touch dragging, and mouse movement
 */
export class HologramViewer {
  constructor(container, frameElement) {
    this.container = container;
    this.frameElement = frameElement; // The outer Polaroid card
    this.width = container.clientWidth || 320;
    this.height = container.clientHeight || 400;

    this.scene = new THREE.Scene();
    // Fixed orthographic camera guarantees edge-to-edge fill with zero perspective warp
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.textureLoader = new THREE.TextureLoader();
    this.mesh = null;

    // Tilt tracking: [-1, 1]
    this.mouse = new THREE.Vector2(0, 0);
    this.targetMouse = new THREE.Vector2(0, 0);

    this.initialBeta = null;
    this.isTouchDragging = false;
    this.touchStart = { x: 0, y: 0 };
    this.touchOffset = { x: 0, y: 0 };

    this.initSensors();
    this.initTouchControls();
    this.initResize();

    this.animate = this.animate.bind(this);
    this.animationId = requestAnimationFrame(this.animate);
  }

  initSensors() {
    const onOrientation = (e) => {
      if (e.gamma !== null && e.beta !== null) {
        if (this.initialBeta === null) {
          this.initialBeta = e.beta;
        }

        // Roll: left / right tilt
        // gamma: -90 (left) to +90 (right). Normal range: -25 to +25
        const roll = Math.max(-25, Math.min(25, e.gamma)) / 25;

        // Pitch: front / back tilt
        // Center around nominal 48 deg holding angle
        const baseBeta = (this.initialBeta > 20 && this.initialBeta < 80) ? this.initialBeta : 48;
        const pitch = Math.max(-25, Math.min(25, e.beta - baseBeta)) / 25;

        // Match physical optical direction:
        // Tilting right (roll > 0) -> card rotates right, foreground shifts right
        // Tilting down (pitch > 0) -> card rotates down, foreground shifts down
        if (!this.isTouchDragging) {
          this.targetMouse.x = roll;
          this.targetMouse.y = pitch;
        }
      }
    };

    // Attach listeners
    window.addEventListener('deviceorientation', onOrientation, true);
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', onOrientation, true);
    }

    // Touch / mouse movement
    window.addEventListener('mousemove', (e) => {
      if (this.isTouchDragging) return;
      const rect = this.container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      this.targetMouse.x = Math.max(-1, Math.min(1, nx));
      this.targetMouse.y = Math.max(-1, Math.min(1, ny));
    });
  }

  initTouchControls() {
    // Touch drag on modal allows direct interactive finger tilting
    const el = this.container;

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isTouchDragging = true;
        this.touchStart.x = e.touches[0].clientX;
        this.touchStart.y = e.touches[0].clientY;
        this.touchOffset.x = this.targetMouse.x;
        this.touchOffset.y = this.targetMouse.y;
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (this.isTouchDragging && e.touches.length === 1) {
        const dx = (e.touches[0].clientX - this.touchStart.x) / 140;
        const dy = (e.touches[0].clientY - this.touchStart.y) / 140;
        this.targetMouse.x = Math.max(-1, Math.min(1, this.touchOffset.x + dx));
        this.targetMouse.y = Math.max(-1, Math.min(1, this.touchOffset.y + dy));
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.isTouchDragging = false;
    }, { passive: true });
  }

  initResize() {
    window.addEventListener('resize', () => {
      this.width = this.container.clientWidth || 320;
      this.height = this.container.clientHeight || 400;
      this.renderer.setSize(this.width, this.height);
      if (this.mesh && this.mesh.material.uniforms) {
        this.mesh.material.uniforms.uResolution.value.set(this.width, this.height);
      }
    });
  }

  async loadMemory(photoUrl, depthUrl) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
      this.mesh = null;
    }

    this.width = this.container.clientWidth || 320;
    this.height = this.container.clientHeight || 400;
    this.renderer.setSize(this.width, this.height);

    const [colorTex, depthTex] = await Promise.all([
      this.loadTexture(photoUrl),
      this.loadTexture(depthUrl)
    ]);

    colorTex.generateMipmaps = true;
    colorTex.minFilter = THREE.LinearFilter;
    depthTex.generateMipmaps = true;
    depthTex.minFilter = THREE.LinearFilter;

    const imgW = colorTex.image.naturalWidth || colorTex.image.width || 800;
    const imgH = colorTex.image.naturalHeight || colorTex.image.height || 1000;

    const geometry = new THREE.PlaneGeometry(2, 2);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uImage: { value: colorTex },
        uDepth: { value: depthTex },
        uMouse: { value: new THREE.Vector2(0, 0) },
        // Subtle, elegant optical parallax (never exposes borders)
        uParallax: { value: 0.038 },
        uResolution: { value: new THREE.Vector2(this.width, this.height) },
        uImageRes: { value: new THREE.Vector2(imgW, imgH) },
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uImage;
        uniform sampler2D uDepth;
        uniform vec2 uMouse;
        uniform float uParallax;
        uniform vec2 uResolution;
        uniform vec2 uImageRes;
        uniform float uTime;
        varying vec2 vUv;

        // Cover aspect ratio function with 4% zoom margin so parallax never clips edges
        vec2 getCoverUv(vec2 uv, vec2 screenRes, vec2 texRes) {
          float screenAspect = screenRes.x / screenRes.y;
          float texAspect = texRes.x / texRes.y;
          vec2 ratio = vec2(
            min(screenAspect / texAspect, 1.0),
            min((1.0 / screenAspect) / (1.0 / texAspect), 1.0)
          );
          // 1.08 scale factor provides buffer room for parallax shift
          vec2 scaled = (uv - 0.5) / 1.08 + 0.5;
          return vec2(
            scaled.x * ratio.x + (1.0 - ratio.x) * 0.5,
            scaled.y * ratio.y + (1.0 - ratio.y) * 0.5
          );
        }

        void main() {
          vec2 baseUv = getCoverUv(vUv, uResolution, uImageRes);

          // Sample depth (normalized 0 to 1, 1 = closest)
          float d = texture2D(uDepth, baseUv).r;

          // Parallax shift:
          // Foreground (d > 0.5) shifts in tilt direction
          // Background (d < 0.5) shifts opposite, giving real optical depth!
          vec2 shift = uMouse * (d - 0.5) * uParallax;
          vec2 uv1 = clamp(baseUv + shift, 0.001, 0.999);

          // Second raymarch tap for clean occlusion boundaries
          float d2 = texture2D(uDepth, uv1).r;
          vec2 finalShift = uMouse * (d2 - 0.5) * uParallax;
          vec2 finalUv = clamp(baseUv + finalShift, 0.001, 0.999);

          vec4 color = texture2D(uImage, finalUv);

          // Subtle holographic rainbow gleam that sweeps across the photo on tilt
          float sheenPos = dot(finalUv, vec2(0.9, 1.1)) + uMouse.x * 0.7 + uMouse.y * 0.7;
          float holoWave = sin(sheenPos * 6.28 + uTime * 0.4);

          vec3 holoGleam = vec3(
            sin(holoWave * 3.1415 + 0.0),
            sin(holoWave * 3.1415 + 2.09),
            sin(holoWave * 3.1415 + 4.18)
          ) * 0.055 * (1.0 - d2 * 0.45);

          gl_FragColor = vec4(color.rgb + holoGleam, 1.0);
        }
      `
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
  }

  loadTexture(url) {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(url, resolve, undefined, reject);
    });
  }

  animate(time) {
    this.animationId = requestAnimationFrame(this.animate);

    // Smooth spring damping
    this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.12;
    this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.12;

    // Tilt the physical Polaroid card FRAME in sync with the optical parallax!
    // Tilting right (mouse.x > 0) -> rotateY positive (+12 deg)
    // Tilting down (mouse.y > 0) -> rotateX negative (-12 deg)
    if (this.frameElement) {
      const rotY = (this.mouse.x * 12).toFixed(2);
      const rotX = (-this.mouse.y * 12).toFixed(2);
      const shadowX = (-this.mouse.x * 18).toFixed(1);
      const shadowY = (this.mouse.y * 18 + 30).toFixed(1);

      this.frameElement.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1)`;
      this.frameElement.style.boxShadow = `${shadowX}px ${shadowY}px 60px rgba(0, 0, 0, 0.85), 0 0 30px rgba(255, 200, 122, 0.1)`;
    }

    if (this.mesh && this.mesh.material.uniforms) {
      this.mesh.material.uniforms.uMouse.value.copy(this.mouse);
      this.mesh.material.uniforms.uTime.value = time * 0.001;
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
