import * as THREE from 'three';

/**
 * 3D Hologram & Spatial Depth Parallax Viewer
 * Creates a crystal-clear holographic 3D photo effect using
 * raymarched depth parallax, phone gyroscope, and subtle foil gleam.
 */
export class HologramViewer {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth || 300;
    this.height = container.clientHeight || 375;

    this.scene = new THREE.Scene();
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
        // Clamp gamma (roll - left/right) and beta (pitch - front/back)
        const roll = Math.max(-28, Math.min(28, e.gamma)) / 28; // -1 to 1
        const pitch = Math.max(-28, Math.min(28, e.beta - 45)) / 28; // -1 to 1
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

    this.container.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    this.container.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });
  }

  initResize() {
    window.addEventListener('resize', () => {
      this.width = this.container.clientWidth || 300;
      this.height = this.container.clientHeight || 375;
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

    // Update container dimensions on modal open
    this.width = this.container.clientWidth || 300;
    this.height = this.container.clientHeight || 375;
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
        uParallax: { value: 0.045 },
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

        // Aspect ratio cover function
        vec2 getCoverUv(vec2 uv, vec2 screenRes, vec2 texRes) {
          float screenAspect = screenRes.x / screenRes.y;
          float texAspect = texRes.x / texRes.y;
          vec2 ratio = vec2(
            min(screenAspect / texAspect, 1.0),
            min((1.0 / screenAspect) / (1.0 / texAspect), 1.0)
          );
          return vec2(
            uv.x * ratio.x + (1.0 - ratio.x) * 0.5,
            uv.y * ratio.y + (1.0 - ratio.y) * 0.5
          );
        }

        void main() {
          // Fit photo cleanly with aspect-ratio cover
          vec2 baseUv = getCoverUv(vUv, uResolution, uImageRes);
          
          // Sample depth
          float d = texture2D(uDepth, baseUv).r;
          
          // Realistic optical parallax displacement
          vec2 offset = uMouse * (d - 0.5) * uParallax;
          vec2 sampleUv = clamp(baseUv + offset, 0.002, 0.998);
          
          // 2nd tap raymarching refinement to prevent edge tearing
          float d2 = texture2D(uDepth, sampleUv).r;
          vec2 finalOffset = uMouse * (d2 - 0.5) * uParallax;
          vec2 finalUv = clamp(baseUv + finalOffset, 0.002, 0.998);

          vec4 color = texture2D(uImage, finalUv);

          // Subtle holographic iridescent foil reflection on phone tilt
          float sheenPos = dot(finalUv, vec2(0.9, 1.1)) + uMouse.x * 0.65 + uMouse.y * 0.65;
          float holoWave = sin(sheenPos * 6.28 + uTime * 0.4);
          
          vec3 holoGleam = vec3(
            sin(holoWave * 3.1415 + 0.0),
            sin(holoWave * 3.1415 + 2.09),
            sin(holoWave * 3.1415 + 4.18)
          ) * 0.065 * (1.0 - d2 * 0.5);

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

    // Smooth spring damping for tilt
    this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.12;
    this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.12;

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
