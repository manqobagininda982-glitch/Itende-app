(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const config = window.BRATEE_CONFIG || { demoMode: true, supabaseUrl: '', supabaseAnonKey: '' };
const CACHE_NAME = 'bratee-itende-beats-v2';
const APP_VERSION = '2.0.0';
let audioCtx = null, instrumentGain = null, beatGain = null, instrumentSamples = [];
let midiAccess = null, selectedMidi = null, activeNotes = new Map();
let beatIndex = [], selectedGroup = null, decodedLoops = new Map(), beatSource = null, beatSourceGain = null;
let currentLoop = 0, beatPlaying = false, supabaseClient = null, currentSession = null, demoSession = false;
const hasSupabaseConfig = !!(config.supabaseUrl && config.supabaseAnonKey && !String(config.supabaseUrl).includes('YOUR_') && !String(config.supabaseAnonKey).includes('YOUR_'));

function status(el, message, kind='') { if (!el) return; el.textContent = message; el.className = 'status' + (kind ? ' ' + kind : ''); }
function setVisible(el, visible) { el.classList.toggle('hidden', !visible); }
function cacheUrl(path) { return new URL('/__bratee_beats__/' + path.replace(/^\/+/, ''), location.origin).href; }
function storageCache() { return caches.open(CACHE_NAME); }
function totalLoops() { return beatIndex.reduce((n,g) => n + g.loops.length, 0); }
function configureAuth() {
  if (hasSupabaseConfig && window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  }
  $('demoArea').classList.toggle('hidden', !config.demoMode);
}
function showLoginTab(register=false) {
  setVisible($('loginForm'), !register); setVisible($('registerForm'), register);
  $('showLogin').classList.toggle('active', !register); $('showRegister').classList.toggle('active', register);
  $('showLogin').classList.toggle('secondary', register); $('showRegister').classList.toggle('secondary', !register);
}
function showAuth(message='Please sign in or register.') {
  setVisible($('authView'), true); setVisible($('licenseView'), false); setVisible($('studioView'), false);
  $('accountPill').textContent = 'Not signed in'; setVisible($('logoutBtn'), false);
  status($('authMessage'), message);
}
function showLicense(message='Your account needs an active licence.') {
  setVisible($('authView'), false); setVisible($('licenseView'), true); setVisible($('studioView'), false);
  $('accountPill').textContent = currentSession?.user?.email || 'Account'; setVisible($('logoutBtn'), true);
  status($('licenseMessage'), message);
}
function showStudio(label) {
  setVisible($('authView'), false); setVisible($('licenseView'), false); setVisible($('studioView'), true);
  $('accountPill').textContent = label || (demoSession ? 'Development preview' : currentSession?.user?.email || 'Licensed');
  setVisible($('logoutBtn'), !demoSession);
  loadBeatIndex().then(refreshBeatUi).catch(err => status($('beatStatus'), 'Could not load beat index: ' + err.message, 'bad'));
}
async function tryLandscapeLock() {
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (_) { /* browsers may only allow this in an installed fullscreen PWA */ }
}

// ---- Authentication and licence gate ----
async function apiCall(path, body) {
  if (!currentSession?.access_token) throw new Error('Please sign in again.');
  const response = await fetch(path, {method: 'POST', headers: {'Content-Type':'application/json','Authorization':'Bearer ' + currentSession.access_token}, body: JSON.stringify(body || {})});
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The server could not complete this request.');
  return result;
}
async function checkLicence() {
  if (!supabaseClient || !currentSession) { showAuth('Set up Supabase before using real accounts.'); return; }
  try {
    const data = await apiCall('/api/license/status', {});
    if (data.active) showStudio(currentSession.user.email + ' · Licensed');
    else showLicense('Account created. Enter your R100 licence key to unlock the studio.');
  } catch (error) { showLicense('Licence check failed: ' + error.message); }
}
async function activateLicence(key) {
  const clean = String(key || '').trim().toUpperCase();
  if (!clean) throw new Error('Enter your licence key.');
  const result = await apiCall('/api/license/activate', {key: clean});
  return result;
}
$('showLogin').addEventListener('click', () => showLoginTab(false));
$('showRegister').addEventListener('click', () => showLoginTab(true));
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); if (!supabaseClient) { status($('authMessage'), 'Real accounts are not configured yet. Use development preview, or connect Supabase in config.js.', 'warn'); return; }
  const button=e.submitter; button.disabled=true;
  try {
    const {data,error}=await supabaseClient.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});
    if(error) throw error; currentSession=data.session;
    const pendingKey=sessionStorage.getItem('bratee_pending_licence');
    if(pendingKey){await activateLicence(pendingKey);sessionStorage.removeItem('bratee_pending_licence');}
    await checkLicence();
  } catch(err) { status($('authMessage'), err.message, 'bad'); }
  finally { button.disabled=false; }
});
$('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault(); if (!supabaseClient) { status($('authMessage'), 'Registration needs a Supabase project. Set it up before enabling paid accounts.', 'warn'); return; }
  const button=e.submitter; button.disabled=true;
  try {
    const key=$('registerKey').value.trim().toUpperCase();
    const {data,error}=await supabaseClient.auth.signUp({email:$('registerEmail').value.trim(),password:$('registerPassword').value,options:{emailRedirectTo:location.origin}});
    if(error) throw error;
    if(data.session){ currentSession=data.session; await activateLicence(key); await checkLicence(); }
    else { sessionStorage.setItem('bratee_pending_licence',key); showLoginTab(false); status($('authMessage'),'Account created. Check your email to verify it, then sign in and activate the licence key you entered.','ok'); }
  } catch(err) { status($('authMessage'), err.message, 'bad'); }
  finally { button.disabled=false; }
});
$('activateForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const button=e.submitter; button.disabled=true;
  try { await activateLicence($('activateKey').value); $('activateKey').value=''; await checkLicence(); }
  catch(err) { status($('licenseMessage'), err.message, 'bad'); }
  finally { button.disabled=false; }
});
async function signOut() {
  try { if (supabaseClient) await supabaseClient.auth.signOut(); } catch (_) {}
  currentSession=null; demoSession=false; stopAllNotes(); stopBeat(); showAuth('You have signed out.');
}
$('logoutBtn').addEventListener('click', signOut); $('licenseLogoutBtn').addEventListener('click', signOut);
$('demoBtn').addEventListener('click', async () => { if (!config.demoMode) return; demoSession=true; await tryLandscapeLock(); showStudio('Development preview'); });
async function initAuth() {
  configureAuth();
  if (!supabaseClient) { showAuth(hasSupabaseConfig ? 'Supabase library did not load. Check your connection.' : 'Real login and licence checking are not configured yet. Development preview is available.'); return; }
  const {data:{session}}=await supabaseClient.auth.getSession();
  if (session) { currentSession=session; await checkLicence(); } else showAuth('Sign in or register with an active licence.');
  supabaseClient.auth.onAuthStateChange(async (event,sessionNow) => {
    if (event === 'SIGNED_OUT') { currentSession=null; showAuth('You have signed out.'); return; }
    if (event === 'SIGNED_IN' && sessionNow && !currentSession) { currentSession=sessionNow; const pending=sessionStorage.getItem('bratee_pending_licence'); if(pending){try{await activateLicence(pending);sessionStorage.removeItem('bratee_pending_licence');}catch(err){showLicense(err.message);return;}} await checkLicence(); }
  });
}

