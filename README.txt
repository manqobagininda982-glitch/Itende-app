BraTee iTende Studio V2 — recovered import package

This package contains the V2 application source and the complete audio files recoverable from the supplied beat-pack upload.

RECOVERED AUDIO
- 258 complete MP3 loops recovered from the uploaded archive.
- 37 beat sets have at least one recovered loop.
- The original index listed 333 loops; 75 loops were not present in the uploaded archive.
- The final MP3 entry in the upload was truncated and was not included.
- The app index has been filtered to match the 258 recovered loops, so the download count matches the available files.

DEPLOYMENT
- Extract this ZIP into the ROOT of the existing GitHub repository, preserving folder paths.
- It includes assets/bratee-beat-pack.zip for private development/testing. Do not publicly distribute sounds unless you have permission to redistribute them.
- config.js remains in development preview mode. Real authentication and licence activation require Supabase setup and Vercel server environment variables described in the project documentation.
- The app does not process R100 payments. Licence keys must only be issued after payment is independently confirmed.

ROLAND SVD
The .SVD instrument expansion file was not present in either uploaded ZIP. A Roland .SVD file is not a WAV sample bank and cannot be loaded directly by this browser app or the Yamaha YPT-360.
