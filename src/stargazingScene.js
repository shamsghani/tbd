/**
 * Stargazing Epilogue Scene: Two Silhouettes on a Hill & Hiding Orion Constellation
 * - Triggered by scroll resistance & snap at the bottom of the Polaroid memory wall
 * - Minimalist romantic hill silhouette under the night sky
 * - Orion constellation stars pulse, lines draw, and caption reveals
 */

export class StargazingScene {
  constructor(sectionElement, barrierElement) {
    this.section = sectionElement;
    this.barrier = barrierElement;
    this.isUnlocked = false;
    this.hasTriggeredReveal = false;

    // Scroll resistance tracking
    this.startY = 0;
    this.currentPull = 0;
    this.isPulling = false;
    this.snapThreshold = 75; // px of elastic pull needed to snap open
    this.decayTimer = null;

    this.threadEl = document.getElementById('barrier-thread');
    this.iconEl = document.getElementById('barrier-icon');
    this.hintEl = document.getElementById('barrier-hint');

    this.initSceneHtml();
    this.initScrollResistance();
  }

  initSceneHtml() {
    this.section.innerHTML = `
      <svg class="stargaze-svg" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="stargazeHillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0c1020"/>
            <stop offset="25%" stop-color="#070914"/>
            <stop offset="100%" stop-color="#020306"/>
          </linearGradient>
          <radialGradient id="stargazeHorizonAura" cx="50%" cy="75%" r="45%">
            <stop offset="0%" stop-color="rgba(80, 110, 190, 0.22)"/>
            <stop offset="50%" stop-color="rgba(40, 60, 120, 0.08)"/>
            <stop offset="100%" stop-color="rgba(10, 20, 50, 0)"/>
          </radialGradient>
          <radialGradient id="stargazeNebulaGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(255, 120, 200, 0.45)"/>
            <stop offset="45%" stop-color="rgba(180, 100, 255, 0.2)"/>
            <stop offset="100%" stop-color="rgba(100, 50, 200, 0)"/>
          </radialGradient>
          <radialGradient id="stargazeLanternGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(255, 195, 110, 0.6)"/>
            <stop offset="45%" stop-color="rgba(255, 160, 60, 0.2)"/>
            <stop offset="100%" stop-color="rgba(255, 160, 60, 0)"/>
          </radialGradient>
        </defs>

        <!-- Soft atmospheric backglow along horizon behind figures -->
        <ellipse cx="300" cy="590" rx="260" ry="120" fill="url(#stargazeHorizonAura)"/>

        <!-- Ambient background stars -->
        <g id="stargaze-ambient-stars" opacity="0.8">
          <circle cx="65" cy="90" r="1.1" fill="#fff" opacity="0.6"/>
          <circle cx="120" cy="65" r="1.3" fill="#fff" opacity="0.85"/>
          <circle cx="180" cy="125" r="0.9" fill="#ffd" opacity="0.5"/>
          <circle cx="490" cy="85" r="1.2" fill="#fff" opacity="0.7"/>
          <circle cx="535" cy="140" r="1.0" fill="#dff" opacity="0.6"/>
          <circle cx="55" cy="220" r="0.8" fill="#fff" opacity="0.45"/>
          <circle cx="140" cy="270" r="1.1" fill="#fff" opacity="0.65"/>
          <circle cx="470" cy="240" r="1.3" fill="#fff" opacity="0.75"/>
          <circle cx="545" cy="290" r="0.9" fill="#ffd" opacity="0.5"/>
          <circle cx="95" cy="380" r="1.0" fill="#fff" opacity="0.55"/>
          <circle cx="510" cy="410" r="1.2" fill="#fff" opacity="0.65"/>
          <circle cx="410" cy="95" r="0.8" fill="#fff" opacity="0.5"/>
          <circle cx="230" cy="45" r="1.4" fill="#fff" opacity="0.9"/>
          <circle cx="370" cy="55" r="1.0" fill="#fff" opacity="0.6"/>
          <circle cx="80" cy="480" r="0.7" fill="#fff" opacity="0.4"/>
          <circle cx="520" cy="500" r="0.9" fill="#fff" opacity="0.5"/>
        </g>

        <!-- Orion Constellation Group -->
        <g id="stargaze-orion">
          <!-- Connecting lines (initially invisible) -->
          <line x1="230" y1="180" x2="295" y2="145" class="stargaze-line" id="line-meissa-left"/>
          <line x1="295" y1="145" x2="360" y2="195" class="stargaze-line" id="line-meissa-right"/>
          
          <line x1="230" y1="180" x2="275" y2="265" class="stargaze-line" id="line-betelgeuse-belt"/>
          <line x1="360" y1="195" x2="325" y2="252" class="stargaze-line" id="line-bellatrix-belt"/>

          <line x1="275" y1="265" x2="300" y2="258" class="stargaze-line" id="line-belt-1"/>
          <line x1="300" y1="258" x2="325" y2="252" class="stargaze-line" id="line-belt-2"/>

          <line x1="275" y1="265" x2="250" y2="365" class="stargaze-line" id="line-belt-saiph"/>
          <line x1="325" y1="252" x2="350" y2="350" class="stargaze-line" id="line-belt-rigel"/>

          <line x1="250" y1="365" x2="350" y2="350" class="stargaze-line" id="line-feet"/>

          <!-- Sword hanging from Alnilam -->
          <line x1="300" y1="258" x2="297" y2="300" class="stargaze-line" stroke-dasharray="2 3" opacity="0.65" id="line-sword"/>

          <!-- Orion Nebula faint glow around sword -->
          <ellipse cx="297" cy="293" rx="18" ry="14" fill="url(#stargazeNebulaGlow)" class="orion-nebula" id="orion-nebula"/>

          <!-- STARS -->
          <!-- Meissa (Head) -->
          <circle cx="295" cy="145" r="1.6" fill="#fff" class="orion-star" id="star-meissa"/>

          <!-- Betelgeuse (Alpha Ori, orange-red supergiant) -->
          <circle cx="230" cy="180" r="2.4" fill="#ffaa66" class="orion-star" id="star-betelgeuse"/>
          <circle cx="230" cy="180" r="1.2" fill="#fff"/>

          <!-- Bellatrix (Gamma Ori, blue-white) -->
          <circle cx="360" cy="195" r="2.0" fill="#cbe2ff" class="orion-star" id="star-bellatrix"/>
          <circle cx="360" cy="195" r="1.0" fill="#fff"/>

          <!-- Belt Stars (Alnitak, Alnilam, Mintaka) -->
          <circle cx="275" cy="265" r="1.8" fill="#d2e6ff" class="orion-star" id="star-alnitak"/>
          <circle cx="300" cy="258" r="2.0" fill="#d2e6ff" class="orion-star" id="star-alnilam"/>
          <circle cx="325" cy="252" r="1.8" fill="#d2e6ff" class="orion-star" id="star-mintaka"/>

          <!-- Sword Stars -->
          <circle cx="298" cy="283" r="1.2" fill="#ffd5ea" opacity="0.8"/>
          <circle cx="297" cy="293" r="1.6" fill="#ffc2f0" class="orion-star" id="star-sword"/>
          <circle cx="296" cy="303" r="1.1" fill="#e0c8ff" opacity="0.75"/>

          <!-- Saiph (Kappa Ori) -->
          <circle cx="250" cy="365" r="2.0" fill="#cbe2ff" class="orion-star" id="star-saiph"/>

          <!-- Rigel (Beta Ori, brilliant blue-white supergiant) -->
          <circle cx="350" cy="350" r="2.6" fill="#aee0ff" class="orion-star" id="star-rigel"/>
          <circle cx="350" cy="350" r="1.3" fill="#ffffff"/>
        </g>

        <!-- The Grassy Hill Silhouette -->
        <path d="M-20,600 Q150,535 300,535 T620,580 L620,820 L-20,820 Z" fill="url(#stargazeHillGrad)"/>

        <!-- Ambient grass blades along crest -->
        <g stroke="#12182c" stroke-width="1.3" opacity="0.75">
          <line x1="160" y1="558" x2="157" y2="542"/>
          <line x1="164" y1="557" x2="167" y2="544"/>
          <line x1="205" y1="548" x2="207" y2="534"/>
          <line x1="210" y1="547" x2="215" y2="536"/>
          <line x1="395" y1="548" x2="393" y2="535"/>
          <line x1="400" y1="549" x2="404" y2="533"/>
          <line x1="435" y1="555" x2="433" y2="541"/>
          <line x1="439" y1="556" x2="443" y2="543"/>
        </g>

        <!-- Little Lantern Warm Glow on Hill -->
        <circle cx="415" cy="542" r="45" fill="url(#stargazeLanternGlow)"/>
        <rect x="412" y="534" width="7" height="10" rx="1.5" fill="#141824"/>
        <rect x="413.5" y="536.5" width="4" height="5" fill="#ffb45a" opacity="0.95"/>
        <path d="M413,534 Q415.5,530 418,534" stroke="#141824" stroke-width="1.2" fill="none"/>

        <!-- Two People Sitting Together Silhouette -->
        <g id="stargazers-couple" fill="#03050a">
          <!-- Blanket spread under them -->
          <ellipse cx="295" cy="552" rx="70" ry="10" fill="#020306" opacity="0.95"/>

          <!-- Left Figure (Tehrim): Sitting in profile, head tilted up gazing into stars -->
          <path d="M255,548 
                   C250,530 250,505 258,485 
                   C263,474 270,470 277,470 
                   C284,470 288,480 286,496 
                   C285,512 287,532 290,548 Z"/>
          <!-- Head -->
          <circle cx="272" cy="456" r="11"/>
          <!-- Hair bun / ponytail silhouette -->
          <circle cx="261" cy="454" r="6"/>
          <path d="M263,450 C267,460 268,472 272,480 C276,472 278,462 276,452 Z"/>
          <!-- Legs & Knees drawn up -->
          <path d="M245,548 C240,524 246,504 258,504 C265,504 266,520 260,548 Z"/>
          <ellipse cx="253" cy="545" rx="12" ry="5"/>

          <!-- Right Figure (Shams): Sitting close, shoulder touching, arm resting back, looking up -->
          <path d="M285,548 
                   C287,528 288,506 294,488 
                   C300,472 310,466 320,466 
                   C328,466 333,476 333,492 
                   C333,512 338,532 344,548 Z"/>
          <!-- Head looking up towards Orion -->
          <circle cx="316" cy="452" r="11.5"/>
          <!-- Back supporting arm resting back onto grass -->
          <path d="M328,488 C337,506 346,528 352,548" stroke="#03050a" stroke-width="7.5" stroke-linecap="round"/>
          <!-- Legs resting forward comfortably on the hill -->
          <path d="M295,548 C302,534 320,530 334,538 C340,542 340,548 328,548 Z"/>
        </g>
      </svg>

      <div class="stargaze-caption" id="stargaze-caption">
        look who finally stopped hiding ✦
      </div>
    `;
  }

