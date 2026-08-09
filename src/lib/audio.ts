import { sound } from '../utils/sound';

class AudioManager {
  get enabled() {
    return sound.enabled;
  }
  set enabled(val: boolean) {
    sound.setEnabled(val);
  }

  playPop() { sound.playClick(); }
  playClick() { sound.playClick(); }
  playSwoosh() { sound.playSwoosh(); }
  playChime() { sound.playChime(); }
  playSuccess() { sound.playSuccess(); }
  playError() { sound.playError(); }
  playDigitalTick() { sound.playClick(); }
  playSubtleTap() { sound.playClick(); }
  playHologramOpen() { sound.playSwoosh(); }
}

export const audioManager = new AudioManager();
