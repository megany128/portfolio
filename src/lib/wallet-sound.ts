/*
 * Audio cues for the wallet-transition animation on onboarding submit.
 *
 *   playSlotIn() — fires as the hero card lands in the lineup. Short and
 *                  percussive: low sine thump + filtered noise "click",
 *                  ~220ms total. The goal is a tactile "card snapped into
 *                  place" feel, not a drumroll.
 *
 *   playWhoosh() — fires as the whole row of cards whooshes off the left of
 *                  the viewport. Filtered pink noise with a descending
 *                  bandpass sweep, ~550ms. Supports the motion without
 *                  sounding like a video-game sfx.
 *
 * Both cues assume the AudioContext is allowed to run because this module is
 * only called from inside user-initiated flows (clicking the Enter button is
 * the gesture). If the context happens to be suspended, we attempt to resume
 * it and drop the cue silently if that fails — a silent transition is better
 * than a jarring late-fire.
 */

let ctx: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") {
    // Fire-and-forget resume; if the browser rejects, the next play() just
    // won't be audible — the animation still completes fine.
    void ctx.resume().catch(() => {});
  }
  return ctx;
}

/**
 * Warm up the AudioContext on the submit click so it's in the "running"
 * state by the time the wallet animation fires its cues ~1-2s later. Without
 * this prime, the first `.playSlotIn()` call can arrive while the context
 * is still transitioning out of "suspended" and silently drop its cue.
 */
export function primeAudio(): void {
  ensureContext();
}

/** Pink-noise approximation (Voss-McCartney). Pink sits nicer for whooshes
 *  than white noise — less icepick-y at the top end. */
function makeNoiseBuffer(audio: AudioContext, durationSec: number): AudioBuffer {
  const sr = audio.sampleRate;
  const len = Math.floor(sr * durationSec);
  const buf = audio.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
  }
  return buf;
}

export function playSlotIn(): void {
  const audio = ensureContext();
  if (!audio) return;
  // If still suspended, the resume() kicked in ensureContext may not have
  // finished yet. Schedule against the current time regardless — by the time
  // OS audio actually reads the schedule, the state will have flipped. If it
  // doesn't, nothing worse than silence.
  const now = audio.currentTime;

  const master = audio.createGain();
  master.gain.value = 0.65;
  master.connect(audio.destination);

  // Friction sweep: short pink-noise burst with bandpass sliding down from
  // ~5kHz to ~1.5kHz. Reads as a card sliding into place, not a drum hit.
  const slide = audio.createBufferSource();
  slide.buffer = makeNoiseBuffer(audio, 0.11);

  const slideBp = audio.createBiquadFilter();
  slideBp.type = "bandpass";
  slideBp.frequency.setValueAtTime(5200, now);
  slideBp.frequency.exponentialRampToValueAtTime(1600, now + 0.09);
  slideBp.Q.value = 3.5;

  const slideGain = audio.createGain();
  slideGain.gain.setValueAtTime(0, now);
  slideGain.gain.linearRampToValueAtTime(0.55, now + 0.008);
  slideGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  slide.connect(slideBp).connect(slideGain).connect(master);
  slide.start(now);
  slide.stop(now + 0.12);

  // Contact tap: a tighter bandpassed noise tick right after the slide,
  // like the card bumping the back of the slot. Higher + shorter than the
  // slide so it reads as the "stop" rather than a bass thud.
  const tap = audio.createBufferSource();
  tap.buffer = makeNoiseBuffer(audio, 0.04);

  const tapBp = audio.createBiquadFilter();
  tapBp.type = "bandpass";
  tapBp.frequency.value = 3400;
  tapBp.Q.value = 5;

  const tapGain = audio.createGain();
  const tapStart = now + 0.055;
  tapGain.gain.setValueAtTime(0, tapStart);
  tapGain.gain.linearRampToValueAtTime(0.6, tapStart + 0.003);
  tapGain.gain.exponentialRampToValueAtTime(0.001, tapStart + 0.035);

  tap.connect(tapBp).connect(tapGain).connect(master);
  tap.start(tapStart);
  tap.stop(tapStart + 0.05);
}

export function playWhoosh(): void {
  const audio = ensureContext();
  if (!audio) return;
  const now = audio.currentTime;

  const master = audio.createGain();
  master.gain.value = 0.26;
  master.connect(audio.destination);

  const noise = audio.createBufferSource();
  noise.buffer = makeNoiseBuffer(audio, 0.7);

  // Bandpass sweeping from bright to mid — evokes movement past the ear.
  const bp = audio.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(3200, now);
  bp.frequency.exponentialRampToValueAtTime(480, now + 0.55);
  bp.Q.value = 1.8;

  // Highshelf cut so the loudest moment isn't hissy.
  const hs = audio.createBiquadFilter();
  hs.type = "highshelf";
  hs.frequency.value = 5000;
  hs.gain.value = -8;

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.42, now + 0.14);
  gain.gain.setValueAtTime(0.42, now + 0.32);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);

  noise.connect(bp).connect(hs).connect(gain).connect(master);
  noise.start(now);
  noise.stop(now + 0.7);
}
