# 🔥 Fire TV Remote Pro

A tactile, ultra-fast smart remote control for **Amazon Fire TV** built with Python (FastAPI + pure ADB protocol) and a modern mobile-optimized Web / PWA interface.

Works from any smartphone (iPhone / Android) or computer browser on your local Wi-Fi without needing to install any third-party mobile apps from an app store.

---

## 🌟 Key Features

- **Directional D-Pad**: Circular navigation disc with Up, Down, Left, Right, and center **Select/OK** with tactile click animation and haptic vibration (`navigator.vibrate`).
- **Touch Trackpad**: Swipe navigation surface (Swipe Up/Down/Left/Right, Tap for OK, two-finger tap for Back).
- **Direct Keyboard & Text Input**: Type full sentences, search queries, passwords, and URLs from your phone or Mac keyboard and send them straight to your Fire TV in 1 click.
- **One-Tap Streaming App Launchers**: Instant shortcuts to YouTube, Netflix, Prime Video, Disney+, Spotify, Twitch, Hulu, Apple TV, Max, Plex, Kodi, and Fire TV Settings.
- **Auto Network Discovery**:
  - **mDNS / Zeroconf** (`_amzn-wplay._tcp.local.`, `_android-tv-remote._tcp.local.`)
  - **SSDP / UPnP / DIAL** M-SEARCH scan
  - **Asynchronous Subnet Port 5555 probe**
  - Instant manual IP input with "Remember Device" support
- **Instant Mobile Pairing**: Click the **Phone QR icon** in the top bar, scan the QR code with your phone camera, and immediately use your phone as a handheld remote!
- **Desktop Keyboard Shortcuts**:
  - **Arrow keys**: D-pad navigation
  - **Enter / Space**: Select / OK
  - **Esc / Backspace**: Back
  - **H**: Home
  - **M**: Menu
  - **P**: Play / Pause
  - **+ / -**: Volume Up / Down

---

## 🚀 Quick Start

### 1. Enable ADB Debugging on your Fire TV
1. Turn on your Fire TV.
2. Go to **Settings ⚙️ &rarr; My Fire TV &rarr; About**.
3. Highlight your Fire TV device name and press the center **Select button 7 times** until you see *"No need, you are already a developer"*.
4. Go back one screen to **My Fire TV**, select **Developer Options**, and turn **ADB Debugging &rarr; ON**.

### 2. Start the Remote Server
In your terminal:
```bash
cd /Users/naetikarvind/.gemini/antigravity/scratch/firetv-remote
./run.sh
```

### 3. Open the Remote
- **On your Mac**: Open [http://localhost:8000](http://localhost:8000)
- **On your iPhone / Android phone**: Open `http://<your-mac-ip>:8000` or simply click the **QR code icon** in the Mac browser and scan it with your phone's camera!

### 4. Authorize Connection on Fire TV
When connecting for the first time, your Fire TV will display an on-screen dialog:
> **Allow USB debugging?**
> The computer's RSA key fingerprint is: `...`
> ☑️ **Always allow from this computer**
> [OK]

Check **Always allow** and select **OK** using your physical remote. The web remote will immediately show **🟢 Connected**!

---

## 📁 Project Structure

```
firetv-remote/
├── app/
│   ├── main.py              # FastAPI server (REST & WebSocket endpoints)
│   ├── firetv_controller.py # ADB communication, keycodes, text input, app launches
│   ├── discovery.py         # mDNS, SSDP, and subnet port 5555 discovery
│   ├── storage.py           # Persistent configuration & saved devices
│   └── static/
│       ├── index.html       # Mobile-first PWA frontend
│       ├── style.css        # Premium home-theater dark UI
│       ├── app.js           # Touch gestures, haptics, shortcuts & socket
│       ├── manifest.json    # PWA install manifest
│       └── icons/
│           └── icon.svg     # SVG remote control icon
├── keys/                    # Auto-generated RSA keys for Fire TV ADB auth
├── config.json              # Saved devices & preferences
├── requirements.txt         # Python dependencies
└── run.sh                   # One-click startup script
```