// ---- Audio engine ----
async function ensureAudio() {
  if (!audioCtx) {
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass) throw new Error('Web Audio is not supported in this browser.');
    audioCtx=new AudioContextClass({latencyHint:'interactive'});
    instrumentGain=audioCtx.createGain(); beatGain=audioCtx.createGain();
    instrumentGain.connect(audioCtx.destination); beatGain.connect(audioCtx.destination); updateVolumes();
  }
  if(audioCtx.state==='suspended') await audioCtx.resume();
  const base=Number.isFinite(audioCtx.baseLatency)?Math.round(audioCtx.baseLatency*1000):null;
  const output=Number.isFinite(audioCtx.outputLatency)?Math.round(audioCtx.outputLatency*1000):null;
  $('latencyStatus').textContent='Audio running · reported base latency: '+(base===null?'not exposed':base+' ms')+' · output latency: '+(output===null?'not exposed':output+' ms')+'. Actual speaker delay may be higher.';
  return audioCtx;
}
function updateVolumes() {
  if(!audioCtx)return;
  instrumentGain.gain.setTargetAtTime(Number($('toneVolume').value)/100,audioCtx.currentTime,.012);
  beatGain.gain.setTargetAtTime(Number($('beatVolume').value)/100,audioCtx.currentTime,.012);
}
$('audioBtn').addEventListener('click', async () => {
  try { await ensureAudio(); await tryLandscapeLock(); $('audioBtn').textContent='Audio enabled ✓'; status($('midiStatus'),'Audio is ready. Connect the Yamaha MIDI input.','ok'); }
  catch(e) { status($('midiStatus'),e.message,'bad'); }
});
function parseRootNoteFromName(fileName){
  const match=String(fileName).match(/(?:^|[^A-Ga-g])([A-Ga-g])([#b]?)(-?\d+)(?=\.[^.]+$|$)/);
  if(!match)return null;
  const names={C:0,D:2,E:4,F:5,G:7,A:9,B:11};let semi=names[match[1].toUpperCase()];
  if(match[2]==='#')semi+=1;else if(match[2]==='b')semi-=1;
  const octave=Number(match[3]);const midi=(octave+1)*12+semi;
  return midi>=0&&midi<=127?midi:null;
}
$('toneFile').addEventListener('change',async(e)=>{
  const files=Array.from(e.target.files||[]);if(!files.length)return;
  try {
    await ensureAudio();const loaded=[];
    for(const file of files){const bytes=await file.arrayBuffer();const buffer=await audioCtx.decodeAudioData(bytes);loaded.push({buffer,rootNote:parseRootNoteFromName(file.name)??Math.max(0,Math.min(127,Number($('rootNote').value)||48)),name:file.name});}
    instrumentSamples=loaded.sort((a,b)=>a.rootNote-b.rootNote);
    $('toneStatus').textContent='Loaded '+loaded.length+' WAV sample(s): '+loaded.map(x=>x.name+' (MIDI '+x.rootNote+')').join(', ')+'.';$('toneStatus').className='status ok';$('testToneBtn').disabled=false;
  } catch(err){status($('toneStatus'),'Could not decode one of the WAV files. Use standard PCM WAV recordings. '+err.message,'bad');}
});
function getToneSample(note){
  const target=note+(Number($('transpose').value)||0);
  return instrumentSamples.reduce((best,sample)=>!best||Math.abs(sample.rootNote-target)<Math.abs(best.rootNote-target)?sample:best,null);
}
function transpositionRatio(note,sample){
  const semitones=Number($('transpose').value)||0; const cents=Number($('fineTune').value)||0;
  return Math.pow(2,((note+semitones-sample.rootNote)+(cents/100))/12);
}
function noteOn(note,velocity=100,channel=0){
  if(!audioCtx||!instrumentSamples.length){status($('toneStatus'),'Load one or more WAV tone samples first. The SVD backup cannot be loaded as audio.','warn');return;}
  const sample=getToneSample(note);if(!sample)return;
  const key=channel+':'+note; noteOff(note,channel);
  const source=audioCtx.createBufferSource(),gain=audioCtx.createGain();
  source.buffer=sample.buffer; source.playbackRate.setValueAtTime(transpositionRatio(note,sample),audioCtx.currentTime);
  const now=audioCtx.currentTime,level=Math.max(.001,Math.min(1,velocity/127));
  gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(level,now+.004);
  source.connect(gain);gain.connect(instrumentGain);
  activeNotes.set(key,{source,gain});source.onended=()=>{if(activeNotes.get(key)?.source===source)activeNotes.delete(key);};source.start(now+.002);
  status($('toneStatus'),'Playing MIDI note '+note+' with master transpose/tune.','ok');
}
function noteOff(note,channel=0){
  const key=channel+':'+note,item=activeNotes.get(key);if(!item||!audioCtx)return;
  const now=audioCtx.currentTime;item.gain.gain.cancelScheduledValues(now);item.gain.gain.setTargetAtTime(0,now,.012);
  try{item.source.stop(now+.07);}catch(_){} activeNotes.delete(key);
}
function stopAllNotes(){for(const key of [...activeNotes.keys()]){const [ch,n]=key.split(':').map(Number);noteOff(n,ch);}}
$('testToneBtn').addEventListener('click',()=>{const n=Math.max(0,Math.min(127,Number($('rootNote').value)||48));noteOn(n,100,15);setTimeout(()=>noteOff(n,15),600);});
$('stopNotesBtn').addEventListener('click',stopAllNotes);
$('toneVolume').addEventListener('input',()=>{$('toneVolumeLabel').textContent=$('toneVolume').value+'%';updateVolumes();});
$('beatVolume').addEventListener('input',()=>{$('beatVolumeLabel').textContent=$('beatVolume').value+'%';updateVolumes();});
$('transpose').addEventListener('input',()=>{$('transposeLabel').textContent=$('transpose').value+' semitones';});
$('fineTune').addEventListener('input',()=>{$('fineTuneLabel').textContent=$('fineTune').value+' cents';});

// ---- MIDI ----
function attachMidi(input){if(selectedMidi)selectedMidi.onmidimessage=null;selectedMidi=input||null;if(selectedMidi)selectedMidi.onmidimessage=handleMidiMessage;$('midiBadge').textContent=selectedMidi?'MIDI connected':'Not connected';status($('midiStatus'),selectedMidi?'Connected to '+(selectedMidi.name||'MIDI keyboard')+'. Press a key.':'No MIDI input selected.',''+(selectedMidi?'ok':''));}
function refreshMidiInputs(){const select=$('midiInputs'),previous=select.value;select.innerHTML='';const inputs=midiAccess?[...midiAccess.inputs.values()]:[];if(!inputs.length){select.add(new Option('No MIDI input detected',''));attachMidi(null);return;}for(const input of inputs)select.add(new Option((input.name||'MIDI input')+(input.manufacturer?' · '+input.manufacturer:''),input.id));const next=inputs.find(i=>i.id===previous)||inputs[0];select.value=next.id;attachMidi(next);}
function handleMidiMessage(event){const [raw,note,velocity]=event.data;const command=raw&0xf0,channel=raw&0x0f;if(command===0x90&&velocity>0)noteOn(note,velocity,channel);else if(command===0x80||(command===0x90&&velocity===0))noteOff(note,channel);}
$('midiBtn').addEventListener('click',async()=>{try{await ensureAudio();if(!navigator.requestMIDIAccess){status($('midiStatus'),'Web MIDI is unavailable in this browser. Try current Chrome on Android.','warn');return;}midiAccess=await navigator.requestMIDIAccess({sysex:false});refreshMidiInputs();midiAccess.onstatechange=refreshMidiInputs;if(!midiAccess.inputs.size)status($('midiStatus'),'MIDI permission is ready, but no device was found. Check OTG, cable and USB permission.','warn');}catch(e){status($('midiStatus'),'MIDI connection failed: '+e.message,'bad');}});
$('midiInputs').addEventListener('change',()=>{const chosen=[...(midiAccess?.inputs.values()||[])].find(x=>x.id===$('midiInputs').value);attachMidi(chosen);});

// ---- Beat library download and playback ----
async function loadBeatIndex(){if(beatIndex.length)return;const response=await fetch('./assets/beats-index.json');if(!response.ok)throw new Error('Beat index missing.');beatIndex=await response.json();}
async function isBeatPackDownloaded(){if(!beatIndex.length)return false;const cache=await storageCache();const keys=await cache.keys();const present=new Set(keys.map(k=>k.url));for(const g of beatIndex){for(const loop of g.loops){if(!present.has(cacheUrl(loop.file)))return false;}}return true;}
async function refreshBeatUi(){
  if(!beatIndex.length)return;const select=$('beatGroup'),old=select.value;select.innerHTML='';
  for(const group of beatIndex){const label=group.name+(group.bpm?' · '+group.bpm+' BPM':'');select.add(new Option(label,group.id));}
  selectedGroup=beatIndex.find(g=>g.id===old)||beatIndex[0];select.value=selectedGroup.id;renderSelectedGroup();
  const downloaded=await isBeatPackDownloaded();$('beatPackBadge').textContent=downloaded?'Beat library ready offline':'Beat library not downloaded';
  $('downloadBeatsBtn').textContent=downloaded?'Beat library downloaded ✓':'Download beat library';
  $('downloadBeatsBtn').disabled=downloaded;
  if(downloaded)status($('downloadStatus'),'All '+totalLoops()+' loops are saved on this phone for offline use.','ok');
}
function renderSelectedGroup(){
  if(!selectedGroup)return;$('beatTitle').textContent=selectedGroup.name;$('beatBpm').textContent=selectedGroup.bpm?selectedGroup.bpm+' BPM':'BPM not listed';
  const pad=$('loopPads');pad.innerHTML='';for(let n=1;n<=8;n++){const found=selectedGroup.loops.find(l=>l.loop===n);const b=document.createElement('button');b.className='loop-btn'+(n===currentLoop?' active':'');b.textContent=String(n);b.disabled=!found;b.title=found?'Play loop '+n:'This beat set has no loop '+n;b.addEventListener('click',()=>selectLoop(n,true));pad.appendChild(b);}
  const first=selectedGroup.loops[0];if(first){currentLoop=first.loop;highlightLoop();}
  $('playBeatBtn').disabled=false;$('stopBeatBtn').disabled=!beatPlaying;
}
function highlightLoop(){document.querySelectorAll('.loop-btn').forEach(b=>b.classList.toggle('active',Number(b.textContent)===currentLoop));}
$('beatGroup').addEventListener('change',()=>{selectedGroup=beatIndex.find(g=>g.id===$('beatGroup').value)||null;decodedLoops.clear();renderSelectedGroup();if(beatPlaying&&selectedGroup)selectLoop(selectedGroup.loops[0].loop,true);});
async function unpackBeatLibrary(){
  if(!window.JSZip){throw new Error('ZIP library could not load. Connect to the internet and refresh the page.');}
  let packUrl='./assets/bratee-beat-pack.zip';
  if(!demoSession){const access=await apiCall('/api/beat-pack/url',{});packUrl=access.url;}
  const response=await fetch(packUrl);if(!response.ok)throw new Error('Beat pack download failed. Check your internet connection and licence.');
  const blob=await response.blob();const zip=await window.JSZip.loadAsync(blob);const files=Object.values(zip.files).filter(f=>!f.dir&&f.name.toLowerCase().endsWith('.mp3'));
  const cache=await storageCache();let done=0;
  for(const file of files){const audioBlob=await file.async('blob');const key=cacheUrl(file.name);await cache.put(new Request(key),new Response(audioBlob,{headers:{'Content-Type':'audio/mpeg'}}));done++;$('downloadProgress').style.width=(done/files.length*100).toFixed(1)+'%';$('downloadStatus').textContent='Saving beat '+done+' of '+files.length+'…';}
  if(files.length!==totalLoops())throw new Error('The ZIP has '+files.length+' loops, but the beat index lists '+totalLoops()+'.');
}
$('downloadBeatsBtn').addEventListener('click',async()=>{
  const b=$('downloadBeatsBtn');b.disabled=true;$('downloadProgress').style.width='0%';
  try{await unpackBeatLibrary();await refreshBeatUi();status($('beatStatus'),'Beat library downloaded. Select a rhythm and press a loop number.','ok');}
  catch(err){status($('downloadStatus'),'Download failed: '+err.message,'bad');b.disabled=false;}
});
$('clearBeatsBtn').addEventListener('click',async()=>{if(beatPlaying)stopBeat();await caches.delete(CACHE_NAME);decodedLoops.clear();$('downloadProgress').style.width='0%';$('beatPackBadge').textContent='Beat library not downloaded';$('downloadBeatsBtn').disabled=false;$('downloadBeatsBtn').textContent='Download beat library';status($('downloadStatus'),'Downloaded beat files removed from this phone.','warn');});
async function loadLoopBuffer(loop){
  const key=loop.file;if(decodedLoops.has(key))return decodedLoops.get(key);
  const cache=await storageCache();const response=await cache.match(cacheUrl(key));if(!response)throw new Error('Beat pack not downloaded. Press Download beat library first.');
  const buffer=await audioCtx.decodeAudioData(await response.arrayBuffer());decodedLoops.set(key,buffer);return buffer;
}
async function selectLoop(number,autoPlay){
  if(!selectedGroup)return;const loop=selectedGroup.loops.find(x=>x.loop===number);if(!loop){status($('beatStatus'),'This beat does not contain loop '+number+'.','warn');return;}
  currentLoop=number;highlightLoop();$('playBeatBtn').textContent='Play loop '+number;
  if(autoPlay||beatPlaying){try{await playSelectedLoop();}catch(err){status($('beatStatus'),err.message,'warn');}}
}
async function playSelectedLoop(){
  if(!selectedGroup)throw new Error('Choose a beat first.');const loop=selectedGroup.loops.find(x=>x.loop===currentLoop);if(!loop)throw new Error('This loop is not available.');
  await ensureAudio();const buffer=await loadLoopBuffer(loop);const now=audioCtx.currentTime+.015;
  const source=audioCtx.createBufferSource(),gain=audioCtx.createGain();source.buffer=buffer;source.loop=true;source.loopStart=0;const requestedEnd=Number(loop.duration)||buffer.duration;source.loopEnd=Math.max(0.02,Math.min(buffer.duration,requestedEnd));source.connect(gain);gain.connect(beatGain);
  gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(1,now+.025);
  if(beatSource&&beatSourceGain){beatSourceGain.gain.cancelScheduledValues(now);beatSourceGain.gain.setValueAtTime(beatSourceGain.gain.value,now);beatSourceGain.gain.linearRampToValueAtTime(0,now+.025);try{beatSource.stop(now+.04);}catch(_){}}
  source.start(now);beatSource=source;beatSourceGain=gain;beatPlaying=true;$('stopBeatBtn').disabled=false;
  status($('beatStatus'),'Playing '+selectedGroup.name+' · loop '+currentLoop+(selectedGroup.bpm?' · '+selectedGroup.bpm+' BPM':'')+'. Press 1–8 to switch loops.','ok');
}
function stopBeat(){if(!audioCtx||!beatSource){beatPlaying=false;$('stopBeatBtn').disabled=true;return;}const now=audioCtx.currentTime;if(beatSourceGain){beatSourceGain.gain.cancelScheduledValues(now);beatSourceGain.gain.setValueAtTime(beatSourceGain.gain.value,now);beatSourceGain.gain.linearRampToValueAtTime(0,now+.04);}try{beatSource.stop(now+.06);}catch(_){}beatSource=null;beatSourceGain=null;beatPlaying=false;$('stopBeatBtn').disabled=true;status($('beatStatus'),'Beat stopped.');}
$('playBeatBtn').addEventListener('click',async()=>{try{await playSelectedLoop();}catch(e){status($('beatStatus'),e.message,'warn');}});$('stopBeatBtn').addEventListener('click',stopBeat);
window.addEventListener('keydown',(event)=>{if(event.repeat||event.ctrlKey||event.altKey||event.metaKey)return;const el=event.target;if(el&&(el.tagName==='INPUT'||el.tagName==='SELECT'||el.tagName==='TEXTAREA'))return;const n=Number(event.key);if(n>=1&&n<=8&&selectedGroup){const loop=selectedGroup.loops.find(x=>x.loop===n);if(loop){event.preventDefault();selectLoop(n,true);}}});

// Keep the app shell available offline after first visit.
if('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
loadBeatIndex().then(refreshBeatUi).catch(()=>{});
initAuth();
})();