  initScrollResistance() {
    if (!this.barrier) return;

    // Check if the user is near the bottom of the page
    const isAtBottom = () => {
      const scrollPos = window.scrollY + window.innerHeight;
      const totalHeight = document.documentElement.scrollHeight;
      return scrollPos >= totalHeight - 35;
    };

    // Touch event handlers (Mobile)
    const onTouchStart = (e) => {
      if (this.isUnlocked) return;
      if (isAtBottom()) {
        this.isPulling = true;
        this.startY = e.touches[0].clientY;
        this.currentPull = 0;
      }
    };

    const onTouchMove = (e) => {
      if (!this.isPulling || this.isUnlocked) return;

      const currentY = e.touches[0].clientY;
      const deltaY = this.startY - currentY; // positive when dragging upwards

      if (deltaY > 0) {
        // Apply elastic rubber-band curve
        this.currentPull = Math.min(100, Math.pow(deltaY, 0.75) * 1.5);
        this.updateBarrierUI(this.currentPull);

        if (this.currentPull >= this.snapThreshold) {
          this.isPulling = false;
          this.snapOpen();
        }
      } else {
        this.currentPull = 0;
        this.updateBarrierUI(0);
      }
    };

    const onTouchEnd = () => {
      if (this.isPulling && !this.isUnlocked) {
        this.isPulling = false;
        this.springBack();
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    // Wheel event handler (Desktop)
    const onWheel = (e) => {
      if (this.isUnlocked) return;
      if (isAtBottom() && e.deltaY > 0) {
        clearTimeout(this.decayTimer);
        this.currentPull += Math.min(18, e.deltaY * 0.2);
        this.updateBarrierUI(this.currentPull);

        if (this.currentPull >= this.snapThreshold) {
          this.snapOpen();
        } else {
          this.decayTimer = setTimeout(() => {
            this.springBack();
          }, 240);
        }
      }
    };

    window.addEventListener('wheel', onWheel, { passive: true });
  }

  updateBarrierUI(pull) {
    if (!this.threadEl || !this.iconEl) return;
    const threadHeight = 24 + pull * 0.7;
    this.threadEl.style.height = `${threadHeight}px`;

    const scale = 1 + (pull / this.snapThreshold) * 0.35;
    this.iconEl.style.transform = `scale(${scale})`;

    if (pull > 25 && this.hintEl) {
      this.hintEl.style.opacity = `${0.45 + (pull / this.snapThreshold) * 0.55}`;
      this.hintEl.style.color = '#ffc87a';
    }
  }

  springBack() {
    this.currentPull = 0;
    if (this.threadEl) {
      this.threadEl.style.transition = 'height 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      this.threadEl.style.height = '24px';
      setTimeout(() => {
        if (this.threadEl) this.threadEl.style.transition = 'height 0.08s ease-out';
      }, 360);
    }
    if (this.iconEl) {
      this.iconEl.style.transition = 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      this.iconEl.style.transform = 'scale(1)';
      setTimeout(() => {
        if (this.iconEl) this.iconEl.style.transition = 'transform 0.08s ease-out';
      }, 360);
    }
    if (this.hintEl) {
      this.hintEl.style.opacity = '0.45';
      this.hintEl.style.color = 'rgba(255, 255, 255, 0.45)';
    }
  }

  snapOpen() {
    if (this.isUnlocked) return;
    this.isUnlocked = true;

    // Optional haptic tap on mobile
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([18, 45, 25]); } catch (e) {}
    }

    // Reveal the section
    this.section.classList.remove('locked');
    this.section.classList.add('unlocked');

    // Fade out barrier indicator
    if (this.barrier) {
      this.barrier.style.transition = 'opacity 0.4s ease';
      this.barrier.style.opacity = '0';
      setTimeout(() => {
        if (this.barrier) this.barrier.classList.add('hidden-barrier');
      }, 420);
    }

    // Smoothly scroll down into the scene
    setTimeout(() => {
      this.section.scrollIntoView({ behavior: 'smooth' });
    }, 150);

    // Trigger Orion sequence after page settles
    setTimeout(() => {
      this.triggerReveal();
    }, 1700);
  }

