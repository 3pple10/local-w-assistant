
- Desktop downloads are listed in src/lib/desktop-versions.ts, newest first, capped at the last 3 builds per platform; older pointers live in src/assets/desktop-versions/. Why: users can roll back without unbounded storage.
- Desktop packaging ignores node_modules (the app only needs electron/ and the built dist/). Why: keeps bundles ~200 MB instead of ~500 MB.
