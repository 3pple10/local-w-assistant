# Desktop shell

The desktop build wraps the same app in a window and starts a small local
service on `127.0.0.1:3000`, which is exactly what the Fetcher page talks to.
No terminal, no separate server to launch.

## Run it

```bash
npm run dev            # in one terminal (the app itself)
npm run desktop        # in another (the window)
```

`APP_URL` overrides which address the window loads (defaults to
`http://localhost:8080`). Point it at the published site to run the window
against the hosted build.

## Package it

```bash
npm run desktop:package          # current platform
```

Output lands in `electron-release/`.

## Requirements

- `yt-dlp` on PATH (and `ffmpeg` for merging/audio conversion).
- Browser-cookie downloads read the signed-in session of the browser you pick.

## Security notes

- `yt-dlp` is spawned with an argument array and `shell: false`, so nothing in a
  link or file name can be re-interpreted as a command.
- Quality, container and cookie-browser values are checked against allow-lists
  in the service as well as in the page.
- The service binds to `127.0.0.1` only.
