#!/usr/bin/env python3
"""Rip observation data from Tekapo/Roundhill Predictwind stations.

This script fetches observations for Roundhill ski area from multiple
Predictwind stations in the Tekapo region: Tekapo Balmoral, Clayton, Burkes Pass.

Usage:
  ./roundhill_obs.py [station_name]

Where station_name is one of: tekapo-balmoral, clayton, burkes-pass
If omitted, fetches all stations.
"""
import json, re, sys, urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

ANCHOR = re.compile(r'^(\d{9,})([+-]\d+)([+-]\d+)d(-?\d+)s(-?\d+)g(-?\d+)t(-?\d+)$')
CONT   = re.compile(r'^(\d+)(?:d(-?\d+))?(?:s(-?\d+))?(?:g(-?\d+))?(?:t(-?\d+))?$')
KT_TO_KMH = 1.852

# Roundhill coordinates: -43.825421, 170.656220
# These stations are in the Tekapo area around Roundhill
STATIONS = {
  'tekapo-balmoral': { 'lat': -43.8, 'lon': 170.7, 'name': 'Tekapo Balmoral' },
  'clayton': { 'lat': -43.8, 'lon': 170.6, 'name': 'Clayton' },
  'burkes-pass': { 'lat': -43.85, 'lon': 170.65, 'name': 'Burkes Pass' },
}

def _merc(lat, lon, z):
    """Standard web-mercator tile coords."""
    import math
    n = 2 ** z
    mx = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    my = int((1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n)
    return n - my, mx

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

def search_for_station(station_name, lat, lon):
    """Search in a grid around the given coords for stations with the given name."""
    a0, b0 = _merc(lat, lon, 10)
    search_name = station_name.lower()

    for radius in range(0, 6):
        print(f"  Searching radius {radius} from tile ({a0},{b0})...", file=sys.stderr)
        for da in range(-radius, radius + 1):
            for db in range(-radius, radius + 1):
                if max(abs(da), abs(db)) != radius and radius > 0:
                    continue
                t = fetch_tile(a0 + da, b0 + db)
                if not t:
                    continue

                for track_id, track_data in t.get("tracks", {}).items():
                    meta = parse_meta(track_data.get("t", ""))
                    if meta["name"] and search_name in meta["name"].lower():
                        return track_id, meta

    return None, None

if __name__ == "__main__":
    import os, csv

    target_stations = sys.argv[1:] if len(sys.argv) > 1 else list(STATIONS.keys())

    for station_key in target_stations:
        if station_key not in STATIONS:
            print(f"Unknown station: {station_key}")
            continue

        station_info = STATIONS[station_key]
        print(f"\nSearching for: {station_info['name']} ({station_key})")

        track_id, meta = search_for_station(station_info['name'], station_info['lat'], station_info['lon'])

        if not track_id:
            print(f"  ✗ Station '{station_info['name']}' not found in Predictwind")
            print(f"    You may need to specify the track ID manually in the code")
            continue

        print(f"  ✓ Found track {track_id}")
        print(f"    Name: {meta['name']}, Elev: {meta['elev_m']}m")
        print(f"    Coords: ({meta['lat']}, {meta['lon']})")

        # Fetch the full data
        a0, b0 = _merc(meta['lat'], meta['lon'], 10)
        tr = None
        for radius in range(0, 4):
            for da in range(-radius, radius + 1):
                for db in range(-radius, radius + 1):
                    if max(abs(da), abs(db)) != radius and radius > 0:
                        continue
                    t = fetch_tile(a0 + da, b0 + db)
                    if t and track_id in t.get("tracks", {}):
                        tr = t["tracks"][track_id]
                        break
                if tr:
                    break
            if tr:
                break

        if not tr:
            print(f"  ✗ Could not fetch full data for {track_id}")
            continue

        series = decode_series(tr.get("s", ""))
        if not series:
            print(f"  ✗ No observation series found")
            continue

        last = series[-1]
        print(f"  Samples: {len(series)}, Span: {(series[-1]['ts']-series[0]['ts'])/3600:.1f}h")
        print(f"  Latest: {last['temp_c']:.1f}C, wind {last['speed_kt']:.1f}kt ({last['speed_kt']*KT_TO_KMH:.1f}km/h), gust {last['gust_kt']:.1f}kt")

        gmax = max(series, key=lambda r: r['gust_kt'])
        tmin = min(r['temp_c'] for r in series)
        tmax = max(r['temp_c'] for r in series)
        print(f"  24h max gust: {gmax['gust_kt']:.1f}kt ({gmax['gust_kt']*KT_TO_KMH:.1f}km/h)")
        print(f"  24h temp range: {tmin:.1f} .. {tmax:.1f}C")

        # Save CSV + JSON
        base = station_key.replace('-', '_')
        csv_file = os.path.join(os.path.dirname(__file__), f"roundhill_{base}_obs.csv")
        json_file = os.path.join(os.path.dirname(__file__), f"roundhill_{base}_obs.json")

        with open(csv_file, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["ts", "dir", "speed_kt", "gust_kt", "temp_c"])
            w.writeheader()
            w.writerows(series)

        with open(json_file, "w") as f:
            data = {"updated": t.get("updated"), "meta": meta, "series": series, "track_id": track_id}
            json.dump(data, f, indent=2)

        print(f"  Wrote {csv_file} and {json_file}")
