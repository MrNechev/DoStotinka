#!/usr/bin/env python3
"""
Downloads the logos of the brands in packages/shared/src/brands.ts (their website's app icon)
into apps/web/src/assets/brands/<id>.webp and writes logos.json (how to draw each one).

Usage:  python3 scripts/brand-logos.py [id ...]     (needs Pillow; without ids: missing logos)
        python3 scripts/brand-logos.py --force id   (download again)

Hand-made logos (an .svg in the folder, listed in logos.json with "manual": true) are kept.
Downloaded files are treated as untrusted: only raster formats are decoded (Pillow), SVG never.
"""

import concurrent.futures
import html.parser
import io
import json
import re
import sys
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRANDS_TS = ROOT / "packages/shared/src/brands.ts"
OUT = ROOT / "apps/web/src/assets/brands"
META = OUT / "logos.json"
SOURCES = Path(__file__).resolve().parent / "brand-logo-sources.json"
SIZE = 96
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def brands():
    """(id, domain, name) from the TypeScript registry."""
    text = BRANDS_TS.read_text()
    rows = re.findall(r"\['([a-z0-9-]+)',\s*(\"[^\"]*\"|'[^']*'),\s*'([a-z0-9.-]+)'", text)
    return [(i, d, n[1:-1]) for i, n, d in rows]


WIKI_UA = "DoStotinkaLogoScript/1.0 (https://github.com/MrNechev/DoStotinka; brand logos)"


def get(url, limit=3_000_000):
    import time

    wiki = "wikimedia.org" in url
    for attempt in range(4):
        # Wikimedia asks scripts to identify themselves and to go slowly.
        req = urllib.request.Request(url, headers={"User-Agent": WIKI_UA if wiki else UA, "Accept": "*/*"})
        try:
            if wiki:
                time.sleep(1.5)
            with urllib.request.urlopen(req, timeout=15) as res:
                return res.geturl(), res.read(limit)
        except urllib.error.HTTPError as err:
            if err.code != 429 or attempt == 3:
                raise
            time.sleep(10 * (attempt + 1))


class Links(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.icons = []  # (score, href)
        self.manifest = None

    def handle_starttag(self, tag, attrs):
        if tag != "link":
            return
        a = dict(attrs)
        rel = (a.get("rel") or "").lower()
        href = a.get("href")
        if href and rel == "manifest":
            self.manifest = href
        if not href or "icon" not in rel or "mask" in rel:
            return
        sizes = re.findall(r"(\d+)x\d+", a.get("sizes") or "")
        size = max(map(int, sizes)) if sizes else 0
        if "apple-touch-icon" in rel:
            size = max(size, 180)
        if href.lower().split("?")[0].endswith(".svg"):
            return  # never rasterise downloaded SVG (see load())
        self.icons.append((size, href))


def manifest_icons(url):
    try:
        _, body = get(url, 300_000)
        icons = json.loads(body).get("icons", [])
    except Exception:
        return []
    out = []
    for icon in icons:
        src = icon.get("src")
        if not src or src.lower().endswith(".svg") or "monochrome" in (icon.get("purpose") or ""):
            continue
        sizes = re.findall(r"(\d+)x\d+", icon.get("sizes") or "")
        out.append((max(map(int, sizes)) if sizes else 0, urllib.parse.urljoin(url, src)))
    return out


def candidates(domain):
    found = []  # (size, url)
    base = f"https://{domain}/"
    for home in (f"https://{domain}/", f"https://www.{domain}/"):
        try:
            final, body = get(home, 1_500_000)
        except Exception:
            continue
        parser = Links()
        parser.feed(body.decode("utf-8", "replace"))
        found += [(size, urllib.parse.urljoin(final, href)) for size, href in parser.icons]
        if parser.manifest:
            found += manifest_icons(urllib.parse.urljoin(final, parser.manifest))
        base = final
        break
    urls = [u for size, u in sorted(found, reverse=True) if size >= 64 or size == 0]
    urls += [urllib.parse.urljoin(base, "/apple-touch-icon.png")]
    urls += [
        "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL"
        f"&url=https://{d}&size=256"
        for d in (domain, f"www.{domain}")
    ]
    return urls


def load(data):
    """An image from PNG/ICO/JPEG/WebP bytes. Downloaded SVG is refused: rasterisers can be made
    to read local files into the picture."""
    if b"<svg" in data[:1000]:
        raise ValueError("svg")
    img = Image.open(io.BytesIO(data))
    if img.format not in ("PNG", "ICO", "JPEG", "WEBP", "GIF"):
        raise ValueError(img.format)
    if getattr(img, "n_frames", 1) > 1 and img.format == "ICO":
        img = max((img.ico.getimage(s) for s in img.ico.sizes()), key=lambda i: i.width)
    return img.convert("RGBA")


def normalise(img):
    """96×96: opaque square icons fill the circle ("cover"), transparent ones sit inside it."""
    bbox = img.getchannel("A").getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    alpha = img.getchannel("A")
    corners = [alpha.getpixel(p) for p in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]]
    opaque = min(corners) > 250 and abs(w - h) <= max(w, h) * 0.1
    if opaque:
        side = min(w, h)
        img = img.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
        return img.resize((SIZE, SIZE), Image.LANCZOS), "cover"
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((SIZE, SIZE), Image.LANCZOS), "contain"


