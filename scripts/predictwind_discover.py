#!/usr/bin/env python3
"""Discover PredictWind NowCasting observation stations near a point.

Scans the slippy-map observation tiles around a lat/lon and lists every station
found, sorted by distance, with its trackId, coordinates and elevation. Use the
output to populate a PW_CONFIG entry (tiles + curated station list with a good
elevation spread) in public/whakapapa-snow-forecast.html.

Usage:
    python3 scripts/predictwind_discover.py <lat> <lon> [radius_tiles]

Example (Mt Lyford):
    python3 scripts/predictwind_discover.py -42.446503 173.143418
"""
import json, math, re, sys, urllib.request

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")


def merc(lat, lon, z=10):
    """PredictWind orders its tile path /{z}/{A}/{B} with A = n - mercator_y,
    B = mercator_x. Return that (A, B) pair."""
    n = 2 ** z
    mx = int((lon + 180.0) / 360.0 * n)
    my = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return n - my, mx


def fetch_tile(a, b, z=10):
    url = f"https://forecast.predictwind.com/observations/tile/{z}/{a}/{b}.json"
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Referer": "https://forecast.predictwind.com/observations/",
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            if "json" not in r.headers.get("Content-Type", "") and r.status != 200:
                return None
            return json.loads(r.read())
    except Exception as e:
        print(f"  (tile {z}/{a}/{b}: {e})", file=sys.stderr)
        return None


def parse_meta(t):
    name = t.split('$', 1)[0]
    m = re.search(r'([+-]\d+)([+-]\d+)\^(\d+)', t)
    prov = (re.search(r'S([a-z0-9_]+)\$', t) or [None, None])[1]
    return {
        "name": name,
        "lat": int(m.group(1)) / 1e5 if m else None,
        "lon": int(m.group(2)) / 1e5 if m else None,
        "elev_m": int(m.group(3)) if m else None,
        "provider": prov,
    }


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    lat, lon = float(sys.argv[1]), float(sys.argv[2])
    radius = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    z = 10
    a0, b0 = merc(lat, lon, z)
    print(f"center tile [z,A,B] = [{z},{a0},{b0}]  scanning radius {radius}\n")

    seen = {}        # trackId -> (meta, tilekey)
    tiles_with_data = []
    for da in range(-radius, radius + 1):
        for db in range(-radius, radius + 1):
            a, b = a0 + da, b0 + db
            t = fetch_tile(a, b, z)
            if not t or not t.get("tracks"):
                continue
            tiles_with_data.append([z, a, b])
            for tid, tr in t["tracks"].items():
                if tid in seen:
                    continue
                meta = parse_meta(tr.get("t", ""))
                if meta["lat"] is None:
                    continue
                meta["dist_km"] = haversine_km(lat, lon, meta["lat"], meta["lon"])
                meta["tile"] = [z, a, b]
                seen[tid] = (tid, meta)

    rows = sorted(seen.values(), key=lambda kv: kv[1]["dist_km"])
    print(f"tiles returning data: {tiles_with_data}")
    print(f"{len(rows)} stations found\n")
    print(f"{'trackId':>10}  {'dist':>6}  {'elev':>5}  {'tile':>16}  name")
    for tid, m in rows:
        print(f"{tid:>10}  {m['dist_km']:5.1f}k  {str(m['elev_m']):>5}  "
              f"{str(m['tile']):>16}  {m['name']}  ({m['provider']})")


if __name__ == "__main__":
    main()
