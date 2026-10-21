import asyncio
import os
import re
import socket
import logging
from typing import Optional, Dict, Any, List
from adb_shell.adb_device import AdbDeviceTcp
from adb_shell.auth.keygen import keygen
from adb_shell.auth.sign_cryptography import CryptographySigner
from adb_shell.exceptions import DeviceAuthError, TcpTimeoutException

logger = logging.getLogger("firetv.controller")

# Keycode mapping for Fire TV / Android
KEYCODES = {
    # Navigation
    "UP": 19,
    "DOWN": 20,
    "LEFT": 21,
    "RIGHT": 22,
    "SELECT": 23,
    "CENTER": 23,
    "OK": 23,
    "BACK": 4,
    "HOME": 3,
    "MENU": 82,

    # Audio
    "VOLUME_UP": 24,
    "VOLUME_DOWN": 25,
    "MUTE": 164,

    # Channels / TV
    "CHANNEL_UP": 166,
    "CHANNEL_DOWN": 167,
    "LIVE_TV": 170,
    "GUIDE": 172,
    "TV": 170,

    # Playback
    "PLAY": 126,
    "PAUSE": 127,
    "PLAY_PAUSE": 85,
    "REWIND": 89,
    "FAST_FORWARD": 90,
    "PREVIOUS": 88,
    "NEXT": 87,

    # Power
    "POWER": 26,
    "WAKE": 224,
    "SLEEP": 223,

    # Keyboard / Actions
    "ENTER": 66,
    "BACKSPACE": 67,
    "SPACE": 62,
    "SEARCH": 84,
    "ALEXA": 84,
    "VOICE": 84,
    "STAR": 176,
    "SETTINGS": 176,
    "SHORTCUT": 176,
}

# Linux evdev hardware keycodes for sub-100ms ultra-fast key injection
LINUX_EVDEV_KEYCODES = {
    "UP": 103,
    "DPAD_UP": 103,
    "DOWN": 108,
    "DPAD_DOWN": 108,
    "LEFT": 105,
    "DPAD_LEFT": 105,
    "RIGHT": 106,
    "DPAD_RIGHT": 106,
    "SELECT": 96,
    "CENTER": 96,
    "OK": 96,
    "DPAD_CENTER": 96,
    "BACK": 158,
    "HOME": 172,
    "MENU": 139,
    "VOLUME_UP": 115,
    "VOL_UP": 115,
    "VOLUME_DOWN": 114,
    "VOL_DOWN": 114,
    "MUTE": 113,
    "PLAY": 200,
    "PAUSE": 201,
    "PLAY_PAUSE": 164,
    "REWIND": 168,
    "FAST_FORWARD": 208,
    "POWER": 116,
    "ENTER": 28,
    "BACKSPACE": 14,
    "DEL": 14,
    "SPACE": 57,
    "ALEXA": 217,
    "SEARCH": 217,
    "STAR": 139,
    "SETTINGS": 139,
}

POPULAR_APPS = [
    {"id": "netflix", "name": "Netflix", "package": "com.netflix.ninja", "color": "#E50914", "icon": "/icons/apps/netflix.png"},
    {"id": "youtube", "name": "YouTube", "package": "com.amazon.firetv.youtube", "fallback": "com.google.android.youtube.tv", "color": "#FF0000", "icon": "/icons/apps/youtube.png"},
    {"id": "zee5", "name": "ZEE5", "package": "com.graymatrix.did", "color": "#18181C", "icon": "/icons/apps/zee5.png"},
    {"id": "sonyliv", "name": "Sony LIV", "package": "com.sonyliv", "color": "#0C1020", "icon": "/icons/apps/sonyliv.png"},
    {"id": "prime_video", "name": "Prime Video", "package": "com.amazon.avod", "color": "#00A8E1", "icon": "/icons/apps/prime_video.png"},
    {"id": "disney", "name": "Disney+", "package": "com.disney.disneyplus", "color": "#113CCF", "icon": "/icons/apps/disney.png"},
    {"id": "spotify", "name": "Spotify", "package": "com.spotify.tv.android", "color": "#1DB954", "icon": "/icons/apps/spotify.png"},
    {"id": "twitch", "name": "Twitch", "package": "tv.twitch.android.app", "color": "#9146FF", "icon": "/icons/apps/twitch.png"},
    {"id": "hulu", "name": "Hulu", "package": "com.hulu.plus", "color": "#1CE783", "icon": "/icons/apps/hulu.png"},
    {"id": "apple_tv", "name": "Apple TV", "package": "com.apple.atve.amazon.appletv", "color": "#1A1A1A", "icon": "/icons/apps/apple_tv.png"},
    {"id": "max", "name": "Max", "package": "com.wbd.stream", "color": "#002BE7", "icon": "/icons/apps/max.png"},
    {"id": "crunchyroll", "name": "Crunchyroll", "package": "com.crunchyroll.crunchyroid", "color": "#F47521", "icon": "/icons/apps/crunchyroll.png"},
    {"id": "paramount", "name": "Paramount+", "package": "com.cbs.app", "color": "#0064FF", "icon": "/icons/apps/paramount.png"},
    {"id": "peacock", "name": "Peacock", "package": "com.peacocktv.peacockandroid", "color": "#0D1117", "icon": "/icons/apps/peacock.png"},
    {"id": "plex", "name": "Plex", "package": "com.plexapp.android", "color": "#E5A00D", "icon": "/icons/apps/plex.png"},
    {"id": "kodi", "name": "Kodi", "package": "org.xbmc.kodi", "color": "#17B2E7", "icon": "/icons/apps/kodi.png"},
    {"id": "downloader", "name": "Downloader", "package": "info.androidtv.downloader", "fallback": "com.esaba.downloader", "color": "#FF6600", "icon": "/icons/apps/downloader.png"},
    {"id": "silk", "name": "Silk Browser", "package": "com.amazon.cloud9", "color": "#00A4B4", "icon": "/icons/apps/silk.png"},
    {"id": "settings", "name": "Settings", "action": "android.settings.SETTINGS", "color": "#5A6270", "icon": "/icons/apps/settings_v2.png"},
]