SIMPLE_ICONS = "https://cdn.jsdelivr.net/npm/simple-icons@16.38.0"
_si = None


def simple_icons():
    """slug of every Simple Icons title / alias → (slug, hex)."""
    global _si
    if _si is None:
        _, body = get(f"{SIMPLE_ICONS}/data/simple-icons.json", 20_000_000)
        data = json.loads(body)
        data = data["icons"] if isinstance(data, dict) else data
        _si = {}
        for icon in data:
            slug = icon.get("slug") or si_slug(icon["title"])
            for name in [icon["title"], *((icon.get("aliases") or {}).get("aka") or [])]:
                _si.setdefault(si_slug(name), (slug, icon["hex"]))
    return _si


def si_slug(title):
    import unicodedata

    t = title.replace("+", "plus").replace(".", "dot").replace("&", "and")
    t = "".join(c for c in unicodedata.normalize("NFD", t) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", t.lower())


def simple_icon(brand_id, name, domain):
    """The brand's Simple Icons glyph in its colour (dark when the colour is too light)."""
    icons = simple_icons()
    for key in (si_slug(name), brand_id.replace("-", ""), si_slug(domain.split(".")[0])):
        if key in icons:
            slug, hexcolor = icons[key]
            break
    else:
        return None
    _, svg = get(f"{SIMPLE_ICONS}/icons/{slug}.svg", 100_000)
    svg = svg.decode()
    if not re.fullmatch(r'<svg [^<>]*><title>[^<>]*</title><path d="[^"<>]*"/></svg>\s*', svg):
        return None  # only the plain one-path files of the package
    r, g, b = (int(hexcolor[i : i + 2], 16) for i in (0, 2, 4))
    color = hexcolor if (0.299 * r + 0.587 * g + 0.114 * b) < 190 else "1F2937"
    svg = svg.replace("<svg ", f'<svg fill="#{color}" ', 1)
    (OUT / f"{brand_id}.svg").write_text(svg)
    return {"style": "contain", "file": f"{brand_id}.svg", "padding": 0.2, "source": f"simple-icons:{slug}", "size": 999}


def wiki_logo(name):
    """A logo from Wikimedia Commons ("<name> logo" files) as a 256 px PNG thumbnail."""
    words = [w for w in re.findall(r"\w+", name.lower()) if len(w) > 1]
    query = urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
        "gsrlimit": 8, "gsrsearch": f"{name} logo", "prop": "imageinfo",
        "iiprop": "url|mime", "iiurlwidth": 256,
    })
    try:
        _, body = get(f"https://commons.wikimedia.org/w/api.php?{query}", 2_000_000)
        pages = json.loads(body).get("query", {}).get("pages", {}).values()
    except Exception:
        return None
    for page in sorted(pages, key=lambda p: p.get("index", 99)):
        title = page.get("title", "").lower()
        info = (page.get("imageinfo") or [{}])[0]
        if "logo" not in title or not all(w in title for w in words[:2]):
            continue
        if info.get("mime") not in ("image/svg+xml", "image/png") or not info.get("thumburl"):
            continue
        return info["thumburl"]
    return None


