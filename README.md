# Immich Widget for Linux Mint / Cinnamon

A desktop photo slideshow for the Cinnamon desktop that shows photos from your own
[Immich](https://immich.app) server.

![Immich Widget on the desktop](arbeidsfiler/screenshots/widget.png)

- **Smart cropping.** Uses Immich face detection to crop each photo to the widget's shape around the people in it, so heads are not cut off.
- **Your photos, your choice.** Show all photos, only favorites, one album or one person.
- **Camera photos only.** Screenshots and saved images are skipped (optional).
- **Looks at home on the desktop.** The photo fills the frame with rounded corners, a soft shadow and a smooth fade.
- **Date and place caption**, in your own language (for example *27 July 2023 · Bergen*).
- **Works offline.** Photos are cached, and a new batch is fetched on a schedule you choose.
- **Everything is set in the widget's settings.** No config files, no terminal.

Left-click shows the next photo. Middle-click opens the photo in Immich.

## Requirements

- Linux Mint or another distribution with the Cinnamon desktop (tested on Linux Mint 22 / Cinnamon 6.6)
- An Immich server (tested with Immich 3.3) reachable from the computer, at home or over a VPN such as Tailscale

## Install

From Cinnamon (once it is published on Cinnamon Spices): right-click the desktop → **Add Desklets** →
**Download** tab, search for *Immich Widget* and install it.

Manually:

```sh
git clone https://github.com/RayBomb87/immich-linux-cinnamon-widget.git
cp -r immich-linux-cinnamon-widget/arbeidsfiler/immich-widget@raybomb87 ~/.local/share/cinnamon/desklets/
```

Then right-click the desktop → **Add Desklets**, select **Immich Widget** and click **+**.

## Set up

1. In Immich, go to your profile picture → **Account Settings → API Keys → New API Key**.
   Give it these permissions:
   - `asset.read` and `asset.view` (required)
   - `face.read` (for cropping around faces)
   - `album.read` (only if you show one album)
   - `person.read` (only if you show one person)
2. Right-click the widget → **Configure** and enter the server address (for example `http://192.168.1.10:2283`) and the API key.

The first photos appear after a few seconds.

![Settings](arbeidsfiler/screenshots/settings.png)

## Settings

| Page | Setting | Default |
| --- | --- | --- |
| Connection | Server address, API key, *Fetch new photos now* | – |
| Photos | Show: all photos, favorites, one album, one person | All photos |
| | Album or person name | – |
| | Include screenshots and saved images | Off |
| | Crop around faces | On |
| | Photos per batch | 40 |
| | Fetch a new batch every | 6 hours |
| | Time per photo | 30 seconds |
| Appearance | Width × height | 400 × 240 px |
| | Corner radius, drop shadow, fade duration | 16 px, on, 800 ms |
| | Date format, place (city / city and country), text size | 27 July 2023, city, 10.5 pt |

You can add several widgets, for example one with favorites and one with a single album.
Each one has its own settings.

## Privacy

- The widget only talks to the Immich server you enter.
- Photos are cached in `~/.cache/immich-widget@raybomb87/<widget id>/`.
- The API key is stored in the widget's settings in your home folder.
  Give the key only the permissions listed above.

## How it works

Everything runs inside the desklet, asynchronously, with Cinnamon's own libraries (libsoup and GdkPixbuf).
At start-up, on a schedule and when the settings change, it asks Immich for random photos
(`/api/search/random`), downloads the preview size, crops it around the faces from `/api/faces`
and stores the photos and a `captions.json` in the cache folder. The slideshow plays from that folder.

## Translations

English and Norwegian Bokmål. Translations are welcome: copy `po/immich-widget@raybomb87.pot`
to `po/<language>.po` and translate it, for example with Poedit.

## License

The example photo in the screenshot is [Loen fra Skåla](https://commons.wikimedia.org/wiki/File:Loen_fra_Sk%C3%A5la.jpg) (CC0).


[MIT](LICENSE)
