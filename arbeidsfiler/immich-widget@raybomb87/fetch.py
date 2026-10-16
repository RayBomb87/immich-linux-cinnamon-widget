#!/usr/bin/env python3
"""Fetch random photos from Immich into a folder for the Immich widget.

Called by desklet.js. The API key is read from the IMMICH_API_KEY environment
variable so it never shows up in the process list.
"""
import argparse, io, json, os, sys, urllib.error, urllib.parse, urllib.request

try:
    from PIL import Image
except ImportError:  # without Pillow the widget still works, just without smart cropping
    Image = None

p = argparse.ArgumentParser()
p.add_argument("--server", required=True)
p.add_argument("--out", required=True)
p.add_argument("--count", type=int, default=40)
p.add_argument("--width", type=int, default=400)
p.add_argument("--height", type=int, default=235)
p.add_argument("--source", choices=["all", "favorites", "album", "person"], default="all")
p.add_argument("--name", default="", help="album or person name for --source album/person")
p.add_argument("--include-screenshots", action="store_true")
p.add_argument("--no-faces", action="store_true")
args = p.parse_args()

SERVER = args.server.strip().rstrip("/")
if not SERVER.startswith(("http://", "https://")):
    SERVER = "http://" + SERVER
KEY = os.environ.get("IMMICH_API_KEY", "").strip()


def call(path, data=None):
    req = urllib.request.Request(
        SERVER + "/api" + path, method="POST" if data is not None else "GET",
        data=json.dumps(data).encode() if data is not None else None,
        headers={"x-api-key": KEY, "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def search_filter():
    f = {}
    if args.source == "favorites":
        f["isFavorite"] = True
    elif args.source == "album":
        albums = json.loads(call("/albums"))
        match = [a["id"] for a in albums if a["albumName"].strip().lower() == args.name.strip().lower()]
        if not match:
            fail(f"Album not found: {args.name}")
        f["albumIds"] = match[:1]
    elif args.source == "person":
        people = json.loads(call("/search/person?name=" + urllib.parse.quote(args.name.strip())))
        if not people:
            fail(f"Person not found: {args.name}")
        f["personIds"] = [people[0]["id"]]
    return f


def faces(asset_id, w, h):
    """Face boxes from Immich scaled to (w, h); empty if unknown or not permitted."""
    try:
        data = json.loads(call(f"/faces?id={asset_id}"))
    except Exception:
        return []
    boxes = []
    for f in data:
        sx, sy = w / f["imageWidth"], h / f["imageHeight"]
        boxes.append((f["boundingBoxX1"] * sx, f["boundingBoxY1"] * sy,
                      f["boundingBoxX2"] * sx, f["boundingBoxY2"] * sy))
    return boxes


def window_start(length, window, low, high, margin, no_face_bias):
    """Start of a `window` within `length` that keeps [low, high] if possible."""
    if low is None:
        start = (length - window) * no_face_bias
    elif high - low + 2 * margin <= window:
        mid = (low + high) / 2
        start = min(max(mid - window / 2, high + margin - window), low - margin)
    else:  # not all faces fit: keep the top (heads)
        start = low - margin
    return int(max(0, min(start, length - window)))


def crop(data, asset_id):
    if Image is None:
        return data
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    rw, rh = args.width, args.height
    boxes = [] if args.no_faces else faces(asset_id, w, h)
    if boxes:
        x1, y1 = min(b[0] for b in boxes), min(b[1] for b in boxes)
        x2, y2 = max(b[2] for b in boxes), max(b[3] for b in boxes)
        m = max(b[3] - b[1] for b in boxes) * 0.5  # room for hair and chin
    else:
        x1 = y1 = x2 = y2 = None
        m = 0
    if w / h > rw / rh:  # too wide: cut the sides
        cw = round(h * rw / rh)
        x = window_start(w, cw, x1, x2, m, 0.5)
        img = img.crop((x, 0, x + cw, h))
    else:  # too tall: cut top/bottom, slightly above centre without faces
        ch = round(w * rh / rw)
        y = window_start(h, ch, y1, y2, m, 0.3)
        img = img.crop((0, y, w, y + ch))
    scale = min(2, img.size[0] / rw)
    img = img.resize((round(rw * scale), round(rh * scale)), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue()


if not KEY:
    fail("No API key set")
try:
    query = {"size": args.count * 3, "type": "IMAGE", "withExif": True, **search_filter()}
    photos = json.loads(call("/search/random", query))
except urllib.error.HTTPError as e:
    try:
        detail = json.loads(e.read()).get("message", "")
    except Exception:
        detail = ""
    if e.code == 401:
        fail("Immich rejected the API key")
    fail(f"Immich: {detail or f'error {e.code}'}")
except Exception as e:  # offline: keep the photos we already have
    fail(f"Cannot reach Immich: {e}")

if not args.include_screenshots:  # screenshots and saved images have no camera make
    photos = [b for b in photos if (b.get("exifInfo") or {}).get("make")]
photos = photos[:args.count]

os.makedirs(args.out, exist_ok=True)
size_file = os.path.join(args.out, "size")
size = f"{args.width}x{args.height} faces={not args.no_faces}"
recrop = not os.path.exists(size_file) or open(size_file).read() != size
keep, captions = set(), {}
for b in photos:
    name = b["id"] + ".jpg"
    path = os.path.join(args.out, name)
    if recrop or not os.path.exists(path):
        try:
            data = crop(call(f"/assets/{b['id']}/thumbnail?size=preview"), b["id"])
        except Exception:
            continue
        with open(path + ".tmp", "wb") as f:
            f.write(data)
        os.replace(path + ".tmp", path)
    keep.add(name)
    exif = b.get("exifInfo") or {}
    captions[name] = {"date": (b.get("localDateTime") or b.get("fileCreatedAt") or "")[:10],
                      "city": exif.get("city") or "", "country": exif.get("country") or ""}

if not keep:
    fail("No photos found")
with open(size_file, "w") as f:
    f.write(size)
with open(os.path.join(args.out, "captions.json.tmp"), "w") as f:
    json.dump(captions, f, ensure_ascii=False)
os.replace(os.path.join(args.out, "captions.json.tmp"), os.path.join(args.out, "captions.json"))
for old in os.listdir(args.out):  # drop the previous batch only once the new one is in place
    if old.endswith(".jpg") and old not in keep:
        os.remove(os.path.join(args.out, old))
print(f"{len(keep)} photos")