def commons_file(title):
    """A Wikimedia Commons file as a PNG thumbnail (rendered by Wikimedia)."""
    query = urllib.parse.urlencode({
        "action": "query", "format": "json", "titles": title, "prop": "imageinfo",
        "iiprop": "url", "iiurlwidth": 256,
    })
    _, body = get(f"https://commons.wikimedia.org/w/api.php?{query}")
    page = next(iter(json.loads(body)["query"]["pages"].values()))
    url = page["imageinfo"][0]["thumburl"]
    _, data = get(url)
    return load(data), url


def fetch(brand_id, domain, name=""):
    best = None
    for url in candidates(domain):
        try:
            _, data = get(url)
            img = load(data)
        except Exception:
            continue
        if img.width < 16:
            continue
        if best is None or img.width > best[0].width:
            best = (img, url)
        if img.width >= 120:
            break
    # Small favicons look blurry on the badges: the Simple Icons glyph or a Wikimedia logo is
    # sharper.
    if best is None or best[0].width < 96:
        try:
            si = simple_icon(brand_id, name, domain)
        except Exception:
            si = None
        if si:
            (OUT / f"{brand_id}.webp").unlink(missing_ok=True)
            return brand_id, si
        wiki = wiki_logo(name)
        if wiki:
            try:
                _, data = get(wiki)
                best = (load(data), wiki)
            except Exception:
                pass
    if not best:
        return brand_id, None
    img, url = best
    out, style = normalise(img)
    out.save(OUT / f"{brand_id}.webp", "WEBP", quality=90, method=6)
    (OUT / f"{brand_id}.svg").unlink(missing_ok=True)
    return brand_id, {"style": style, "file": f"{brand_id}.webp", "source": url, "size": img.width}


def main(argv):
    force = "--force" in argv
    wanted = [a for a in argv if not a.startswith("--")]
    meta = json.loads(META.read_text()) if META.exists() else {}
    sources = {k: v for k, v in json.loads(SOURCES.read_text()).items() if not k.startswith("_")}
    for brand_id, src in sources.items():
        if wanted and brand_id not in wanted or not ("commons" in src or "url" in src):
            continue
        if not force and brand_id in meta:
            continue
        try:
            if "commons" in src:
                img, url = commons_file(src["commons"])
            else:
                url = src["url"]
                img = load(get(url)[1])
        except Exception as err:
            print(f"  {brand_id:24} FAILED {err}")
            continue
        out, style = normalise(img)
        out.save(OUT / f"{brand_id}.webp", "WEBP", quality=90, method=6)
        meta[brand_id] = {"style": style, "file": f"{brand_id}.webp", "source": url, "size": img.width}
        print(f"  {brand_id:24} {style:8} {url[:70]}")
    for brand_id, src in sources.items():
        if "none" in src:
            meta.pop(brand_id, None)
        if "same" in src and src["same"] in meta:
            meta[brand_id] = {**meta[src["same"]], "source": f"same as {src['same']}"}
    todo = [
        (i, d, n)
        for i, d, n in brands()
        if (not wanted or i in wanted)
        and not meta.get(i, {}).get("manual")
        and i not in sources
        and (force or i not in meta)
    ]
    print(f"{len(todo)} logos to download")
    with concurrent.futures.ThreadPoolExecutor(12) as pool:
        for brand_id, info in pool.map(lambda b: fetch(*b), todo):
            if info:
                meta[brand_id] = info
                print(f"  {brand_id:24} {info['style']:8} {info['size']:>4}px  {info['source'][:80]}")
            else:
                print(f"  {brand_id:24} MISSING")
    META.write_text(json.dumps(dict(sorted(meta.items())), indent=2) + "\n")


if __name__ == "__main__":
    main(sys.argv[1:])
