import asyncio
import io
import os
import qrcode
import qrcode.image.svg
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.firetv_controller import FireTVController, POPULAR_APPS
from app.discovery import discover_all, get_local_ip
from app.storage import load_config, save_config, get_saved_devices, add_saved_device, remove_saved_device

app = FastAPI(title="Fire TV Remote Pro", version="1.0.0")

# Allow CORS for seamless local network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

controller = FireTVController()

# Active WebSocket connections
active_connections: List[WebSocket] = []

async def broadcast_status():
    """Broadcast current controller status to all connected WebSockets."""
    status = controller.get_status()
    disconnected = []
    for ws in active_connections:
        try:
            await ws.send_json({"type": "status", "data": status})
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        if ws in active_connections:
            active_connections.remove(ws)

# Models
class ConnectRequest(BaseModel):
    host: str
    port: int = 5555
    name: Optional[str] = None
    save: bool = True

class KeyRequest(BaseModel):
    key: str

class TextRequest(BaseModel):
    text: str

class AppLaunchRequest(BaseModel):
    app: str

class SaveDeviceRequest(BaseModel):
    host: str
    name: str = ""
    port: int = 5555

# API Endpoints
@app.get("/api/status")
async def get_status():
    return controller.get_status()

@app.post("/api/connect")
async def connect_device(req: ConnectRequest):
    result = await controller.connect(req.host, req.port)
    if result["state"] == "connected" and req.save:
        add_saved_device(req.host, req.name or result.get("info", {}).get("model", ""), req.port)
    await broadcast_status()
    return result

@app.post("/api/disconnect")
async def disconnect_device():
    result = await controller.disconnect()
    await broadcast_status()
    return result

@app.post("/api/key")
async def send_key(req: KeyRequest):
    result = await controller.send_key(req.key)
    return result

@app.post("/api/text")
async def send_text(req: TextRequest):
    result = await controller.send_text(req.text)
    return result

@app.post("/api/app/launch")
async def launch_app(req: AppLaunchRequest):
    result = await controller.launch_app(req.app)
    # Refresh info to detect current app change
    await controller.get_device_info()
    await broadcast_status()
    return result

@app.get("/api/apps")
async def get_apps():
    return POPULAR_APPS

@app.get("/api/discover")
async def discover_devices():
    devices = await discover_all()
    return {"devices": devices}

@app.get("/api/saved-devices")
async def list_saved_devices():
    return get_saved_devices()

@app.get("/api/check-adb/{ip}")
async def check_adb_status(ip: str):
    from app.discovery import check_adb_port
    res = await check_adb_port(ip, port=5555, timeout=1.0)
    return {"ip": ip, "adb_open": bool(res)}

@app.post("/api/saved-devices")
async def add_device(req: SaveDeviceRequest):
    add_saved_device(req.host, req.name, req.port)
    return {"success": True, "saved_devices": get_saved_devices()}

@app.delete("/api/saved-devices/{host}")
async def delete_saved_device(host: str):
    remove_saved_device(host)
    return {"success": True, "saved_devices": get_saved_devices()}

@app.get("/api/server-info")
async def get_server_info():
    local_ip = get_local_ip()
    port = 8000
    mobile_url = f"http://{local_ip}:{port}"
    config = load_config()
    return {
        "local_ip": local_ip,
        "port": port,
        "mobile_url": mobile_url,
        "last_device": config.get("last_device")
    }

@app.get("/api/qr")
async def get_qr_code():
    local_ip = get_local_ip()
    url = f"http://{local_ip}:8000"
    qr = qrcode.QRCode(
        image_factory=qrcode.image.svg.SvgPathImage,
        box_size=10,
        border=2
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image()
    svg_data = img.to_string()
    return Response(content=svg_data, media_type="image/svg+xml")

@app.get("/api/screenshot")
async def get_screenshot():
    img_bytes = await controller.take_screenshot()
    if not img_bytes:
        raise HTTPException(status_code=503, detail="Screenshot unavailable or device not connected")
    return Response(
        content=img_bytes,
        media_type="image/png",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate, max-age=0"}
    )

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    # Send initial status
    await websocket.send_json({"type": "status", "data": controller.get_status()})
    try:
        while True:
            data = await websocket.receive_json()
            # Clients can also send key events over websocket for lowest possible latency!
            msg_type = data.get("type")
            if msg_type == "key":
                key = data.get("key")
                if key:
                    asyncio.create_task(controller.send_key(key))
            elif msg_type == "text":
                text = data.get("text")
                if text:
                    await controller.send_text(text)
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)
    except Exception:
        if websocket in active_connections:
            active_connections.remove(websocket)

# Auto-reconnect background task on startup if a device was previously saved
@app.on_event("startup")
async def startup_event():
    config = load_config()
    last = config.get("last_device")
    if last and last.get("host"):
        logger_name = "firetv.startup"
        print(f"[{logger_name}] Found previously connected device: {last['host']}. Auto-connecting in background...")
        asyncio.create_task(controller.connect(last["host"], last.get("port", 5555)))

# Mount static folder
static_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