def sanitize_adb_text(text: str) -> str:
    """Escape text safely for Android input text command."""
    safe = ""
    for ch in text:
        if ch == " ":
            safe += "%s"
        elif ch in ['\\', '$', '`', '"', "'", '&', '<', '>', '(', ')', ';', '|', '*', '?', '~']:
            safe += f"\\{ch}"
        else:
            safe += ch
    return safe

class FireTVController:
    def __init__(self, key_dir: Optional[str] = None):
        if not key_dir:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            key_dir = os.path.join(base_dir, "keys")
        self.key_dir = key_dir
        os.makedirs(self.key_dir, exist_ok=True)

        self.priv_key_path = os.path.join(self.key_dir, "adbkey")
        self._ensure_keys()
        self.signer = CryptographySigner(self.priv_key_path)

        self.device: Optional[AdbDeviceTcp] = None
        self.host: Optional[str] = None
        self.port: int = 5555

        self.state: str = "disconnected"  # disconnected, connecting, unauthorized, connected, error
        self.last_error: str = ""
        self.device_info: Dict[str, Any] = {}
        self.input_device_path: Optional[str] = None
        self._input_device_checked: bool = False
        self._lock = asyncio.Lock()
        self._key_lock = asyncio.Lock()
        self._screenshot_lock = asyncio.Lock()
        self._monitor_task: Optional[asyncio.Task] = None

    def _ensure_keys(self) -> None:
        """Generate ADB RSA keypair if missing."""
        if not os.path.exists(self.priv_key_path):
            logger.info(f"Generating new ADB RSA keypair in {self.key_dir}...")
            keygen(self.priv_key_path)

    def _detect_input_device_unlocked(self) -> None:
        """Detect the hardware input event device for sub-100ms key events (exits cleanly without hanging)."""
        if not self.device or self._input_device_checked:
            return
        self._input_device_checked = True
        try:
            # Use getevent -lp which lists devices and exits immediately (unlike getevent -S)
            out = self.device.shell("getevent -lp")
            lines = out.split("\n")
            cur_path = None
            for line in lines:
                m_dev = re.search(r'(/dev/input/event\d+)', line)
                if m_dev:
                    cur_path = m_dev.group(1)
                if ('amzkeyboard' in line or 'Amazon Remote' in line) and cur_path:
                    self.input_device_path = cur_path
                    logger.info(f"Fast hardware input detected at {self.input_device_path}")
                    break
        except Exception as e:
            logger.warning(f"Could not detect fast hardware input device: {e}")

    async def connect(self, host: str, port: int = 5555, timeout: float = 3.0) -> Dict[str, Any]:
        """Connect to Fire TV over ADB."""
        async with self._lock:
            # If already connected to this host
            if self.device and self.host == host and self.port == port and self.state == "connected":
                if not self.input_device_path:
                    self._detect_input_device_unlocked()
                return self.get_status()

            # Close existing connection if any
            self._disconnect_unlocked()

            self.host = host
            self.port = port
            self.state = "connecting"
            self.last_error = ""

            loop = asyncio.get_running_loop()
            auth_prompt_shown = False

            def _on_auth_callback(io_mgr):
                nonlocal auth_prompt_shown
                auth_prompt_shown = True

            def _do_connect():
                dev = AdbDeviceTcp(host, port, default_transport_timeout_s=timeout)
                dev.connect(
                    rsa_keys=[self.signer],
                    transport_timeout_s=timeout,
                    auth_timeout_s=2.0,
                    auth_callback=_on_auth_callback
                )
                return dev

            try:
                self.device = await loop.run_in_executor(None, _do_connect)
                self.state = "connected"
                self.last_error = ""
                # Query basic info and detect fast input device
                await self._refresh_info_unlocked()
                self._detect_input_device_unlocked()
            except DeviceAuthError:
                self.state = "unauthorized"
                self.last_error = "Please check your Fire TV screen and select 'Always allow from this computer', then tap OK on your remote."
                logger.warning(f"Device {host}:{port} is unauthorized. Prompt displayed on TV.")
            except (ConnectionRefusedError, socket.timeout, TcpTimeoutException, OSError) as e:
                if auth_prompt_shown:
                    self.state = "unauthorized"
                    self.last_error = "Please check your Fire TV screen and select 'Always allow from this computer', then tap OK on your remote."
                    logger.warning(f"Device {host}:{port} prompt displayed on TV screen, waiting for user confirmation.")
                else:
                    self.state = "error"
                    if isinstance(e, ConnectionRefusedError):
                        self.last_error = (
                            f"Connection refused at {host}:{port}. ADB Debugging might be turned off.\n"
                            "On your Fire TV, go to: Settings -> My Fire TV -> Developer Options -> Turn ON 'ADB Debugging'."
                        )
                    else:
                        self.last_error = f"Could not reach {host}:{port}. Verify the Fire TV is powered on and connected to the same Wi-Fi."
                    logger.error(f"Failed to connect to {host}:{port}: {e}")
            except Exception as e:
                self.state = "error"
                self.last_error = str(e)
                logger.error(f"Unexpected connection error for {host}:{port}: {e}")

            return self.get_status()

    def _disconnect_unlocked(self) -> None:
        """Internal helper to close socket and reset state."""
        if self.device:
            try:
                self.device.close()
            except Exception:
                pass
            self.device = None
        self.state = "disconnected"
        self.input_device_path = None
        self.device_info = {}

    async def disconnect(self) -> Dict[str, Any]:
        """Disconnect from Fire TV."""
        async with self._lock:
            self._disconnect_unlocked()
            self.host = None
            self.last_error = ""
            return self.get_status()

    async def send_key(self, key: str | int) -> Dict[str, Any]:
        """Send a key with sub-50ms ultra-low latency."""
        if not self.device or self.state != "connected":
            return {"success": False, "error": "Not connected to Fire TV", "state": self.state}

        key_str = str(key).upper().replace(" ", "_")
        keycode = KEYCODES.get(key_str, key) if isinstance(key, str) else key
        loop = asyncio.get_running_loop()

        # If fast hardware event device is available
        if self.input_device_path and key_str in LINUX_EVDEV_KEYCODES:
            ev_code = LINUX_EVDEV_KEYCODES[key_str]
            cmd = (
                f"sendevent {self.input_device_path} 1 {ev_code} 1; "
                f"sendevent {self.input_device_path} 0 0 0; "
                f"sendevent {self.input_device_path} 1 {ev_code} 0; "
                f"sendevent {self.input_device_path} 0 0 0"
            )
            is_fast = True
        else:
            # Asynchronous execution in Android shell:
            # Spawns input keyevent in background without blocking ADB channel on JVM shutdown!
            cmd = f"input keyevent {keycode} &"
            is_fast = True

        async with self._key_lock:
            try:
                await loop.run_in_executor(None, self.device.shell, cmd)
                return {"success": True, "key": key, "keycode": keycode, "fast": is_fast}
            except Exception as e:
                logger.error(f"Error sending key {key}: {e}")
                return {"success": False, "error": str(e)}

    async def send_text(self, text: str) -> Dict[str, Any]:
        """Type text into active input field on Fire TV."""
        async with self._lock:
            if not self.device or self.state != "connected":
                return {"success": False, "error": "Not connected to Fire TV"}

            safe_str = sanitize_adb_text(text)
            loop = asyncio.get_running_loop()
            try:
                cmd = f"input text {safe_str}"
                await loop.run_in_executor(None, self.device.shell, cmd)
                return {"success": True, "text": text}
            except Exception as e:
                logger.error(f"Error sending text: {e}")
                return {"success": False, "error": str(e)}

    async def launch_app(self, app_id_or_package: str) -> Dict[str, Any]:
        """Launch a streaming app or Android intent."""
        async with self._lock:
            if not self.device or self.state != "connected":
                return {"success": False, "error": "Not connected to Fire TV"}

            # Check if it matches popular apps
            target = next((a for a in POPULAR_APPS if a["id"] == app_id_or_package or a.get("package") == app_id_or_package), None)

            loop = asyncio.get_running_loop()
            try:
                if target and target.get("action"):
                    cmd = f"am start -a {target['action']}"
                elif target and target.get("package"):
                    pkg = target["package"]
                    # Monkey launcher works universally without needing the activity class name
                    cmd = f"monkey -p {pkg} -c android.intent.category.LAUNCHER 1"
                    if target.get("fallback"):
                        cmd += f" || monkey -p {target['fallback']} -c android.intent.category.LAUNCHER 1"
                else:
                    # Custom package name
                    cmd = f"monkey -p {app_id_or_package} -c android.intent.category.LAUNCHER 1"

                output = await loop.run_in_executor(None, self.device.shell, cmd)
                return {"success": True, "target": app_id_or_package, "output": output}
            except Exception as e:
                logger.error(f"Error launching app {app_id_or_package}: {e}")
                return {"success": False, "error": str(e)}

    async def _refresh_info_unlocked(self) -> None:
        """Refresh device properties, wake state, and foreground app."""
        if not self.device:
            return
        loop = asyncio.get_running_loop()
        try:
            # Query model, build, wakefulness in one combined shell command for speed
            cmd = (
                "echo '===MODEL==='; getprop ro.product.model; "
                "echo '===BUILD==='; getprop ro.build.version.release; "
                "echo '===POWER==='; dumpsys power | grep -m 1 mWakefulness; "
                "echo '===FOCUS==='; dumpsys window | grep -m 1 -E 'mCurrentFocus|mFocusedApp'"
            )
            raw = await loop.run_in_executor(None, self.device.shell, cmd)

            info: Dict[str, Any] = {}
            parts = raw.split("===")
            for part in parts:
                lines = part.strip().split("\n")
                section = lines[0].replace("=", "").strip()
                content = "\n".join(lines[1:]).strip() if len(lines) > 1 else ""

                if section == "MODEL":
                    info["model"] = content or "Amazon Fire TV"
                elif section == "BUILD":
                    info["android_version"] = content
                elif section == "POWER":
                    info["is_awake"] = "Awake" in content
                elif section == "FOCUS":
                    match = re.search(r'([a-zA-Z0-9_.]+\/[a-zA-Z0-9_.]+)', content)
                    info["current_app"] = match.group(1).split('/')[0] if match else "Home"

            self.device_info = info
        except Exception as e:
            logger.warning(f"Could not refresh device info: {e}")

    async def get_device_info(self) -> Dict[str, Any]:
        """Fetch updated device information."""
        async with self._lock:
            if self.device and self.state == "connected":
                await self._refresh_info_unlocked()
            return self.device_info

    async def take_screenshot(self) -> Optional[bytes]:
        """Capture screenshot from Fire TV as PNG bytes."""
        async with self._screenshot_lock:
            if not self.device or self.state != "connected":
                return None
            loop = asyncio.get_running_loop()
            try:
                raw = await loop.run_in_executor(
                    None,
                    lambda: self.device.shell("screencap -p", decode=False)
                )
                if not raw or len(raw) < 100:
                    return None

                # Locate PNG magic header
                idx = raw.find(b'\x89PNG\r\n\x1a\n')
                if idx != -1:
                    return raw[idx:]
                # Some adb daemons replace \n with \r\n
                fixed = raw.replace(b'\r\n', b'\n')
                idx = fixed.find(b'\x89PNG\r\n\x1a\n')
                if idx != -1:
                    return fixed[idx:]
                return raw if raw.startswith(b'\x89PNG') else None
            except Exception as e:
                logger.error(f"Screenshot capture failed: {e}")
                return None

    def get_status(self) -> Dict[str, Any]:
        """Get instant snapshot of controller state."""
        return {
            "state": self.state,
            "host": self.host,
            "port": self.port,
            "last_error": self.last_error,
            "info": self.device_info,
            "device_name": "Arvind's FireTVStick",
            "apps": POPULAR_APPS
        }
