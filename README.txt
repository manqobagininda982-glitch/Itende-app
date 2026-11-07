BraTee iTende Studio V1
======================

What it does
- Receives MIDI note-on/note-off messages from a USB MIDI keyboard.
- Loads one WAV sample as a playable instrument, transposed across notes.
- Loads a WAV backing beat and plays/loops it.
- Separate instrument and beat volume controls.
- Basic installable PWA structure.

Important
- This is a first prototype. It does not include iTende WAV samples.
- You must supply WAV samples you own or have permission to use.
- One sample transposed over the keyboard is not the same quality as a multisample instrument.
- Web MIDI requires a supported browser and HTTPS. Use current Google Chrome on Android to test.
- MIDI sends note data, not audio. The phone generates audio from the WAV sample.
- For best reliability, keep the browser open and screen awake during initial tests.

Yamaha YPT-360 connection
- Connect the keyboard's USB TO HOST port using a USB printer-style cable to a suitable USB OTG adapter for your phone.
- Power the keyboard normally.
- Open the deployed HTTPS site in Chrome.
- Tap Enable audio, then Connect MIDI, and grant permissions if asked.
- Select the Yamaha MIDI input if it appears.
- Load a WAV instrument sample and set its root note. Default 48 means C3.
- Load a WAV beat and press Play beat.

Deploy to Vercel
1. Upload the contents of this folder to a GitHub repository.
2. In Vercel choose Add New -> Project and import that repository.
3. Framework preset: Other (or Vite not needed).
4. Build command: leave blank.
5. Output directory: leave blank / root static files.
6. Deploy. Vercel gives you an HTTPS URL.
7. Open that URL in Chrome on your phone.

If you use Vercel's static deployment import flow, the app files can be served directly without a server or paid database.
