/*
 * Web-Audio "sunrise" — a welcome chord that rides the cream spotlight
 * expanding on the onboarding scene. The feel we're after is symphonic but
 * not orchestral: layered woodwind, string, and choir synth pads stacking a
 * warm G-major voicing, plus a reverb-soaked "slot-in" chime for forward
 * momentum.
 *
 *   voices
 *     ├── strings  — sawtooths per note, two detuned voices each, low-passed
 *     ├── woodwind — triangle pair up high, highpass lets it sit on top
 *     ├── choir    — sines with vibrato + chorus, bandpass for airy vowel
 *     └── chime    — quick bell, heavy reverb send, slight detune shimmer
 *
 *   chain
 *     each voice bus → master (dry) + short-tail convolver → master (wet)
 *
 * The AudioContext has to live in the same document as the visual sunrise;
 * creating it on welcome and navigating away used to tear it down before any
 * sound made it out. playSunrise() is therefore called from onboarding's
 * inline script, with a gesture fallback for browsers that drop sticky user
 * activation across the link click.
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
  return ctx;
}

/**
 * Build a short synthetic impulse-response reverb — cheap to allocate, gives
 * the chime a hall-ish tail without shipping an IR file.
 */
function makeReverb(audio: AudioContext, seconds = 2.4, decay = 3.2): ConvolverNode {
  const sr = audio.sampleRate;
  const length = Math.floor(sr * seconds);
  const impulse = audio.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  const conv = audio.createConvolver();
  conv.buffer = impulse;
  return conv;
}

