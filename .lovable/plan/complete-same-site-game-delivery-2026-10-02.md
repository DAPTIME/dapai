# Complete same-site game delivery

## What you'll get

- Games launch inside DAP Games without showing the GamePix loading/consent shell.
- Game HTML, scripts, images, audio, data, and nested frames stay behind the DAP Games address.
- Relay mode remains the default so networks blocking GamePix cannot interrupt loading.

## Implementation

- Expand the relay to rewrite all provider game/CDN URLs and browser request channels before game code runs.
- Resolve upstream redirects and relative assets against their true final URL while preserving the game slug path.
- Automatically pass the provider launch screen so the playable game starts without exposing provider branding.
- Keep advertising and analytics domains separate; they will not be treated as required game files.

## Verification

- Run a game with direct GamePix requests blocked in the browser.
- Confirm the playable game loads, no GamePix host appears in browser requests, and relay responses succeed.
- Check the mobile player view, reload control, build, and roadmap completion.
