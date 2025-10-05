import os
import json
import random
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Any
import threading

import requests
from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS

# ------------------------
# App setup
# ------------------------
app = Flask(__name__, static_folder="static")
CORS(app)

NASA_API_KEY = os.getenv("NASA_API_KEY", "DEMO_KEY")
DATA_FILE = "meteors.json"
UPDATE_INTERVAL_MINUTES = 60  # Periodic refresh interval

# ------------------------
# Helpers
# ------------------------
def _fake_coords(seed: str):
    """Deterministic fake lat/lon from an id (keeps impact points stable)."""
    h = int(hashlib.sha256(seed.encode()).hexdigest(), 16)
    lat = (h % 180) - 90
    lon = ((h // 180) % 360) - 180
    return {"lat": round(lat * 0.8, 3), "lon": round(lon * 0.8, 3)}

def _image_url():
    """Random but relevant image."""
    q = random.choice(["asteroid", "meteor", "space rock", "comet", "cosmos"])
    return f"https://source.unsplash.com/800x500/?{q}"

def _risk_from_miss_km(miss_km: float) -> str:
    if miss_km <= 50000:
        return "↑ High"
    if miss_km <= 500000:
        return "Moderate"
    return "Low"

# ------------------------
# NASA API Fetchers
# ------------------------
def fetch_nasa_neows() -> Dict[str, Any]:
    url = f"https://api.nasa.gov/neo/rest/v1/feed?api_key={NASA_API_KEY}"
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    return r.json()

def fetch_nasa_browse(year: int) -> Dict[str, Any]:
    """Fetch first page from NASA Browse API."""
    url = f"https://api.nasa.gov/neo/rest/v1/neo/browse?api_key={NASA_API_KEY}"
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    return r.json()

# ------------------------
# Data Conversion
# ------------------------
def convert_to_frontend_schema(nasa_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for date, objs in nasa_data.get("near_earth_objects", {}).items():
        for obj in objs:
            neo_id = str(obj.get("id"))
            name = obj.get("name", "Unknown")
            meters = obj.get("estimated_diameter", {}).get("meters", {})
            dmin = float(meters.get("estimated_diameter_min", 0))
            dmax = float(meters.get("estimated_diameter_max", 0))
            diameter_m = round((dmin + dmax) / 2, 1) if (dmin or dmax) else 0.0
            approach = (obj.get("close_approach_data") or [{}])[0]
            vel_kph = float(approach.get("relative_velocity", {}).get("kilometers_per_hour", 0.0))
            miss_km = float(approach.get("miss_distance", {}).get("kilometers", 0.0))
            velocity_km_s = round(vel_kph / 3600.0, 2) if vel_kph else 0.0
            impact_point_2d = _fake_coords(neo_id)
            trajectory_3d = {
                "start_lat": impact_point_2d["lat"] + random.uniform(-8, 8),
                "start_lon": impact_point_2d["lon"] + random.uniform(-8, 8),
                "end_lat": impact_point_2d["lat"],
                "end_lon": impact_point_2d["lon"],
            }
            results.append({
                "id": neo_id,
                "name": name,
                "image_url": _image_url(),
                "diameter": f"{diameter_m} m",
                "velocity_km_s": velocity_km_s,
                "impact_risk": _risk_from_miss_km(miss_km),
                "impact_point_2d": impact_point_2d,
                "trajectory_3d": trajectory_3d,
                "date": date,
                "miss_distance_km": round(miss_km, 0),
            })
    random.shuffle(results)
    return results

def convert_browse_to_frontend_schema(nasa_data: Dict[str, Any], target_year: int) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for obj in nasa_data.get("near_earth_objects", []):
        close_approaches = obj.get("close_approach_data", [])
        year_matches = [ca for ca in close_approaches if ca.get("close_approach_date", "").startswith(str(target_year))]
        if not year_matches:
            continue
        approach = year_matches[0]
        neo_id = str(obj.get("id"))
        name = obj.get("name", "Unknown")
        meters = obj.get("estimated_diameter", {}).get("meters", {})
        dmin = float(meters.get("estimated_diameter_min", 0))
        dmax = float(meters.get("estimated_diameter_max", 0))
        diameter_m = round((dmin + dmax) / 2, 1) if (dmin or dmax) else 0.0
        vel_kph = float(approach.get("relative_velocity", {}).get("kilometers_per_hour", 0.0))
        miss_km = float(approach.get("miss_distance", {}).get("kilometers", 0.0))
        approach_date = approach.get("close_approach_date", "Unknown")
        velocity_km_s = round(vel_kph / 3600.0, 2) if vel_kph else 0.0
        impact_point_2d = _fake_coords(neo_id + str(target_year))
        trajectory_3d = {
            "start_lat": impact_point_2d["lat"] + random.uniform(-8, 8),
            "start_lon": impact_point_2d["lon"] + random.uniform(-8, 8),
            "end_lat": impact_point_2d["lat"],
            "end_lon": impact_point_2d["lon"],
        }
        results.append({
            "id": neo_id,
            "name": name,
            "image_url": _image_url(),
            "diameter": f"{diameter_m} m",
            "velocity_km_s": velocity_km_s,
            "impact_risk": _risk_from_miss_km(miss_km),
            "impact_point_2d": impact_point_2d,
            "trajectory_3d": trajectory_3d,
            "date": approach_date,
            "miss_distance_km": round(miss_km, 0),
        })
    results.sort(key=lambda x: x.get("date", ""))
    return results

# ------------------------
# Local Storage Helpers
# ------------------------
def load_data() -> List[Dict[str, Any]]:
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    return []

def save_data(data: List[Dict[str, Any]]):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

def update_store() -> List[Dict[str, Any]]:
    nasa = fetch_nasa_neows()
    arr = convert_to_frontend_schema(nasa)
    save_data(arr)
    return arr

def browse_and_store(year: int) -> List[Dict[str, Any]]:
    nasa_data = fetch_nasa_browse(year)
    arr = convert_browse_to_frontend_schema(nasa_data, year)
    return arr

# Optional: Periodic background refresh of local JSON
def periodic_update():
    try:
        update_store()
    except Exception as e:
        print("Periodic update failed:", e)
    threading.Timer(UPDATE_INTERVAL_MINUTES * 60, periodic_update).start()

# ------------------------
# Routes
# ------------------------
@app.route("/api/meteors", methods=["GET"])
def api_meteors():
    if not os.path.exists(DATA_FILE):
        data = update_store()
    else:
        data = load_data()
    return jsonify(data)

@app.route("/api/update", methods=["POST"])
def api_update():
    try:
        data = update_store()
        return jsonify({"status": "ok", "count": len(data)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/browse/<int:year>", methods=["POST"])
def api_browse(year: int):
    try:
        if year < 1900 or year > 2030:
            return jsonify({"status": "error", "message": "Year must be between 1900 and 2030"}), 400
        data = browse_and_store(year)
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/status", methods=["GET"])
def api_status():
    exists = os.path.exists(DATA_FILE)
    last = datetime.fromtimestamp(os.path.getmtime(DATA_FILE)).isoformat() if exists else None
    return jsonify({"data_file_exists": exists, "last_update": last})

# Serve frontend
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(app.static_folder, path)

if __name__ == "__main__":
    # Start periodic refresh in background
    periodic_update()
    app.run(debug=True)
