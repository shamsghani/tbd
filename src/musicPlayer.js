/**
 * Background Music Controller
 */
export class MusicPlayer {
  constructor(audioSrc) {
    this.audio = new Audio(audioSrc);
    this.audio.loop = true;
    this.audio.volume = 0.55;
    this.isPlaying = false;
    this.listeners = [];

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.notify();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.notify();
    });

    this.audio.addEventListener('timeupdate', () => {
      this.notify('timeupdate');
    });
  }

  toggle() {
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play().catch(err => {
        console.warn('Playback failed:', err);
      });
    }
  }

  play() {
    if (!this.isPlaying) {
      this.audio.play().catch(err => console.warn('Audio play restricted:', err));
    }
  }

  pause() {
    if (this.isPlaying) {
      this.audio.pause();
    }
  }

  setVolume(vol) {
    this.audio.volume = Math.max(0, Math.min(1, vol));
  }

  onChange(callback) {
    this.listeners.push(callback);
  }

  notify(event = 'state') {
    this.listeners.forEach(cb => cb(this, event));
  }
}