  triggerReveal() {
    if (this.hasTriggeredReveal) return;
    this.hasTriggeredReveal = true;

    // 1. Orion stars brighten and pulse with colors
    const starBetelgeuse = document.getElementById('star-betelgeuse');
    const starRigel = document.getElementById('star-rigel');
    const starBellatrix = document.getElementById('star-bellatrix');
    const starAlnitak = document.getElementById('star-alnitak');
    const starAlnilam = document.getElementById('star-alnilam');
    const starMintaka = document.getElementById('star-mintaka');
    const starSaiph = document.getElementById('star-saiph');
    const starMeissa = document.getElementById('star-meissa');

    if (starBetelgeuse) starBetelgeuse.classList.add('active-amber');
    if (starRigel) starRigel.classList.add('active-blue');
    if (starBellatrix) starBellatrix.classList.add('active-blue');
    if (starAlnitak) starAlnitak.classList.add('active-blue');
    if (starAlnilam) starAlnilam.classList.add('active-blue');
    if (starMintaka) starMintaka.classList.add('active-blue');
    if (starSaiph) starSaiph.classList.add('active-blue');
    if (starMeissa) starMeissa.classList.add('active-white');

    // 2. Constellation lines draw
    setTimeout(() => {
      const lines = this.section.querySelectorAll('.stargaze-line');
      lines.forEach(line => line.classList.add('active'));

      const nebula = document.getElementById('orion-nebula');
      if (nebula) nebula.classList.add('active');
    }, 1100);

    // 3. Caption softly whispers in
    setTimeout(() => {
      const caption = document.getElementById('stargaze-caption');
      if (caption) caption.classList.add('active');
    }, 2800);
  }
}
