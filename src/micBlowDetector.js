/**
 * Microphone Blow / Breath Detection
 * Uses Web Audio API to detect a puff of breath on the phone's microphone.
 */
export class MicBlowDetector {
  constructor(onBlow) {
    this.onBlow = onBlow;
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.stream = null;
    this.isListening = false;
    this.hasTriggered = false;
    this.animId = null;
  }

  async start() {
    if (this.isListening || this.hasTriggered) return;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia not supported in this context (requires HTTPS or localhost).');
        return;
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: false
      });

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      
      // Resume if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3;

      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      this.isListening = true;
      this.detectLoop();
    } catch (err) {
      console.warn('Microphone permission not granted:', err);
    }
  }

  detectLoop() {
    if (!this.isListening || this.hasTriggered) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    let sustainedCount = 0;

    const check = () => {
      if (!this.isListening || this.hasTriggered) return;

      this.analyser.getByteFrequencyData(dataArray);

      // Blowing on the microphone creates high-energy broadband low-to-mid frequency turbulence (bins 0-35)
      let lowEnergy = 0;
      const checkBins = 35;
      for (let i = 0; i < checkBins; i++) {
        lowEnergy += dataArray[i];
      }
      const avgLow = lowEnergy / checkBins;

      // Threshold: 60-70 indicates a direct blow/puff into the mic
      if (avgLow > 58) {
        sustainedCount++;
        if (sustainedCount >= 3) {
          // Blow detected!
          this.hasTriggered = true;
          this.stop();
          if (this.onBlow) this.onBlow();
          return;
        }
      } else {
        sustainedCount = Math.max(0, sustainedCount - 1);
      }

      this.animId = requestAnimationFrame(check);
    };

    this.animId = requestAnimationFrame(check);
  }

  stop() {
    this.isListening = false;
    if (this.animId) cancelAnimationFrame(this.animId);
    if (this.microphone) {
      try { this.microphone.disconnect(); } catch (e) {}
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch (e) {}
    }
  }
}
