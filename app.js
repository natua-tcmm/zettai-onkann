const WHITE_NOTES = [
  { name: "A3", midi: 57 },
  { name: "B3", midi: 59 },
  { name: "C4", midi: 60 },
  { name: "D4", midi: 62 },
  { name: "E4", midi: 64 },
  { name: "F4", midi: 65 },
  { name: "G4", midi: 67 },
  { name: "A4", midi: 69 },
  { name: "B4", midi: 71 },
  { name: "C5", midi: 72 },
  { name: "D5", midi: 74 },
  { name: "E5", midi: 76 },
  { name: "F5", midi: 77 },
  { name: "G5", midi: 79 },
  { name: "A5", midi: 81 },
];

const SLIDER_MAX = 1000;
const SEMITONE_RATIO = 2 ** (1 / 12);
const RANGE_SEMITONES = 0.75;
const PLOT_LIMIT_CENTS = 100;
const EDGE_GUARD = 0.1;

const state = {
  index: 0,
  questionOrder: [],
  trials: [],
  currentRange: null,
  audioContext: null,
  oscillator: null,
  gain: null,
  isPlaying: false,
};

const els = {
  quizView: document.querySelector("#quizView"),
  resultView: document.querySelector("#resultView"),
  noteName: document.querySelector("#noteName"),
  progressText: document.querySelector("#progressText"),
  progressFill: document.querySelector("#progressFill"),
  toggleSound: document.querySelector("#toggleSound"),
  slider: document.querySelector("#frequencySlider"),
  answerButton: document.querySelector("#answerButton"),
  restartButton: document.querySelector("#restartButton"),
  audioStatus: document.querySelector("#audioStatus"),
  averageCents: document.querySelector("#averageCents"),
  maxCents: document.querySelector("#maxCents"),
  resultTable: document.querySelector("#resultTable"),
  plot: document.querySelector("#resultPlot"),
};

function frequencyFromMidi(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function centsBetween(actual, expected) {
  return 1200 * Math.log2(actual / expected);
}

function shuffledNotes() {
  const notes = [...WHITE_NOTES];

  for (let index = notes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [notes[index], notes[swapIndex]] = [notes[swapIndex], notes[index]];
  }

  return notes;
}

function sortedTrials() {
  return [...state.trials].sort((a, b) => a.midi - b.midi);
}

function noteRange(targetFrequency) {
  const rangeRatio = SEMITONE_RATIO ** RANGE_SEMITONES;
  const rangeDown = targetFrequency / rangeRatio;
  const rangeUp = targetFrequency * rangeRatio;
  const span = rangeUp - rangeDown;
  const targetRatio = EDGE_GUARD + Math.random() * (1 - EDGE_GUARD * 2);
  const min = targetFrequency - span * targetRatio;
  const max = min + span;

  return { min, max };
}

function sliderToFrequency(value) {
  const range = state.currentRange;
  const ratio = Number(value) / SLIDER_MAX;
  return range.min + (range.max - range.min) * ratio;
}

function setOscillatorFrequency() {
  if (!state.oscillator) return;
  const frequency = sliderToFrequency(els.slider.value);
  state.oscillator.frequency.setTargetAtTime(frequency, state.audioContext.currentTime, 0.01);
}

function createAudioContext() {
  if (!state.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("AudioContext is not available.");
    }
    state.audioContext = new AudioContextClass();
  }
  return state.audioContext;
}

async function startSound() {
  const audioContext = createAudioContext();
  await audioContext.resume();
  els.audioStatus.textContent = "";

  stopSound(false);

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = sliderToFrequency(els.slider.value);
  gain.gain.setValueAtTime(0, audioContext.currentTime);
  gain.gain.linearRampToValueAtTime(0.18, audioContext.currentTime + 0.03);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();

  state.oscillator = oscillator;
  state.gain = gain;
  state.isPlaying = true;
  updateSoundButton();
}

function stopSound(updateButton = true) {
  if (state.oscillator && state.audioContext) {
    const now = state.audioContext.currentTime;
    state.gain.gain.cancelScheduledValues(now);
    state.gain.gain.setTargetAtTime(0, now, 0.015);
    state.oscillator.stop(now + 0.08);
  }

  state.oscillator = null;
  state.gain = null;
  state.isPlaying = false;

  if (updateButton) updateSoundButton();
}

function updateSoundButton() {
  els.toggleSound.textContent = state.isPlaying ? "停止" : "再生";
  els.toggleSound.classList.toggle("is-playing", state.isPlaying);
}

