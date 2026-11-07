let audioCtx = null;
let instrumentBuffer = null;
let beatBuffer = null;
let instrumentGain = null;
let beatGain = null;
let beatSource = null;
let midiAccess = null;
let activeNotes = new Map();
let selectedInput = null;

const $ = (id) => document.getElementById(id);
const midiStatus = $('midiStatus');
const playStatus = $('playStatus');

function setStatus(el, msg, kind='') {
  el.textContent = msg;
  el.className = 'status' + (kind ? ' ' + kind : '');
}
function ensureAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('This browser does not support Web Audio.');
    audioCtx = new AudioContextClass({latencyHint:'interactive'});
    instrumentGain = audioCtx.createGain();
    beatGain = audioCtx.createGain();
    instrumentGain.connect(audioCtx.destination);
    beatGain.connect(audioCtx.destination);
    updateVolumes();
  }
  if (audioCtx.state === 'suspended') return audioCtx.resume();
  return Promise.resolve();
}
function updateVolumes() {
  if (!audioCtx) return;
  instrumentGain.gain.setTargetAtTime(Number($('instVol').value)/100, audioCtx.currentTime, 0.015);
  beatGain.gain.setTargetAtTime(Number($('beatVol').value)/100, audioCtx.currentTime, 0.015);
}
$('audioBtn').addEventListener('click', async () => {
  try {
    await ensureAudio();
    setStatus(playStatus, 'Audio is ready. Load a WAV sample, then connect MIDI.', 'ok');
    $('audioBtn').textContent = 'Audio enabled ✓';
  } catch (e) { setStatus(playStatus, e.message, 'warn'); }
});

async function decodeFile(file) {
  await ensureAudio();
  const bytes = await file.arrayBuffer();
  return await audioCtx.decodeAudioData(bytes);
}
$('sampleFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    instrumentBuffer = await decodeFile(file);
    $('sampleStatus').textContent = `Loaded: ${file.name} · ${instrumentBuffer.duration.toFixed(2)} sec`;
    $('sampleStatus').className = 'status ok';
    $('testBtn').disabled = false;
    setStatus(playStatus, 'Instrument sample ready. Press a key on the Yamaha.', 'ok');
  } catch (err) { setStatus($('sampleStatus'), 'Could not read this audio file. Please use a WAV file.', 'warn'); }
});
$('beatFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    beatBuffer = await decodeFile(file);
    $('beatStatus').textContent = `Loaded: ${file.name} · ${beatBuffer.duration.toFixed(2)} sec`;
    $('beatStatus').className = 'status ok';
    $('playBeatBtn').disabled = false;
    $('stopBeatBtn').disabled = false;
  } catch (err) { setStatus($('beatStatus'), 'Could not read this audio file. Please use a WAV file.', 'warn'); }
});

