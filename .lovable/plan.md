# Finish and verify the Electron Fetcher

## Goal
Deliver a desktop build that opens the existing app, starts its private local downloader automatically, and lets Fetcher communicate with it without a separate terminal command.

## Changes
- Make the Electron entry work in both development and packaged builds, with one application instance and a clean downloader shutdown.
- Package the app’s production output correctly instead of relying on the development website address.
- Add a native folder chooser to the existing “Save to” control when running inside Electron.
- Strengthen local-service startup and error reporting, including port conflicts and missing `yt-dlp`/`ffmpeg`.
- Keep the chained model architecture out of scope until you provide that plan.

## Verification
- Start the Electron window and confirm the Fetcher page renders.
- Confirm the bundled service health check responds from inside the desktop session.
- Submit a real sanitized media URL, follow its live SSE output, and confirm cancellation/exit behavior.
- Create and inspect a downloadable Linux desktop archive.

## Technical details
- Electron retains `contextIsolation: true`, `nodeIntegration: false`, and an explicit preload bridge.
- `yt-dlp` is invoked with an argument array and `shell: false`; URL, format, quality, path, and cookie inputs remain validated.
- The package will use Electron Packager and include only the files needed at runtime.