function setupTrial() {
  stopSound();

  const note = state.questionOrder[state.index];
  const targetFrequency = frequencyFromMidi(note.midi);
  state.currentRange = noteRange(targetFrequency);

  els.noteName.textContent = note.name;
  els.progressText.textContent = `${state.index + 1} / ${WHITE_NOTES.length}`;
  els.progressFill.style.width = `${(state.index / WHITE_NOTES.length) * 100}%`;
  els.slider.value = SLIDER_MAX / 2;
}

function submitAnswer() {
  const note = state.questionOrder[state.index];
  const targetFrequency = frequencyFromMidi(note.midi);
  const answerFrequency = sliderToFrequency(els.slider.value);

  state.trials.push({
    name: note.name,
    midi: note.midi,
    targetFrequency,
    answerFrequency,
    cents: centsBetween(answerFrequency, targetFrequency),
  });

  state.index += 1;

  if (state.index >= WHITE_NOTES.length) {
    showResults();
    return;
  }

  setupTrial();
}

function showResults() {
  stopSound();
  els.quizView.hidden = true;
  els.resultView.hidden = false;
  els.progressFill.style.width = "100%";

  renderSummary();
  renderTable();
  renderPlot();
}

function renderSummary() {
  const absCents = state.trials.map((trial) => Math.abs(trial.cents));
  const average = absCents.reduce((sum, value) => sum + value, 0) / absCents.length;
  const max = Math.max(...absCents);

  els.averageCents.textContent = `${average.toFixed(1)} cents`;
  els.maxCents.textContent = `${max.toFixed(1)} cents`;
}

function renderTable() {
  els.resultTable.innerHTML = sortedTrials()
    .map((trial) => {
      const sign = trial.cents > 0 ? "+" : "";
      return `
        <tr>
          <td>${trial.name}</td>
          <td>${trial.targetFrequency.toFixed(2)} Hz</td>
          <td>${trial.answerFrequency.toFixed(2)} Hz</td>
          <td>${sign}${trial.cents.toFixed(1)} cents</td>
        </tr>
      `;
    })
    .join("");
}

function nonlinearY(cents, top, height) {
  const clamped = Math.max(-PLOT_LIMIT_CENTS, Math.min(PLOT_LIMIT_CENTS, cents));
  const normalized = Math.sign(clamped) * Math.sqrt(Math.abs(clamped) / PLOT_LIMIT_CENTS);
  return top + height / 2 - normalized * (height / 2);
}

function renderPlot() {
  const canvas = els.plot;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 980;
  const cssHeight = Math.max(300, Math.round(cssWidth * 0.43));

  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const left = 58;
  const right = 20;
  const top = 22;
  const bottom = 48;
  const width = cssWidth - left - right;
  const height = cssHeight - top - bottom;
  const trials = sortedTrials();
  const xStep = width / (trials.length - 1);

  ctx.strokeStyle = "#d9ded7";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#66736c";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  [-100, -50, 0, 50, 100].forEach((tick) => {
    const y = nonlinearY(tick, top, height);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(cssWidth - right, y);
    ctx.stroke();
    ctx.fillText(`${tick > 0 ? "+" : ""}${tick}`, left - 10, y);
  });

  ctx.strokeStyle = "#17201b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  trials.forEach((trial, index) => {
    const x = left + xStep * index;
    const y = nonlinearY(trial.cents, top, height);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  trials.forEach((trial, index) => {
    const x = left + xStep * index;
    const y = nonlinearY(trial.cents, top, height);
    ctx.fillStyle = Math.abs(trial.cents) > 25 ? "#b85f33" : "#2f7f6f";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, cssHeight - 18);
    ctx.rotate(-Math.PI / 5);
    ctx.fillStyle = "#66736c";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(trial.name, 0, 0);
    ctx.restore();
  });

  ctx.fillStyle = "#66736c";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("cents", 10, top - 6);
}

function restart() {
  stopSound();
  state.index = 0;
  state.questionOrder = shuffledNotes();
  state.trials = [];
  els.resultView.hidden = true;
  els.quizView.hidden = false;
  setupTrial();
}

els.toggleSound.addEventListener("click", () => {
  if (state.isPlaying) {
    stopSound();
  } else {
    startSound().catch(() => {
      stopSound();
      els.audioStatus.textContent = "このブラウザでは音声を再生できません。";
    });
  }
});

els.slider.addEventListener("input", setOscillatorFrequency);
els.answerButton.addEventListener("click", submitAnswer);
els.restartButton.addEventListener("click", restart);
window.addEventListener("resize", () => {
  if (!els.resultView.hidden) renderPlot();
});

state.questionOrder = shuffledNotes();
setupTrial();
