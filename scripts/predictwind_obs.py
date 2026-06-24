#!/usr/bin/env python3
"""Rip observation data from a PredictWind NowCasting station.

PredictWind serves its observation map as slippy-map tiles of packed station
tracks: https://forecast.predictwind.com/observations/tile/{z}/{x}/{y}.json
Each tile has {"updated", "tracks": {trackId: {t, l, s, ...}}} where:
  t : "<name>$<lat*1e5><lon*1e5>^<elev>z<..>o<..>S<provider>$<code>"
  l : latest sample  "<ts><lat><lon>d<dir>s<spd>g<gust>t<temp>"
  s : delta-encoded 24h series, records joined by '|'.
      - keyframe record (every ~12h):  "<ts><lat><lon>d<dir>s<spd>g<gust>t<temp>"
      - delta record:                  "<dt>d<ddir>s<dspd>g<dgust>t<dtemp>"  (fields optional)
Units (verified against the site UI):
  temp = raw/10 °C ; speed & gust = raw/10 knots ; dir = degrees.
  The site shows wind in km/h (knots * 1.852).
"""
import json, re, sys, urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

ANCHOR = re.compile(r'^(\d{9,})([+-]\d+)([+-]\d+)d(-?\d+)s(-?\d+)g(-?\d+)t(-?\d+)$')
CONT   = re.compile(r'^(\d+)(?:d(-?\d+))?(?:s(-?\d+))?(?:g(-?\d+))?(?:t(-?\d+))?$')
KT_TO_KMH = 1.852


def _merc(lat, lon, z):
    """Standard web-mercator tile coords. PredictWind's tile path orders these
    as /{z}/{A}/{B} where A ~ (n - mercator_y) and B = mercator_x, so we use
    this as a calibrated starting guess and scan a small neighbourhood."""
    import math
    n = 2 ** z
    mx = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    my = int((1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n)
    return n - my, mx  # (A guess, B guess)


def fetch_tile(a, b, z=10):
    """Fetch one tile; return parsed dict or None if it isn't JSON (404 etc)."""
    url = f"https://forecast.predictwind.com/observations/tile/{z}/{a}/{b}.json"
    req = urllib.request.Request(url, headers={"User-Agent": UA,
            "Referer": "https://forecast.predictwind.com/observations/"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            if "json" not in r.headers.get("Content-Type", "") and r.status != 200:
                return None
            body = r.read()
        return json.loads(body)
    except Exception:
        return None


def decode_series(s):
    """Return list of dicts: {ts, dir, speed_kt, gust_kt, temp_c}."""
    out, ts = [], None
    dirc = spd = gst = tmp = None
    for rec in s.split('|'):
        a = ANCHOR.match(rec)
        if a:
            ts = int(a.group(1)); dirc = int(a.group(4))
            spd = int(a.group(5)); gst = int(a.group(6)); tmp = int(a.group(7))
        else:
            m = CONT.match(rec)
            if not m:
                continue
            ts += int(m.group(1))
            if m.group(2) is not None: dirc += int(m.group(2))
            if m.group(3) is not None: spd += int(m.group(3))
            if m.group(4) is not None: gst += int(m.group(4))
            if m.group(5) is not None: tmp += int(m.group(5))
        out.append({"ts": ts, "dir": dirc % 360,
                    "speed_kt": spd / 10, "gust_kt": gst / 10, "temp_c": tmp / 10})
    return out


def parse_meta(t):
    name = t.split('$', 1)[0]
    m = re.search(r'([+-]\d+)([+-]\d+)\^(\d+)', t)
    lat = int(m.group(1)) / 1e5 if m else None
    lon = int(m.group(2)) / 1e5 if m else None
    elev = int(m.group(3)) if m else None
    prov = None
    pm = re.search(r'S([a-z0-9_]+)\$', t)
    if pm: prov = pm.group(1)
    return {"name": name, "lat": lat, "lon": lon, "elev_m": elev, "provider": prov}


def rip(track_id, lat, lon):
    a0, b0 = _merc(lat, lon, 10)
    tid = str(track_id)
    tr = tile = None
    # scan outward from the calibrated guess (rings of increasing radius)
    for radius in range(0, 4):
        for da in range(-radius, radius + 1):
            for db in range(-radius, radius + 1):
                if max(abs(da), abs(db)) != radius:
                    continue  # only the new ring
                t = fetch_tile(a0 + da, b0 + db)
                if t and tid in t.get("tracks", {}):
                    tr, tile = t["tracks"][tid], t
                    break
            if tr:
                break
        if tr:
            break
    if not tr:
        raise SystemExit(f"track {track_id} not found near tile ({a0},{b0})")
    meta = parse_meta(tr["t"])
    series = decode_series(tr["s"])
    return {"updated": tile["updated"], "meta": meta, "series": series}


if __name__ == "__main__":
    # Whakapapa 2000m: trackId 363045, station obs id 7410529
    tid = sys.argv[1] if len(sys.argv) > 1 else "363045"
    lat = float(sys.argv[2]) if len(sys.argv) > 2 else -39.25211
    lon = float(sys.argv[3]) if len(sys.argv) > 3 else 175.56458
    data = rip(tid, lat, lon)
    m, s = data["meta"], data["series"]
    last = s[-1]
    print(f"{m['name']}  ({m['lat']}, {m['lon']})  {m['elev_m']}m  via {m['provider']}")
    print(f"samples: {len(s)}  span: "
          f"{(s[-1]['ts']-s[0]['ts'])/3600:.1f}h")
    print(f"latest:  {last['temp_c']:.1f}C  "
          f"wind {last['speed_kt']:.1f}kt ({last['speed_kt']*KT_TO_KMH:.1f} km/h)  "
          f"gust {last['gust_kt']:.1f}kt ({last['gust_kt']*KT_TO_KMH:.1f} km/h)  "
          f"dir {last['dir']}")
    gmax = max(s, key=lambda r: r['gust_kt'])
    print(f"24h max gust: {gmax['gust_kt']:.1f}kt ({gmax['gust_kt']*KT_TO_KMH:.1f} km/h)")
    print(f"24h temp range: {min(r['temp_c'] for r in s):.1f} .. {max(r['temp_c'] for r in s):.1f} C")
    # write CSV + JSON next to script
    import csv, os
    d = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(d, "whakapapa_obs.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["ts", "dir", "speed_kt", "gust_kt", "temp_c"])
        w.writeheader(); w.writerows(s)
    with open(os.path.join(d, "whakapapa_obs.json"), "w") as f:
        json.dump(data, f, indent=2)
    print("wrote whakapapa_obs.csv and whakapapa_obs.json")