function schedule(audio: AudioContext) {
  const now = audio.currentTime;

  const master = audio.createGain();
  master.gain.value = 0.55;
  master.connect(audio.destination);

  const reverb = makeReverb(audio);
  const reverbReturn = audio.createGain();
  reverbReturn.gain.value = 0.55;
  reverb.connect(reverbReturn).connect(master);

  // G-major voicing spread across three octaves. Everything below tones
  // these into layers with different attack/spectrum choices so the pads
  // blend without muddying the midrange.
  const G3 = 196.0;
  const D4 = 293.66;
  const G4 = 392.0;
  const B4 = 493.88;
  const D5 = 587.33;
  const G5 = 783.99;
  const D6 = 1174.66;

  // Helper: per-bus dry + wet sends keep the mixing graph tidy.
  function sendTo(bus: GainNode, sendAmount: number) {
    const send = audio.createGain();
    send.gain.value = sendAmount;
    bus.connect(send).connect(reverb);
  }

  // ---------- Strings pad (sawtooth + detune + LP) ------------------------
  // Slightly detuned sawtooth voices give the body of an ensemble without
  // sounding like a real violin section — low-pass keeps the top edge soft.
  {
    const bus = audio.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(0.085, now + 0.7);
    bus.gain.setValueAtTime(0.085, now + 1.6);
    bus.gain.exponentialRampToValueAtTime(0.001, now + 3.2);

    const lp = audio.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1500;
    lp.Q.value = 0.6;
    lp.connect(bus);

    [G3, D4, G4].forEach((f) => {
      [-7, 7].forEach((cents) => {
        const o = audio.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.detune.value = cents;
        o.connect(lp);
        o.start(now);
        o.stop(now + 3.4);
      });
    });

    bus.connect(master);
    sendTo(bus, 0.3);
  }

  // ---------- Woodwind pad (triangle pair, highpass) ----------------------
  // Triangles land in the upper mid; a highpass trims the bottom so it
  // doesn't fight the strings. Slightly delayed entrance gives the chord
  // an "open and breathe" feeling.
  {
    const bus = audio.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(0.075, now + 0.9);
    bus.gain.setValueAtTime(0.075, now + 1.7);
    bus.gain.exponentialRampToValueAtTime(0.001, now + 3.0);

    const hp = audio.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 320;
    hp.Q.value = 0.5;
    hp.connect(bus);

    [B4, D5].forEach((f) => {
      const o = audio.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.connect(hp);
      o.start(now + 0.15);
      o.stop(now + 3.2);
    });

    bus.connect(master);
    sendTo(bus, 0.4);
  }

  // ---------- Choir pad (sines + vibrato + chorus detune, bandpass) -------
  // Three detuned sine voices per note produces a vowel-ish shimmer; a
  // shared slow LFO adds the vibrato you'd get from a real choir's slight
  // wobble. Bandpass focuses the "ahh" formant.
  {
    const bus = audio.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(0.06, now + 1.0);
    bus.gain.setValueAtTime(0.06, now + 1.8);
    bus.gain.exponentialRampToValueAtTime(0.001, now + 3.2);

    const bp = audio.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 950;
    bp.Q.value = 0.55;
    bp.connect(bus);

    const lfo = audio.createOscillator();
    lfo.frequency.value = 4.5;
    const lfoGain = audio.createGain();
    lfoGain.gain.value = 4; // cents of detune swing
    lfo.connect(lfoGain);
    lfo.start(now + 0.2);
    lfo.stop(now + 3.2);

    [G4, B4, D5, G5].forEach((f) => {
      [-10, 0, 10].forEach((d) => {
        const o = audio.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.detune.value = d;
        lfoGain.connect(o.detune);
        o.connect(bp);
        o.start(now + 0.2);
        o.stop(now + 3.2);
      });
    });

    bus.connect(master);
    sendTo(bus, 0.55);
  }

  // ---------- Chime — reverb-soaked "slot-in" ----------------------------
  // Short bell on G5 with a shimmer partial on D6; heavy wet send gives it
  // a long tail over the pads, a little pulled-back dry so it blooms
  // through the reverb rather than sitting on top.
  {
    const chimeStart = now + 0.75;
    const chimeBus = audio.createGain();
    chimeBus.gain.value = 0.55;

    [G5, D6].forEach((f, i) => {
      const o = audio.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = i === 0 ? 0 : 4; // tiny detune on partial = shimmer

      const g = audio.createGain();
      const amp = i === 0 ? 0.32 : 0.18;
      g.gain.setValueAtTime(0, chimeStart);
      g.gain.linearRampToValueAtTime(amp, chimeStart + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, chimeStart + 1.4);

      o.connect(g).connect(chimeBus);
      o.start(chimeStart);
      o.stop(chimeStart + 1.5);
    });

    // Dry: quiet, so the chime feels "in" the space.
    const dry = audio.createGain();
    dry.gain.value = 0.4;
    chimeBus.connect(dry).connect(master);

    // Wet: generous — this is what gives it the "forward momentum" tail.
    sendTo(chimeBus, 1.15);
  }
}

// Once per page: guards against the caller's "try now, then also on next
// gesture" pattern ending up scheduling the chord twice if the async resume
// succeeds after the eager attempt.
let hasPlayed = false;

/**
 * Play the sunrise chord. Returns true if we were able to start (or at least
 * kick off the async resume that will start it). Returns false if the
 * AudioContext is still suspended after attempting to resume — the caller
 * should listen for the next real user gesture and try again.
 */
export function playSunrise(): boolean {
  if (hasPlayed) return true;
  const audio = ensureContext();
  if (!audio) return false;

  if (audio.state === "running") {
    hasPlayed = true;
    schedule(audio);
    return true;
  }

  // resume() may resolve asynchronously. If this call is happening inside a
  // user gesture (or the browser is granting sticky activation from the
  // navigating click) the promise will flip us to "running" in the next
  // microtask and we schedule there. If the browser refuses, the caller's
  // gesture fallback will call us again.
  hasPlayed = true;
  audio
    .resume()
    .then(() => {
      if (audio.state === "running") {
        schedule(audio);
      } else {
        hasPlayed = false;
      }
    })
    .catch(() => {
      hasPlayed = false;
    });

  return false;
}

/**
 * Reset the play guard so a subsequent {@link playSunrise} call will schedule
 * the chord again. Useful when the user navigates back to welcome and then
 * re-enters — the second entry should feel just as alive as the first.
 */
export function resetSunrise(): void {
  hasPlayed = false;
}
