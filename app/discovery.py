import asyncio
import socket
import logging
import re
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger("firetv.discovery")

def get_local_ip() -> str:
    """Get the primary local IPv4 address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()

async def check_adb_port(ip: str, port: int = 5555, timeout: float = 0.6) -> Optional[str]:
    """Test if port 5555 is open on a target IP."""
    try:
        conn = asyncio.open_connection(ip, port)
        _, writer = await asyncio.wait_for(conn, timeout=timeout)
        writer.close()
        await writer.wait_closed()
        return ip
    except Exception:
        return None

async def scan_subnet_adb(subnet_prefix: str) -> List[str]:
    """Scan all 254 IPs on the subnet for open ADB port 5555."""
    tasks = [check_adb_port(f"{subnet_prefix}{i}") for i in range(1, 255)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if isinstance(r, str)]

def discover_ssdp(timeout: float = 2.0) -> List[Dict[str, Any]]:
    """Scan local network using SSDP / DIAL for Amazon Fire TV devices."""
    devices = []
    msearch = (
        'M-SEARCH * HTTP/1.1\r\n'
        'HOST: 239.255.255.250:1900\r\n'
        'MAN: "ssdp:discover"\r\n'
        'MX: 2\r\n'
        'ST: ssdp:all\r\n\r\n'
    ).encode('utf-8')

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    sock.settimeout(timeout)

    try:
        sock.sendto(msearch, ('239.255.255.250', 1900))
        while True:
            try:
                data, addr = sock.recvfrom(4096)
                text = data.decode('utf-8', errors='ignore')
                ip = addr[0]

                # Check if it looks like an Amazon device or DIAL
                is_firetv = any(k in text.lower() for k in ['amazon', 'firetv', 'aft', 'dial'])
                location_match = re.search(r'LOCATION:\s*(http://[^\r\n]+)', text, re.IGNORECASE)
                location = location_match.group(1).strip() if location_match else None

                if is_firetv or location:
                    devices.append({
                        "ip": ip,
                        "raw": text,
                        "location": location,
                        "is_firetv": is_firetv
                    })
            except socket.timeout:
                break
    except Exception as e:
        logger.warning(f"SSDP scan exception: {e}")
    finally:
        sock.close()

    return devices

async def parse_upnp_description(client: httpx.AsyncClient, dev: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Fetch UPnP XML description to get friendly device name."""
    if not dev.get("location"):
        return None
    try:
        resp = await client.get(dev["location"], timeout=1.5)
        if resp.status_code == 200:
            xml = resp.text
            # Simple regex search for friendlyName and modelName
            name_m = re.search(r'<friendlyName>(.*?)</friendlyName>', xml, re.IGNORECASE)
            model_m = re.search(r'<modelName>(.*?)</modelName>', xml, re.IGNORECASE)
            mfr_m = re.search(r'<manufacturer>(.*?)</manufacturer>', xml, re.IGNORECASE)

            friendly_name = name_m.group(1) if name_m else "Fire TV"
            model = model_m.group(1) if model_m else ""
            mfr = mfr_m.group(1) if mfr_m else ""

            is_amazon = "amazon" in (mfr + " " + model + " " + friendly_name).lower() or "aft" in model.lower()
            if is_amazon or dev.get("is_firetv"):
                return {
                    "ip": dev["ip"],
                    "name": friendly_name,
                    "model": model,
                    "manufacturer": mfr or "Amazon",
                    "discovery_method": "ssdp"
                }
    except Exception:
        pass
    return None

def discover_mdns(timeout: float = 2.0) -> List[Dict[str, Any]]:
    """Scan mDNS for Amazon / Android TV devices."""
    try:
        from zeroconf import Zeroconf, ServiceBrowser

        found = []

        class DeviceListener:
            def add_service(self, zc: Zeroconf, type_: str, name: str) -> None:
                info = zc.get_service_info(type_, name)
                if info and info.addresses:
                    friendly_name = None
                    if info.properties:
                        raw_n = info.properties.get(b'n') or info.properties.get('n') or info.properties.get(b'fn') or info.properties.get('fn')
                        if raw_n:
                            friendly_name = raw_n.decode('utf-8', errors='ignore') if isinstance(raw_n, bytes) else str(raw_n)

                    for addr in info.addresses:
                        ip = socket.inet_ntoa(addr)
                        dev_name = friendly_name or name.split('.')[0]
                        found.append({
                            "ip": ip,
                            "name": dev_name,
                            "service": type_,
                            "discovery_method": "mdns"
                        })

            def update_service(self, zc: Zeroconf, type_: str, name: str) -> None:
                pass

            def remove_service(self, zc: Zeroconf, type_: str, name: str) -> None:
                pass

        zc = Zeroconf()
        listener = DeviceListener()
        services = [
            "_amzn-wplay._tcp.local.",
            "_android-tv-remote._tcp.local.",
            "_adb._tcp.local."
        ]
        browsers = [ServiceBrowser(zc, s, listener) for s in services]
        import time
        time.sleep(timeout)
        zc.close()
        return found
    except Exception as e:
        logger.warning(f"mDNS scan error: {e}")
        return []

async def discover_all() -> List[Dict[str, Any]]:
    """
    Run mDNS, SSDP, and Subnet ADB port scans in parallel,
    merging and returning all discovered devices.
    """
    local_ip = get_local_ip()
    subnet_parts = local_ip.split('.')[:3]
    subnet_prefix = '.'.join(subnet_parts) + '.'

    # 1. Run subnet port 5555 scan
    # 2. Run SSDP in executor
    # 3. Run mDNS in executor
    loop = asyncio.get_running_loop()

    port_task = scan_subnet_adb(subnet_prefix)
    ssdp_task = loop.run_in_executor(None, discover_ssdp, 2.0)
    mdns_task = loop.run_in_executor(None, discover_mdns, 2.0)

    port_ips, ssdp_raw, mdns_devs = await asyncio.gather(
        port_task, ssdp_task, mdns_task, return_exceptions=True
    )

    devices_by_ip: Dict[str, Dict[str, Any]] = {}

    # Parse SSDP XML details
    if isinstance(ssdp_raw, list) and ssdp_raw:
        async with httpx.AsyncClient() as client:
            xml_tasks = [parse_upnp_description(client, dev) for dev in ssdp_raw]
            parsed = await asyncio.gather(*xml_tasks)
            for p in parsed:
                if p and p.get("ip"):
                    devices_by_ip[p["ip"]] = p

    # Process mDNS
    if isinstance(mdns_devs, list):
        for m in mdns_devs:
            ip = m["ip"]
            if ip not in devices_by_ip:
                devices_by_ip[ip] = {
                    "ip": ip,
                    "name": m.get("name", "Fire TV"),
                    "model": "Amazon Fire TV",
                    "discovery_method": "mdns"
                }

    # Process Port 5555 open devices (Most reliable for ADB control!)
    if isinstance(port_ips, list):
        for ip in port_ips:
            if ip in devices_by_ip:
                devices_by_ip[ip]["adb_available"] = True
            else:
                devices_by_ip[ip] = {
                    "ip": ip,
                    "name": f"Fire TV / Android ({ip})",
                    "model": "Fire OS / Android",
                    "adb_available": True,
                    "discovery_method": "port_scan"
                }

    device_list = list(devices_by_ip.values())
    # Sort with ADB-available devices first
    device_list.sort(key=lambda d: (not d.get("adb_available", False), d.get("ip", "")))
    return device_list