function playMidiNote(note, velocity=100) {
  if (!audioCtx || !instrumentBuffer) {
    setStatus(playStatus, 'Load a WAV instrument sample first.', 'warn'); return;
  }
  stopMidiNote(note);
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  const root = Math.max(0, Math.min(127, Number($('rootNote').value) || 48));
  source.buffer = instrumentBuffer;
  source.playbackRate.value = Math.pow(2, (note-root)/12);
  gain.gain.value = Math.max(0.02, velocity/127);
  source.connect(gain);
  gain.connect(instrumentGain);
  const key = `${note}`;
  activeNotes.set(key, {source, gain});
  source.onended = () => { if (activeNotes.get(key)?.source === source) activeNotes.delete(key); };
  source.start();
  setStatus(playStatus, `Playing MIDI note ${note} · velocity ${velocity}`, 'ok');
}
function stopMidiNote(note) {
  const item = activeNotes.get(`${note}`);
  if (!item || !audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    item.gain.gain.cancelScheduledValues(now);
    item.gain.gain.setTargetAtTime(0, now, 0.025);
    item.source.stop(now + 0.12);
  } catch(e) {}
  activeNotes.delete(`${note}`);
}
function stopAllNotes() {
  [...activeNotes.keys()].forEach(k => stopMidiNote(Number(k)));
}
function handleMidiMessage(event) {
  const [status, data1, data2] = event.data;
  const command = status & 0xF0;
  if (command === 0x90 && data2 > 0) playMidiNote(data1, data2);
  else if (command === 0x80 || (command === 0x90 && data2 === 0)) stopMidiNote(data1);
}
function attachInput(input) {
  if (selectedInput) selectedInput.onmidimessage = null;
  selectedInput = input || null;
  if (selectedInput) selectedInput.onmidimessage = handleMidiMessage;
  if (selectedInput) {
    $('midiBadge').textContent = 'MIDI connected';
    setStatus(midiStatus, `Connected to ${selectedInput.name || 'MIDI keyboard'}. Play a key.`, 'ok');
  } else {
    $('midiBadge').textContent = 'MIDI not connected';
    setStatus(midiStatus, 'No MIDI input selected.', 'warn');
  }
}
function refreshInputs() {
  const select = $('midiInputs');
  const previous = select.value;
  select.innerHTML = '';
  const inputs = midiAccess ? [...midiAccess.inputs.values()] : [];
  if (!inputs.length) {
    select.add(new Option('No MIDI input found', ''));
    attachInput(null); return;
  }
  inputs.forEach(input => select.add(new Option(`${input.name || 'MIDI input'}${input.manufacturer ? ' · '+input.manufacturer : ''}`, input.id)));
  const chosen = inputs.find(i => i.id === previous) || inputs[0];
  select.value = chosen.id;
  attachInput(chosen);
}
$('midiBtn').addEventListener('click', async () => {
  try {
    await ensureAudio();
    if (!navigator.requestMIDIAccess) {
      setStatus(midiStatus, 'Web MIDI is not available in this browser. Try the latest Google Chrome on Android.', 'warn'); return;
    }
    midiAccess = await navigator.requestMIDIAccess({sysex:false});
    refreshInputs();
    midiAccess.onstatechange = refreshInputs;
    if (!midiAccess.inputs.size) setStatus(midiStatus, 'MIDI permission granted, but no keyboard was detected. Check the OTG connection and reconnect.', 'warn');
  } catch (e) {
    setStatus(midiStatus, `Could not connect MIDI: ${e.message || e}. Check browser permission and USB connection.`, 'warn');
  }
});
$('midiInputs').addEventListener('change', () => {
  const input = [...(midiAccess?.inputs.values() || [])].find(i => i.id === $('midiInputs').value);
  attachInput(input);
});
$('testBtn').addEventListener('click', () => playMidiNote(Number($('rootNote').value) || 48, 100));
$('stopNotesBtn').addEventListener('click', stopAllNotes);

function stopBeat() {
  if (beatSource) {
    try { beatSource.stop(); } catch(e) {}
    beatSource = null;
  }
}
$('playBeatBtn').addEventListener('click', async () => {
  if (!beatBuffer) return;
  await ensureAudio(); stopBeat();
  beatSource = audioCtx.createBufferSource();
  beatSource.buffer = beatBuffer;
  beatSource.loop = $('loopBeat').checked;
  beatSource.connect(beatGain);
  beatSource.onended = () => { beatSource = null; };
  beatSource.start();
  setStatus($('beatStatus'), `Playing beat${beatSource.loop ? ' · loop enabled' : ''}.`, 'ok');
});
$('stopBeatBtn').addEventListener('click', () => { stopBeat(); setStatus($('beatStatus'), 'Beat stopped.'); });
$('instVol').addEventListener('input', () => { $('instVolText').textContent = $('instVol').value+'%'; updateVolumes(); });
$('beatVol').addEventListener('input', () => { $('beatVolText').textContent = $('beatVol').value+'%'; updateVolumes(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
