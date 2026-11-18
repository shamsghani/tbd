import * as THREE from 'three';

/**
 * 3D Hologram & Spatial Depth Parallax Viewer
 * - Full aperture fill (NO black borders, NO distorted edges)
 * - Synchronized 3D card tilt and optical parallax
 * - Hyper-responsive gyro tracking with automatic posture recalibration
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
    this.onTilt = null;

    // Orientation calibration
    this.baselineBeta = null;
    this.baselineGamma = null;
    this.lastTime = 0;

    this.isTouchDragging = false;
    this.touchStart = { x: 0, y: 0 };
    this.touchOffset = { x: 0, y: 0 };

    this.initSensors();
    this.initTouchControls();
    this.initResize();

    this.animate = this.animate.bind(this);
    this.animationId = requestAnimationFrame(this.animate);
  }

  /**
   * Reset the gyro origin so whatever angle the user is currently holding
   * the phone becomes the neutral (0, 0) center position.
   */
  recalibrate() {
    this.baselineBeta = null;
    this.baselineGamma = null;
  }

  initSensors() {
    const getScreenAngle = () => {
      if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
        return window.screen.orientation.angle;
      }
      if (typeof window.orientation === 'number') {
        return window.orientation;
      }
      return 0;
    };

    const onOrientation = (e) => {
      if (e.gamma === null || e.beta === null) return;

      const angle = getScreenAngle();
      let rawRoll = e.gamma;
      let rawPitch = e.beta;

      // Adapt axes based on device orientation (portrait vs landscape)
      if (angle === 90) {
        rawRoll = -e.beta;
        rawPitch = e.gamma;
      } else if (angle === -90 || angle === 270) {
        rawRoll = e.beta;
        rawPitch = -e.gamma;
      } else if (angle === 180) {
        rawRoll = -e.gamma;
        rawPitch = -e.beta;
      }

      // First sample after opening modal or recalibrating sets the resting baseline
      if (this.baselineGamma === null || this.baselineBeta === null) {
        this.baselineGamma = rawRoll;
        this.baselineBeta = rawPitch;
        return;
      }

      // If user drastically shifts posture (>35 deg deviation), gently drift baseline
      // so the card never remains permanently pegged at an extreme edge
      const deltaRoll = rawRoll - this.baselineGamma;
      const deltaPitch = rawPitch - this.baselineBeta;

      if (Math.abs(deltaRoll) > 35) {
        this.baselineGamma += (rawRoll - this.baselineGamma) * 0.05;
      }
      if (Math.abs(deltaPitch) > 35) {
        this.baselineBeta += (rawPitch - this.baselineBeta) * 0.05;
      }

      // Active responsive tilt range: ±14 degrees for full deflection
      // Natural wrist movements (5° - 10°) now feel snappy, effortless, and alive
      const TILT_RANGE = 14.0;
      const roll = Math.max(-1, Math.min(1, (rawRoll - this.baselineGamma) / TILT_RANGE));
      const pitch = Math.max(-1, Math.min(1, (rawPitch - this.baselineBeta) / TILT_RANGE));

      if (!this.isTouchDragging) {
        this.targetMouse.x = roll;
        this.targetMouse.y = pitch;
      }
    };

    // Attach standard deviceorientation listener
    let standardListenerActive = false;
    const handleStandardOrientation = (e) => {
      standardListenerActive = true;
      onOrientation(e);
    };

    window.addEventListener('deviceorientation', handleStandardOrientation, { passive: true });

    // Fallback to absolute only if standard event never fires
    setTimeout(() => {
      if (!standardListenerActive && 'ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', onOrientation, { passive: true });
      }
    }, 1000);

    // Touch / mouse movement for desktop
    window.addEventListener('mousemove', (e) => {
      if (this.isTouchDragging) return;
      const rect = this.container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      this.targetMouse.x = Math.max(-1, Math.min(1, nx * 1.15));
      this.targetMouse.y = Math.max(-1, Math.min(1, ny * 1.15));
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
        const dx = (e.touches[0].clientX - this.touchStart.x) / 100;
        const dy = (e.touches[0].clientY - this.touchStart.y) / 100;
        this.targetMouse.x = Math.max(-1, Math.min(1, this.touchOffset.x + dx));
        this.targetMouse.y = Math.max(-1, Math.min(1, this.touchOffset.y + dy));
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.isTouchDragging = false;
      // Re-zero baseline on finger release to keep the current perspective smoothly
      this.recalibrate();
    }, { passive: true });

    // Tap on card frame instantly recalibrates to current angle
    if (this.frameElement) {
      this.frameElement.addEventListener('click', () => {
        if (!this.isTouchDragging) {
          this.recalibrate();
        }
      });
    }
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

  async loadMemory(photoUrl, depthUrl, overlayUrl = null) {
    this.recalibrate();

    if (this.mesh) {
      this.scene.remove(this.mesh);
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
      this.mesh = null;
    }

    this.width = this.container.clientWidth || 320;
    this.height = this.container.clientHeight || 400;
    this.renderer.setSize(this.width, this.height);

    const promises = [
      this.loadTexture(photoUrl),
      this.loadTexture(depthUrl)
    ];
    if (overlayUrl) {
      promises.push(this.loadTexture(overlayUrl));
    }

    const textures = await Promise.all(promises);
    const colorTex = textures[0];
    const depthTex = textures[1];
    const overlayTex = overlayUrl ? textures[2] : null;

    colorTex.generateMipmaps = true;
    colorTex.minFilter = THREE.LinearFilter;
    depthTex.generateMipmaps = true;
    depthTex.minFilter = THREE.LinearFilter;

    if (overlayTex) {
      overlayTex.generateMipmaps = true;
      overlayTex.minFilter = THREE.LinearFilter;
    }

    const imgW = colorTex.image.naturalWidth || colorTex.image.width || 800;
    const imgH = colorTex.image.naturalHeight || colorTex.image.height || 1000;

    const geometry = new THREE.PlaneGeometry(2, 2);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uImage: { value: colorTex },
        uDepth: { value: depthTex },
        uOverlay: { value: overlayTex || colorTex },
        uHasOverlay: { value: overlayUrl ? 1.0 : 0.0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        // Increased parallax for rich, tangible depth relief
        uParallax: { value: 0.052 },
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
        uniform sampler2D uOverlay;
        uniform float uHasOverlay;
        uniform vec2 uMouse;
        uniform float uParallax;
        uniform vec2 uResolution;
        uniform vec2 uImageRes;
        uniform float uTime;
        varying vec2 vUv;

        // Cover aspect ratio function with 10% zoom margin so parallax never clips edges
        vec2 getCoverUv(vec2 uv, vec2 screenRes, vec2 texRes) {
          float screenAspect = screenRes.x / screenRes.y;
          float texAspect = texRes.x / texRes.y;
          vec2 ratio = vec2(
            min(screenAspect / texAspect, 1.0),
            min((1.0 / screenAspect) / (1.0 / texAspect), 1.0)
          );
          vec2 scaled = (uv - 0.5) / 1.10 + 0.5;
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

          vec4 baseColor = texture2D(uImage, finalUv);

          // If this photo has an overlay layer (Orion constellation appearing when turned on an angle):
          if (uHasOverlay > 0.5) {
            vec4 overlayColor = texture2D(uOverlay, finalUv);
            // Tilt magnitude: 0 head-on, rises as card turns
            float tiltMag = length(uMouse);
            // Smooth reveal transition: begins emerging at 0.12 tilt, fully vivid by 0.42 tilt
            float reveal = smoothstep(0.12, 0.42, tiltMag);
            baseColor = mix(baseColor, overlayColor, reveal);
          }

          // Subtle holographic rainbow gleam that sweeps across normal photos on tilt
          vec3 holoGleam = vec3(0.0);
          if (uHasOverlay < 0.5) {
            float sheenPos = dot(finalUv, vec2(0.9, 1.1)) + uMouse.x * 0.7 + uMouse.y * 0.7;
            float holoWave = sin(sheenPos * 6.28 + uTime * 0.4);

            holoGleam = vec3(
              sin(holoWave * 3.1415 + 0.0),
              sin(holoWave * 3.1415 + 2.09),
              sin(holoWave * 3.1415 + 4.18)
            ) * 0.055 * (1.0 - d2 * 0.45);
          }

          gl_FragColor = vec4(baseColor.rgb + holoGleam, 1.0);
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

    const now = time ? time * 0.001 : performance.now() * 0.001;
    const dt = this.lastTime ? Math.min(now - this.lastTime, 0.1) : 0.016;
    this.lastTime = now;

    // Snappy responsive exponential smoothing:
    // Speed factor 18.0 delivers ~0.26 per frame at 60fps (dt ~0.016s),
    // eliminating input lag while maintaining buttery smoothness across 60Hz and 120Hz displays
    const factor = 1.0 - Math.exp(-18.0 * dt);
    this.mouse.x += (this.targetMouse.x - this.mouse.x) * factor;
    this.mouse.y += (this.targetMouse.y - this.mouse.y) * factor;

    // Tilt the physical Polaroid card FRAME in sync with optical parallax!
    // Tilting right (mouse.x > 0) -> rotateY positive (+14 deg)
    // Tilting down (mouse.y > 0) -> rotateX negative (-14 deg)
    if (this.frameElement) {
      const rotY = (this.mouse.x * 14).toFixed(2);
      const rotX = (-this.mouse.y * 14).toFixed(2);
      const shadowX = (-this.mouse.x * 20).toFixed(1);
      const shadowY = (this.mouse.y * 20 + 32).toFixed(1);

      this.frameElement.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1)`;
      this.frameElement.style.boxShadow = `${shadowX}px ${shadowY}px 60px rgba(0, 0, 0, 0.85), 0 0 32px rgba(255, 200, 122, 0.12)`;
    }

    if (this.mesh && this.mesh.material && this.mesh.material.uniforms) {
      this.mesh.material.uniforms.uMouse.value.copy(this.mouse);
      this.mesh.material.uniforms.uTime.value = now;
    }

    if (this.onTilt) {
      this.onTilt(this.mouse);
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
