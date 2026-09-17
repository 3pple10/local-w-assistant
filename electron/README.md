# Desktop shell

The desktop build wraps the same app in a window and starts a small local
service on `127.0.0.1:3000`, which is exactly what the Fetcher page talks to.
No terminal, no separate server to launch.

## Run it

```bash
npm run dev            # in one terminal (the app itself)
npm run desktop        # in another (the window)
```

`APP_URL` overrides the development address (defaults to `http://localhost:8080`).
Packaged releases load the included production app and do not need a web server.

## Package it

```bash
npm run desktop:package
```

Output lands in `electron-release/`.

## Requirements

- The package prefers `electron/bin/yt-dlp` and otherwise uses `yt-dlp` on PATH.
- `ffmpeg` is required for merging and audio conversion.
- Browser-cookie downloads read the signed-in session of the browser you pick.

## Security notes

- `yt-dlp` is spawned with an argument array and `shell: false`, so nothing in a
  link or file name can be re-interpreted as a command.
- Quality, container and cookie-browser values are checked against allow-lists
  in the service as well as in the page.
- The service binds to `127.0.0.1` only.
