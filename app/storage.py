import json
import os
from typing import Dict, Any, List

CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json")

DEFAULT_CONFIG: Dict[str, Any] = {
    "last_device": None,
    "saved_devices": [],
    "recent_apps": []
}

def load_config() -> Dict[str, Any]:
    if not os.path.exists(CONFIG_FILE):
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG.copy()
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {**DEFAULT_CONFIG, **data}
    except Exception:
        return DEFAULT_CONFIG.copy()

def save_config(config: Dict[str, Any]) -> None:
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        print(f"Failed to save config: {e}")

def get_saved_devices() -> List[Dict[str, Any]]:
    config = load_config()
    return config.get("saved_devices", [])

def add_saved_device(host: str, name: str = "", port: int = 5555) -> None:
    config = load_config()
    devices = config.get("saved_devices", [])
    # Update if exists, else append
    existing = next((d for d in devices if d.get("host") == host), None)
    if existing:
        existing["port"] = port
        if name:
            existing["name"] = name
    else:
        devices.append({
            "host": host,
            "port": port,
            "name": name or f"Fire TV ({host})"
        })
    config["saved_devices"] = devices
    config["last_device"] = {"host": host, "port": port}
    save_config(config)

def remove_saved_device(host: str) -> None:
    config = load_config()
    config["saved_devices"] = [d for d in config.get("saved_devices", []) if d.get("host") != host]
    if config.get("last_device") and config["last_device"].get("host") == host:
        config["last_device"] = None
    save_config(config)
