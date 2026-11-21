import * as THREE from 'three';

export class CakeScene {
  constructor(container, onBlowOut) {
    this.container = container;
    this.onBlowOut = onBlowOut;
    this.isBlownOut = false;

    this.width = container.clientWidth || 400;
    this.height = container.clientHeight || 400;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 50);
    this.updateCamera();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.initLights();
    this.buildCake();
    this.initInteraction();
    this.initResize();

    this.animate = this.animate.bind(this);
    this.animationId = requestAnimationFrame(this.animate);
  }

  updateCamera() {
    const aspect = this.width / this.height;
    this.camera.aspect = aspect;
    // On portrait screens (aspect < 1), position camera back so the cake & stand never clip horizontally
    const dist = aspect < 1 ? Math.min(5.2, (4.2 / Math.max(aspect, 0.65)) * 0.94) : 4.4;
    this.camera.position.set(0, 0.65 + dist * 0.28, dist);
    this.camera.lookAt(0, 0.62, 0);
    this.camera.updateProjectionMatrix();
  }

  initLights() {
    // Ambient fill
    const ambientLight = new THREE.AmbientLight(0xfff5ea, 1.4);
    this.scene.add(ambientLight);

    // Warm directional rim light
    const dirLight = new THREE.DirectionalLight(0xffecd2, 1.8);
    dirLight.position.set(3, 5, 4);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    // Soft cool backlight
    const backLight = new THREE.DirectionalLight(0xa5c4d4, 0.8);
    backLight.position.set(-3, 3, -3);
    this.scene.add(backLight);

    // Candle flame point light
    this.flameLight = new THREE.PointLight(0xffa133, 2.5, 4.5);
    this.flameLight.position.set(0, 1.65, 0);
    this.scene.add(this.flameLight);
  }

  buildCake() {
    this.cakeGroup = new THREE.Group();

    // 1. Ceramic Gold Plate / Stand
    const plateGeo = new THREE.CylinderGeometry(1.22, 1.1, 0.08, 48);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xe5c38c,
      roughness: 0.25,
      metalness: 0.65
    });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.y = 0.04;
    this.cakeGroup.add(plate);

    // 2. Bottom Cake Tier
    const bottomGeo = new THREE.CylinderGeometry(1.05, 1.05, 0.6, 48);
    const frostingMat = new THREE.MeshStandardMaterial({
      color: 0xfdfbf7, // Vanilla cream
      roughness: 0.4
    });
    const bottomTier = new THREE.Mesh(bottomGeo, frostingMat);
    bottomTier.position.y = 0.38;
    this.cakeGroup.add(bottomTier);

    // Bottom decorative pearls / piping
    const pearlCount = 32;
    const pearlMat = new THREE.MeshStandardMaterial({
      color: 0xffd1dc, // Soft strawberry pink
      roughness: 0.2
    });
    for (let i = 0; i < pearlCount; i++) {
      const angle = (i / pearlCount) * Math.PI * 2;
      const pearlGeo = new THREE.SphereGeometry(0.045, 12, 12);
      const pearl = new THREE.Mesh(pearlGeo, pearlMat);
      pearl.position.set(Math.cos(angle) * 1.05, 0.12, Math.sin(angle) * 1.05);
      this.cakeGroup.add(pearl);
    }

    // 3. Top Cake Tier
    const topGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.5, 48);
    const topTierMat = new THREE.MeshStandardMaterial({
      color: 0xfff0f5, // Soft blush cream
      roughness: 0.35
    });
    const topTier = new THREE.Mesh(topGeo, topTierMat);
    topTier.position.y = 0.93;
    this.cakeGroup.add(topTier);

    // Top decorative golden sprinkles / pearls
    const topPearlCount = 24;
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.8,
      roughness: 0.2
    });
    for (let i = 0; i < topPearlCount; i++) {
      const angle = (i / topPearlCount) * Math.PI * 2;
      const pGeo = new THREE.SphereGeometry(0.035, 10, 10);
      const p = new THREE.Mesh(pGeo, goldMat);
      p.position.set(Math.cos(angle) * 0.72, 0.7, Math.sin(angle) * 0.72);
      this.cakeGroup.add(p);
    }

    // 4. Candle
    const candleGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.45, 24);
    const candleMat = new THREE.MeshStandardMaterial({
      color: 0xff6b8b, // Rose pink candle
      roughness: 0.3
    });
    const candle = new THREE.Mesh(candleGeo, candleMat);
    candle.position.y = 1.4;
    this.cakeGroup.add(candle);

    // Candle Wick
    const wickGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8);
    const wickMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const wick = new THREE.Mesh(wickGeo, wickMat);
    wick.position.y = 1.65;
    this.cakeGroup.add(wick);

    // 5. Candle Flame (Stylized glowing teardrop)
    const flameGeo = new THREE.ConeGeometry(0.065, 0.18, 16);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 0.95
    });
    this.flame = new THREE.Mesh(flameGeo, flameMat);
    this.flame.position.y = 1.76;
    this.cakeGroup.add(this.flame);

    // Inner bright core
    const coreGeo = new THREE.ConeGeometry(0.035, 0.11, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = -0.01;
    this.flame.add(core);

    // 6. Floating Sparkles around cake
    const sparkleCount = 35;
    const sparkleGeo = new THREE.BufferGeometry();
    const sparklePos = new Float32Array(sparkleCount * 3);
    for (let i = 0; i < sparkleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const rad = 0.8 + Math.random() * 0.9;
      sparklePos[i * 3 + 0] = Math.cos(theta) * rad;
      sparklePos[i * 3 + 1] = 0.4 + Math.random() * 1.5;
      sparklePos[i * 3 + 2] = Math.sin(theta) * rad;
    }
    sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePos, 3));
    const sparkleMat = new THREE.PointsMaterial({
      color: 0xffd37f,
      size: 0.05,
      transparent: true,
      opacity: 0.8
    });
    this.sparkles = new THREE.Points(sparkleGeo, sparkleMat);
    this.cakeGroup.add(this.sparkles);

    this.scene.add(this.cakeGroup);
  }

  initInteraction() {
    const el = this.renderer.domElement;
    el.style.cursor = 'pointer';

    const handleClick = () => {
      this.blowOut();
    };

    el.addEventListener('click', handleClick);
    el.addEventListener('pointerdown', handleClick);
  }

  blowOut() {
    if (this.isBlownOut) return;
    this.isBlownOut = true;

    // Animate flame extinguishing
    const startTime = performance.now();
    const initialFlameScale = this.flame.scale.y;

    const shrinkFlame = () => {
      const elapsed = (performance.now() - startTime) / 350;
      if (elapsed < 1.0) {
        const factor = 1.0 - elapsed;
        this.flame.scale.set(factor, factor * initialFlameScale, factor);
        this.flameLight.intensity = 2.5 * factor;
        requestAnimationFrame(shrinkFlame);
      } else {
        this.flame.visible = false;
        this.flameLight.intensity = 0;
        this.spawnSmoke();
      }
    };
    shrinkFlame();

    if (this.onBlowOut) {
      this.onBlowOut();
    }
  }

  relight() {
    this.isBlownOut = false;
    this.flame.visible = true;
    this.flame.scale.set(1, 1, 1);
    this.flameLight.intensity = 2.5;
  }

  spawnSmoke() {
    // Soft smoke puff
    const smokeCount = 18;
    const smokeGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(smokeCount * 3);
    for (let i = 0; i < smokeCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 0.05;
      positions[i * 3 + 1] = 1.68 + (Math.random() * 0.05);
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const smokeMat = new THREE.PointsMaterial({
      color: 0xbbbbbb,
      size: 0.07,
      transparent: true,
      opacity: 0.6
    });
    const smoke = new THREE.Points(smokeGeo, smokeMat);
    this.cakeGroup.add(smoke);

    const start = performance.now();
    const animSmoke = () => {
      const elapsed = (performance.now() - start) / 1200;
      if (elapsed < 1.0) {
        const pos = smoke.geometry.attributes.position.array;
        for (let i = 0; i < smokeCount; i++) {
          pos[i * 3 + 1] += 0.005;
          pos[i * 3 + 0] += (Math.random() - 0.5) * 0.002;
        }
        smoke.geometry.attributes.position.needsUpdate = true;
        smokeMat.opacity = (1.0 - elapsed) * 0.6;
        requestAnimationFrame(animSmoke);
      } else {
        this.cakeGroup.remove(smoke);
        smokeGeo.dispose();
        smokeMat.dispose();
      }
    };
    animSmoke();
  }

  initResize() {
    window.addEventListener('resize', () => {
      this.width = this.container.clientWidth;
      this.height = this.container.clientHeight;
      this.updateCamera();
      this.renderer.setSize(this.width, this.height);
    });
  }

  animate(time) {
    this.animationId = requestAnimationFrame(this.animate);

    // Gentle cake rotation
    if (this.cakeGroup) {
      this.cakeGroup.rotation.y = time * 0.00045;
    }

    // Flame flicker animation
    if (!this.isBlownOut && this.flame) {
      const flicker = Math.sin(time * 0.015) * 0.08 + Math.cos(time * 0.023) * 0.06;
      this.flame.scale.x = 1.0 + flicker * 0.6;
      this.flame.scale.z = 1.0 + flicker * 0.6;
      this.flame.scale.y = 1.0 + flicker;
      this.flame.rotation.z = Math.sin(time * 0.008) * 0.08;
      this.flameLight.intensity = 2.5 + flicker * 0.8;
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

