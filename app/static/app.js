// Fire TV Remote Pro - Client Application & Smart Length Sizer Engine
// Strictly modeled after official Amazon Fire TV Mobile App
(() => {
  // State
  let ws = null;
  let isWsConnected = false;
  let currentState = "disconnected";
  let connectedDevice = null;
  let pollInterval = null;
  let vibrationEnabled = localStorage.getItem("firetv_vibration") !== "false";
  let currentControllerMode = localStorage.getItem("firetv_controller_mode") || "dpad";
  let currentDrawerTab = "apps";

  // DOM Elements - Top Bar
  const sleepBtn = document.getElementById("sleepBtn");
  const deviceBarBtn = document.getElementById("deviceBarBtn");
  const headerDeviceName = document.getElementById("headerDeviceName");
  const dotsMenuBtn = document.getElementById("dotsMenuBtn");

  // DOM Elements - Controller & Satellites
  const slidersSettingsBtn = document.getElementById("slidersSettingsBtn");
  const openKeyboardBtn = document.getElementById("openKeyboardBtn");
  const controllerWrapper = document.getElementById("controllerWrapper");
  const dpadController = document.getElementById("dpadController");
  const trackpadController = document.getElementById("trackpadController");
  const fireTrackpadSurface = document.getElementById("fireTrackpadSurface");

  // DOM Elements - Bottom Drawer
  const drawerTabBtns = document.querySelectorAll(".drawer-tab-btn");
  const drawerTabMedia = document.getElementById("drawerTabMedia");
  const drawerTabApps = document.getElementById("drawerTabApps");
  const drawerTabChannels = document.getElementById("drawerTabChannels");
  const drawerAppsRow = document.getElementById("drawerAppsRow");
  const appsGrid = document.getElementById("appsGrid");
  const customPackageInput = document.getElementById("customPackageInput");
  const launchCustomBtn = document.getElementById("launchCustomBtn");

  // DOM Elements - Compatibility / Status
  const statusBtn = document.getElementById("statusBtn");
  const statusText = document.getElementById("statusText");
  const deviceAlertsBtn = document.getElementById("deviceAlertsBtn");
  const devicePillText = document.getElementById("devicePillText");
  const deviceAlertBadge = document.getElementById("deviceAlertBadge");
  const desktopModeBtn = document.getElementById("desktopModeBtn");
  const powerBtn = document.getElementById("powerBtn");
  const mobileQrBtn = document.getElementById("mobileQrBtn");
  const helpBtn = document.getElementById("helpBtn");

  // DOM Elements - Device Status Modal
  const deviceBar = document.getElementById("deviceBar");
  const deviceModel = document.getElementById("deviceModel");
  const deviceApp = document.getElementById("deviceApp");
  const noDeviceCard = document.getElementById("noDeviceCard");
  const connectDeviceBtn = document.getElementById("connectDeviceBtn");
  const disconnectBtn = document.getElementById("disconnectBtn");
  const scanFromStatusBtn = document.getElementById("scanFromStatusBtn");
  const changeDeviceBtn = document.getElementById("changeDeviceBtn");
  const authAlert = document.getElementById("authAlert");
  const authRetryBtn = document.getElementById("authRetryBtn");
  const adbAlert = document.getElementById("adbAlert");
  const adbAlertTitle = document.getElementById("adbAlertTitle");
  const adbPollStatus = document.getElementById("adbPollStatus");
  const showGuideBtn = document.getElementById("showGuideBtn");
  let adbWatcherInterval = null;

  // DOM Elements - Modals
  const remoteSettingsModal = document.getElementById("remoteSettingsModal");
  const closeRemoteSettingsBtn = document.getElementById("closeRemoteSettingsBtn");
  const moreRemoteSettingsLink = document.getElementById("moreRemoteSettingsLink");
  const tvControlSetupBtn = document.getElementById("tvControlSetupBtn");
  const radioDpad = document.getElementById("radioDpad");
  const radioTrackpad = document.getElementById("radioTrackpad");
  const optionDpad = document.getElementById("optionDpad");
  const optionTrackpad = document.getElementById("optionTrackpad");
  const vibrationToggle = document.getElementById("vibrationToggle");

  const keyboardModal = document.getElementById("keyboardModal");
  const closeKeyboardModal = document.getElementById("closeKeyboardModal");
  const textInput = document.getElementById("textInput");
  const sendTextBtn = document.getElementById("sendTextBtn");
  const clearTextBtn = document.getElementById("clearTextBtn");

  const dotsMenuModal = document.getElementById("dotsMenuModal");
  const closeDotsMenuBtn = document.getElementById("closeDotsMenuBtn");
  const dotsConnectBtn = document.getElementById("dotsConnectBtn");
  const dotsDesktopBtn = document.getElementById("dotsDesktopBtn");
  const dotsQrBtn = document.getElementById("dotsQrBtn");
  const dotsHelpBtn = document.getElementById("dotsHelpBtn");
  const dotsDisconnectBtn = document.getElementById("dotsDisconnectBtn");

  const deviceStatusModal = document.getElementById("deviceStatusModal");
  const closeDeviceStatusModal = document.getElementById("closeDeviceStatusModal");
  const deviceModal = document.getElementById("deviceModal");
  const closeDeviceModal = document.getElementById("closeDeviceModal");
  const scanBtn = document.getElementById("scanBtn");
  const scanBtnText = document.getElementById("scanBtnText");
  const discoveredList = document.getElementById("discoveredList");
  const manualConnectForm = document.getElementById("manualConnectForm");
  const manualIpInput = document.getElementById("manualIpInput");
  const manualPortInput = document.getElementById("manualPortInput");
  const savedList = document.getElementById("savedList");

  const qrModal = document.getElementById("qrModal");
  const closeQrModal = document.getElementById("closeQrModal");
  const qrContainer = document.getElementById("qrContainer");
  const qrUrlInput = document.getElementById("qrUrlInput");
  const copyUrlBtn = document.getElementById("copyUrlBtn");

  const helpModal = document.getElementById("helpModal");
  const closeHelpModal = document.getElementById("closeHelpModal");
  const gotItBtn = document.getElementById("gotItBtn");

  // TV Monitor Elements (Desktop Studio Mode)
  const studioTvMonitor = document.getElementById("studioTvMonitor");
  const tvScreenFrame = document.getElementById("tvScreenFrame");
  const tvScreenImg = document.getElementById("tvScreenImg");
  const tvScreenPlaceholder = document.getElementById("tvScreenPlaceholder");
  const tvLiveDot = document.getElementById("tvLiveDot");
  const tvStatusLabel = document.getElementById("tvStatusLabel");
  const tvRefreshBtn = document.getElementById("tvRefreshBtn");
  const tvLiveSyncBtn = document.getElementById("tvLiveSyncBtn");
  const tvLiveSyncText = document.getElementById("tvLiveSyncText");
  const tvFullscreenBtn = document.getElementById("tvFullscreenBtn");
  const tvConnectPromptBtn = document.getElementById("tvConnectPromptBtn");

  // ----------------------------------------------------
  // Haptic Vibration Feedback
  // ----------------------------------------------------
  function triggerHaptic(duration = 15) {
    if (vibrationEnabled && "vibrate" in navigator) {
      try {
        navigator.vibrate(duration);
      } catch (e) {}
    }
  }

  // ----------------------------------------------------
  // 1. SMART LENGTH ENGINE (Dynamic Adaptive Geometry)
  // ----------------------------------------------------
  const SmartLengthEngine = {
    rafId: null,

    init() {
      this.update = this.update.bind(this);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", this.requestUpdate.bind(this));
        window.visualViewport.addEventListener("scroll", this.requestUpdate.bind(this));
      }
      window.addEventListener("resize", this.requestUpdate.bind(this));
      window.addEventListener("orientationchange", this.requestUpdate.bind(this));

      const appEl = document.getElementById("app");
      if (window.ResizeObserver && appEl) {
        const ro = new ResizeObserver(() => this.requestUpdate());
        ro.observe(appEl);
      }

      this.update();
    },

    requestUpdate() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(() => {
        this.update();
      });
    },

    update() {
      const vv = window.visualViewport;
      const viewportHeight = vv ? Math.round(vv.height) : window.innerHeight;
      const viewportWidth  = vv ? Math.round(vv.width)  : window.innerWidth;

      document.documentElement.style.setProperty("--app-actual-height", `${viewportHeight}px`);
      document.documentElement.style.setProperty("--app-actual-width",  `${viewportWidth}px`);

      const isDesktop = document.body.classList.contains("desktop-studio-active");
      const isLandscapePhone = viewportWidth > viewportHeight && viewportHeight <= 540;

      // Calculate available height for stage
      const topBarH = 50;
      const drawerH = 100;
      const netStageH = Math.max(260, viewportHeight - topBarH - drawerH - 24);

      let dpadSize, satSize;
      if (isDesktop) {
        dpadSize = Math.max(180, Math.min(265, Math.round(netStageH * 0.58)));
        satSize = Math.max(46, Math.min(56, Math.round(dpadSize * 0.22)));
      } else if (isLandscapePhone) {
        dpadSize = Math.max(140, Math.min(190, Math.round(viewportHeight * 0.50)));
        satSize = Math.max(40, Math.min(48, Math.round(dpadSize * 0.24)));
      } else if (netStageH < 380) {
        dpadSize = Math.max(170, Math.min(220, Math.round(netStageH * 0.55), Math.round(viewportWidth * 0.58)));
        satSize = Math.max(42, Math.min(48, Math.round(dpadSize * 0.22)));
      } else if (netStageH < 520) {
        dpadSize = Math.max(210, Math.min(250, Math.round(netStageH * 0.52), Math.round(viewportWidth * 0.62)));
        satSize = Math.max(48, Math.min(54, Math.round(dpadSize * 0.22)));
      } else {
        dpadSize = Math.max(230, Math.min(270, Math.round(netStageH * 0.48), Math.round(viewportWidth * 0.64)));
        satSize = Math.min(56, Math.max(50, Math.round(dpadSize * 0.22)));
      }

      document.documentElement.style.setProperty("--smart-dpad-size", `${dpadSize}px`);
      document.documentElement.style.setProperty("--smart-satellite-size", `${satSize}px`);

      if (tvScreenFrame) {
        tvScreenFrame.style.maxHeight = `${Math.min(Math.round(netStageH * 0.75), 450)}px`;
      }
    }
  };

  // ----------------------------------------------------
  // 2. CONTROLLER MODE: D-PAD vs TRACKPAD (Image 2)
  // ----------------------------------------------------
  function setControllerMode(mode) {
    currentControllerMode = mode;
    localStorage.setItem("firetv_controller_mode", mode);

    if (mode === "trackpad") {
      controllerWrapper.classList.remove("dpad-mode");
      controllerWrapper.classList.add("trackpad-mode");
      dpadController.classList.add("hidden");
      trackpadController.classList.remove("hidden");
      if (radioTrackpad) radioTrackpad.checked = true;
      if (radioDpad) radioDpad.checked = false;
    } else {
      controllerWrapper.classList.remove("trackpad-mode");
      controllerWrapper.classList.add("dpad-mode");
      trackpadController.classList.add("hidden");
      dpadController.classList.remove("hidden");
      if (radioDpad) radioDpad.checked = true;
      if (radioTrackpad) radioTrackpad.checked = false;
    }
    triggerHaptic(15);
  }

  if (optionDpad) {
    optionDpad.addEventListener("click", () => setControllerMode("dpad"));
  }
  if (optionTrackpad) {
    optionTrackpad.addEventListener("click", () => setControllerMode("trackpad"));
  }

  // ----------------------------------------------------
  // 3. VIBRATION SETTING TOGGLE
  // ----------------------------------------------------
  if (vibrationToggle) {
    vibrationToggle.checked = vibrationEnabled;
    vibrationToggle.addEventListener("change", (e) => {
      vibrationEnabled = e.target.checked;
      localStorage.setItem("firetv_vibration", vibrationEnabled ? "true" : "false");
      triggerHaptic(25);
    });
  }

  // ----------------------------------------------------
  // 4. TRACKPAD SWIPE & TAP GESTURE RECOGNITION (Image 3)
  // ----------------------------------------------------
  let tpStartX = 0;
  let tpStartY = 0;
  let tpStartTime = 0;
  let tpHasMoved = false;

  if (fireTrackpadSurface) {
    const handleTpStart = (e) => {
      const pt = e.touches ? e.touches[0] : e;
      tpStartX = pt.clientX;
      tpStartY = pt.clientY;
      tpStartTime = Date.now();
      tpHasMoved = false;
    };

    const handleTpMove = (e) => {
      if (e.cancelable) e.preventDefault();
      const pt = e.touches ? e.touches[0] : e;
      const dx = pt.clientX - tpStartX;
      const dy = pt.clientY - tpStartY;

      if (Math.hypot(dx, dy) > 8) {
        tpHasMoved = true;
      }

      const threshold = 26;
      if (Math.abs(dx) >= threshold) {
        sendKey(dx > 0 ? "RIGHT" : "LEFT");
        tpStartX = pt.clientX;
        tpStartY = pt.clientY;
        triggerHaptic(12);
      } else if (Math.abs(dy) >= threshold) {
        sendKey(dy > 0 ? "DOWN" : "UP");
        tpStartX = pt.clientX;
        tpStartY = pt.clientY;
        triggerHaptic(12);
      }
    };

    const handleTpEnd = (e) => {
      const elapsed = Date.now() - tpStartTime;
      if (!tpHasMoved || elapsed < 220) {
        sendKey("SELECT");
        triggerHaptic(20);
      }
      tpHasMoved = false;
    };

    fireTrackpadSurface.addEventListener("touchstart", handleTpStart, { passive: false });
    fireTrackpadSurface.addEventListener("touchmove", handleTpMove, { passive: false });
    fireTrackpadSurface.addEventListener("touchend", handleTpEnd);
    fireTrackpadSurface.addEventListener("mousedown", handleTpStart);
    window.addEventListener("mousemove", (e) => {
      if (tpStartTime > 0 && e.buttons === 1) handleTpMove(e);
    });
    window.addEventListener("mouseup", (e) => {
      if (tpStartTime > 0) {
        handleTpEnd(e);
        tpStartTime = 0;
      }
    });
  }

  // ----------------------------------------------------
  // 5. BOTTOM DRAWER TABS (Media | Apps | Channels)
  // ----------------------------------------------------
  function setDrawerTab(tabId) {
    currentDrawerTab = tabId;
    drawerTabBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.drawerTab === tabId);
    });

    if (drawerTabMedia) drawerTabMedia.classList.toggle("hidden", tabId !== "media");
    if (drawerTabMedia) drawerTabMedia.classList.toggle("active", tabId === "media");

    if (drawerTabApps) drawerTabApps.classList.toggle("hidden", tabId !== "apps");
    if (drawerTabApps) drawerTabApps.classList.toggle("active", tabId === "apps");

    if (drawerTabChannels) drawerTabChannels.classList.toggle("hidden", tabId !== "channels");
    if (drawerTabChannels) drawerTabChannels.classList.toggle("active", tabId === "channels");

    triggerHaptic(12);
  }

  drawerTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      setDrawerTab(btn.dataset.drawerTab);
    });
  });

  // ----------------------------------------------------
  // 6. DESKTOP STUDIO MODE CONTROLLER
  // ----------------------------------------------------
  let isDesktopStudio = localStorage.getItem("firetv_desktop_studio") === "true";

  function setDesktopMode(enabled) {
    isDesktopStudio = enabled;
    localStorage.setItem("firetv_desktop_studio", enabled ? "true" : "false");
    document.body.classList.toggle("desktop-studio-active", enabled);

    SmartLengthEngine.update();

    if (enabled) {
      TvMonitor.startLiveSync();
      TvMonitor.fetchScreen();
    } else {
      TvMonitor.stopLiveSync();
    }
  }

  // ----------------------------------------------------
  // 7. LIVE TV MONITOR ENGINE
  // ----------------------------------------------------
  const TvMonitor = {
    isLiveSyncActive: true,
    syncInterval: null,
    isFetching: false,
    refreshTimeout: null,

    init() {
      if (!tvScreenImg) return;

      tvScreenImg.addEventListener("load", () => {
        this.isFetching = false;
        if (tvScreenPlaceholder) tvScreenPlaceholder.classList.add("hidden");
        if (tvLiveDot) tvLiveDot.className = "live-dot active";
        if (tvStatusLabel) tvStatusLabel.textContent = "1080p FHD • Live";
      });

      tvScreenImg.addEventListener("error", () => {
        this.isFetching = false;
        if (currentState !== "connected") {
          if (tvScreenPlaceholder) tvScreenPlaceholder.classList.remove("hidden");
          if (tvLiveDot) tvLiveDot.className = "live-dot";
          if (tvStatusLabel) tvStatusLabel.textContent = "Offline";
        }
      });

      if (tvRefreshBtn) {
        tvRefreshBtn.addEventListener("click", () => {
          this.fetchScreen();
          triggerHaptic(15);
        });
      }

      if (tvLiveSyncBtn) {
        tvLiveSyncBtn.addEventListener("click", () => {
          this.isLiveSyncActive = !this.isLiveSyncActive;
          tvLiveSyncBtn.classList.toggle("active", this.isLiveSyncActive);
          if (tvLiveSyncText) {
            tvLiveSyncText.textContent = this.isLiveSyncActive ? "Live Sync: ON" : "Live Sync: PAUSED";
          }
          if (this.isLiveSyncActive) {
            this.startLiveSync();
            this.fetchScreen();
          } else {
            this.stopLiveSync();
          }
          triggerHaptic(12);
        });
      }

      if (tvFullscreenBtn && tvScreenFrame) {
        tvFullscreenBtn.addEventListener("click", () => {
          if (!document.fullscreenElement) {
            tvScreenFrame.requestFullscreen?.().catch(() => {});
          } else {
            document.exitFullscreen?.().catch(() => {});
          }
        });
      }

      if (tvConnectPromptBtn) {
        tvConnectPromptBtn.addEventListener("click", () => {
          deviceModal.classList.remove("hidden");
        });
      }

      if (isDesktopStudio) {
        this.startLiveSync();
        this.fetchScreen();
      }
    },

    async fetchScreen() {
      if (this.isFetching) return;
      this.isFetching = true;
      try {
        const res = await fetch(`/api/screenshot?t=${Date.now()}`);
        if (!res.ok) throw new Error("Screen capture offline");
        const blob = await res.blob();
        if (blob && blob.size > 200) {
          const objectUrl = URL.createObjectURL(blob);
          const oldUrl = tvScreenImg.src;
          tvScreenImg.src = objectUrl;
          if (oldUrl && oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
        }
      } catch (e) {
        if (tvScreenPlaceholder && currentState !== "connected") {
          tvScreenPlaceholder.classList.remove("hidden");
        }
      } finally {
        this.isFetching = false;
      }
    },

    startLiveSync() {
      this.stopLiveSync();
      if (!this.isLiveSyncActive) return;
      this.syncInterval = setInterval(() => {
        if (currentState === "connected" && (isDesktopStudio || window.innerWidth >= 1024)) {
          this.fetchScreen();
        }
      }, 1800);
    },

    stopLiveSync() {
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
      }
    },

    scheduleImmediateRefresh(delay = 350) {
      if (this.refreshTimeout) clearTimeout(this.refreshTimeout);
      this.refreshTimeout = setTimeout(() => {
        if (isDesktopStudio || window.innerWidth >= 1024) {
          this.fetchScreen();
        }
      }, delay);
    }
  };

  // ----------------------------------------------------
  // 8. WEBSOCKET SETUP (Ultra-Low Latency)
  // ----------------------------------------------------
  function initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => { isWsConnected = true; };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "status") {
            handleStatusUpdate(msg.data);
          }
        } catch (e) {}
      };
      ws.onclose = () => {
        isWsConnected = false;
        setTimeout(initWebSocket, 2000);
      };
      ws.onerror = () => { isWsConnected = false; };
    } catch (e) {}
  }

  // ----------------------------------------------------
  // 9. STATUS MANAGEMENT
  // ----------------------------------------------------
  function handleStatusUpdate(data) {
    currentState = data.state;
    connectedDevice = data;

    const deviceName = data.device_name || "Arvind's FireTVStick";
    if (headerDeviceName) headerDeviceName.textContent = deviceName;
    if (deviceModel) deviceModel.textContent = deviceName;
    if (devicePillText) devicePillText.textContent = deviceName;

    if (data.state === "connected") {
      if (deviceApp) deviceApp.textContent = `App: ${data.info?.current_app || "Home"}`;
      if (deviceBar) deviceBar.classList.remove("hidden");
      if (noDeviceCard) noDeviceCard.classList.add("hidden");
      if (authAlert) authAlert.classList.add("hidden");
      if (adbAlert) adbAlert.classList.add("hidden");
      stopAdbWatcher();
      if (tvScreenPlaceholder) tvScreenPlaceholder.classList.add("hidden");
      TvMonitor.fetchScreen();
    } else if (data.state === "authorizing" || data.state === "unauthorized") {
      if (deviceBar) deviceBar.classList.add("hidden");
      if (noDeviceCard) noDeviceCard.classList.remove("hidden");
      if (authAlert) authAlert.classList.remove("hidden");
      if (adbAlert) adbAlert.classList.add("hidden");
      stopAdbWatcher();
    } else {
      if (deviceBar) deviceBar.classList.add("hidden");
      if (noDeviceCard) noDeviceCard.classList.remove("hidden");
      if (authAlert) authAlert.classList.add("hidden");

      if (data.state === "error" && data.last_error && (data.last_error.includes("ADB Debugging") || data.last_error.includes("refused"))) {
        if (adbAlert) adbAlert.classList.remove("hidden");
        if (adbAlertTitle) adbAlertTitle.textContent = `ADB Debugging is OFF on ${data.host || "Fire TV"}`;
        startAdbWatcher(data.host);
      } else {
        if (adbAlert) adbAlert.classList.add("hidden");
        stopAdbWatcher();
      }
    }

    if (data.apps && data.apps.length > 0) {
      renderDrawerApps(data.apps);
      if (appsGrid && appsGrid.children.length === 0) {
        renderStudioApps(data.apps);
      }
    }

    SmartLengthEngine.requestUpdate();
  }

  function startAdbWatcher(ip) {
    if (!ip || adbWatcherInterval) return;
    if (adbPollStatus) adbPollStatus.textContent = `Watching ${ip} in real-time... toggle ADB ON on your TV`;

    adbWatcherInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/check-adb/${encodeURIComponent(ip)}`);
        const json = await res.json();
        if (json.adb_open) {
          if (adbPollStatus) adbPollStatus.textContent = `✅ ADB Detected on ${ip}! Connecting now...`;
          stopAdbWatcher();
          setTimeout(() => {
            connectToDevice(ip, 5555);
          }, 600);
        }
      } catch (e) {}
    }, 2000);
  }

  function stopAdbWatcher() {
    if (adbWatcherInterval) {
      clearInterval(adbWatcherInterval);
      adbWatcherInterval = null;
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      handleStatusUpdate(data);
    } catch (e) {}
  }

  function startStatusPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(fetchStatus, 3000);
  }

  // ----------------------------------------------------
  // 10. KEY SENDING (Sub-50ms WebSocket + REST)
  // ----------------------------------------------------
  function sendKey(key) {
    triggerHaptic(14);

    if (document.body.classList.contains("desktop-studio-active")) {
      TvMonitor.scheduleImmediateRefresh(400);
    }

    if (isWsConnected && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "key", key }));
      return;
    }

    fetch("/api/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    }).catch(() => {});
  }

  // ----------------------------------------------------
  // 11. TEXT & APPS
  // ----------------------------------------------------
  async function sendText() {
    if (!textInput) return;
    const text = textInput.value;
    if (!text) return;
    triggerHaptic(20);

    try {
      await fetch("/api/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      textInput.value = "";
      if (keyboardModal) keyboardModal.classList.add("hidden");
      TvMonitor.scheduleImmediateRefresh(400);
    } catch (e) {}
  }

  async function launchApp(appId) {
    triggerHaptic(25);
    try {
      await fetch("/api/app/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: appId })
      });
      fetchStatus();
      TvMonitor.scheduleImmediateRefresh(600);
    } catch (e) {}
  }

  // Render Horizontal App Cards in Bottom Drawer (Image 1 Style)
  function renderDrawerApps(apps) {
    if (!drawerAppsRow) return;
    drawerAppsRow.innerHTML = "";
    apps.forEach((app) => {
      const card = document.createElement("div");
      card.className = "drawer-app-card";
      card.title = app.name;
      const rawIcon = app.icon || `/icons/apps/${app.id}.png`;
      const iconSrc = rawIcon.includes("?") ? rawIcon : `${rawIcon}?v=3.1.0`;

      card.innerHTML = `
        <img src="${iconSrc}" alt="${app.name}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
        <span style="display:none; color:#fff; font-weight:700; font-size:0.75rem;">${app.name}</span>
      `;
      card.addEventListener("click", () => launchApp(app.id));
      drawerAppsRow.appendChild(card);
    });
  }

  // Render Studio Grid
  function renderStudioApps(apps) {
    if (!appsGrid) return;
    appsGrid.innerHTML = "";
    apps.forEach((app) => {
      const card = document.createElement("div");
      card.className = "app-card";
      const rawIcon = app.icon || `/icons/apps/${app.id}.png`;
      const iconSrc = rawIcon.includes("?") ? rawIcon : `${rawIcon}?v=3.1.0`;
      card.innerHTML = `
        <div class="app-icon-container">
          <img src="${iconSrc}" alt="${app.name}" loading="lazy" />
        </div>
        <span class="app-name">${app.name}</span>
      `;
      card.addEventListener("click", () => launchApp(app.id));
      appsGrid.appendChild(card);
    });
  }

  // ----------------------------------------------------
  // 12. INSTANT 0MS BUTTON BINDING
  // ----------------------------------------------------
  function bindInstantKeyButton(btn, getKeyFn) {
    if (!btn) return;
    let repeatTimer = null;
    let repeatInterval = null;

    const startPress = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.cancelable) e.preventDefault();

      const key = typeof getKeyFn === "function" ? getKeyFn() : getKeyFn;
      if (!key) return;

      btn.classList.add("btn-pressed");
      sendKey(key);

      const isRepeatable = ["UP", "DOWN", "LEFT", "RIGHT", "VOLUME_UP", "VOLUME_DOWN", "REWIND", "FAST_FORWARD"].includes(key);
      if (isRepeatable) {
        clearTimeout(repeatTimer);
        clearInterval(repeatInterval);
        repeatTimer = setTimeout(() => {
          repeatInterval = setInterval(() => {
            sendKey(key);
          }, 85);
        }, 300);
      }
    };

    const stopPress = () => {
      btn.classList.remove("btn-pressed");
      clearTimeout(repeatTimer);
      clearInterval(repeatInterval);
    };

    btn.addEventListener("pointerdown", startPress);
    btn.addEventListener("pointerup", stopPress);
    btn.addEventListener("pointercancel", stopPress);
    btn.addEventListener("pointerleave", stopPress);
  }

  // Bind all [data-key] buttons including SVG D-Pad wedges
  document.querySelectorAll("[data-key]").forEach((el) => {
    bindInstantKeyButton(el, () => el.dataset.key);
  });

  // ----------------------------------------------------
  // 13. MODALS & POPUPS WIRING
  // ----------------------------------------------------
  // Settings Modal (Image 2)
  if (slidersSettingsBtn && remoteSettingsModal) {
    slidersSettingsBtn.addEventListener("click", () => {
      remoteSettingsModal.classList.remove("hidden");
      triggerHaptic(15);
    });
  }
  if (closeRemoteSettingsBtn && remoteSettingsModal) {
    closeRemoteSettingsBtn.addEventListener("click", () => {
      remoteSettingsModal.classList.add("hidden");
    });
  }
  if (tvControlSetupBtn) {
    tvControlSetupBtn.addEventListener("click", () => {
      if (remoteSettingsModal) remoteSettingsModal.classList.add("hidden");
      if (deviceModal) deviceModal.classList.remove("hidden");
      loadSavedDevices();
    });
  }
  if (moreRemoteSettingsLink) {
    moreRemoteSettingsLink.addEventListener("click", () => {
      if (remoteSettingsModal) remoteSettingsModal.classList.add("hidden");
      if (deviceStatusModal) deviceStatusModal.classList.remove("hidden");
    });
  }

  // Keyboard Modal
  if (openKeyboardBtn && keyboardModal) {
    openKeyboardBtn.addEventListener("click", () => {
      keyboardModal.classList.remove("hidden");
      if (textInput) textInput.focus();
      triggerHaptic(15);
    });
  }
  if (closeKeyboardModal && keyboardModal) {
    closeKeyboardModal.addEventListener("click", () => {
      keyboardModal.classList.add("hidden");
    });
  }
  if (sendTextBtn) sendTextBtn.addEventListener("click", sendText);
  if (textInput) {
    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        sendText();
      }
    });
  }
  if (clearTextBtn && textInput) {
    clearTextBtn.addEventListener("click", () => {
      textInput.value = "";
      textInput.focus();
    });
  }

  // 3-Dots Menu Modal
  if (dotsMenuBtn && dotsMenuModal) {
    dotsMenuBtn.addEventListener("click", () => {
      dotsMenuModal.classList.remove("hidden");
      triggerHaptic(15);
    });
  }
  if (closeDotsMenuBtn && dotsMenuModal) {
    closeDotsMenuBtn.addEventListener("click", () => {
      dotsMenuModal.classList.add("hidden");
    });
  }
  if (dotsConnectBtn) {
    dotsConnectBtn.addEventListener("click", () => {
      dotsMenuModal.classList.add("hidden");
      deviceModal.classList.remove("hidden");
      loadSavedDevices();
    });
  }
  if (dotsDesktopBtn) {
    dotsDesktopBtn.addEventListener("click", () => {
      dotsMenuModal.classList.add("hidden");
      setDesktopMode(!isDesktopStudio);
    });
  }
  if (dotsQrBtn) {
    dotsQrBtn.addEventListener("click", () => {
      dotsMenuModal.classList.add("hidden");
      openQrModal();
    });
  }
  if (dotsHelpBtn) {
    dotsHelpBtn.addEventListener("click", () => {
      dotsMenuModal.classList.add("hidden");
      helpModal.classList.remove("hidden");
    });
  }
  if (dotsDisconnectBtn) {
    dotsDisconnectBtn.addEventListener("click", async () => {
      dotsMenuModal.classList.add("hidden");
      try {
        await fetch("/api/disconnect", { method: "POST" });
      } catch (e) {}
      handleStatusUpdate({ state: "disconnected" });
    });
  }

  // Device Bar / Status
  if (deviceBarBtn && deviceStatusModal) {
    deviceBarBtn.addEventListener("click", () => {
      deviceStatusModal.classList.remove("hidden");
      triggerHaptic(15);
    });
  }
  if (closeDeviceStatusModal && deviceStatusModal) {
    closeDeviceStatusModal.addEventListener("click", () => {
      deviceStatusModal.classList.add("hidden");
    });
  }
  if (connectDeviceBtn) {
    connectDeviceBtn.addEventListener("click", () => {
      if (deviceStatusModal) deviceStatusModal.classList.add("hidden");
      deviceModal.classList.remove("hidden");
      loadSavedDevices();
    });
  }
  if (scanFromStatusBtn) {
    scanFromStatusBtn.addEventListener("click", () => {
      if (deviceStatusModal) deviceStatusModal.classList.add("hidden");
      deviceModal.classList.remove("hidden");
      loadSavedDevices();
      triggerScan();
    });
  }
  if (disconnectBtn) {
    disconnectBtn.addEventListener("click", async () => {
      if (deviceStatusModal) deviceStatusModal.classList.add("hidden");
      try {
        await fetch("/api/disconnect", { method: "POST" });
      } catch (e) {}
      handleStatusUpdate({ state: "disconnected" });
    });
  }
  if (changeDeviceBtn) {
    changeDeviceBtn.addEventListener("click", () => {
      if (deviceStatusModal) deviceStatusModal.classList.add("hidden");
      deviceModal.classList.remove("hidden");
      loadSavedDevices();
    });
  }

  // Device Discovery Modal
  if (closeDeviceModal && deviceModal) {
    closeDeviceModal.addEventListener("click", () => deviceModal.classList.add("hidden"));
  }
  if (scanBtn) scanBtn.addEventListener("click", triggerScan);
  if (manualConnectForm) {
    manualConnectForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const ip = manualIpInput.value.trim();
      const port = parseInt(manualPortInput.value.trim(), 10) || 5555;
      if (ip) connectToDevice(ip, port);
    });
  }

  // QR Modal
  if (closeQrModal && qrModal) {
    closeQrModal.addEventListener("click", () => qrModal.classList.add("hidden"));
  }
  if (copyUrlBtn && qrUrlInput) {
    copyUrlBtn.addEventListener("click", () => {
      qrUrlInput.select();
      navigator.clipboard.writeText(qrUrlInput.value);
      copyUrlBtn.textContent = "Copied!";
      setTimeout(() => (copyUrlBtn.textContent = "Copy"), 2000);
    });
  }

  // Help Modal
  if (closeHelpModal && helpModal) {
    closeHelpModal.addEventListener("click", () => helpModal.classList.add("hidden"));
  }
  if (gotItBtn && helpModal) {
    gotItBtn.addEventListener("click", () => helpModal.classList.add("hidden"));
  }
  if (showGuideBtn) {
    showGuideBtn.addEventListener("click", () => {
      if (deviceStatusModal) deviceStatusModal.classList.add("hidden");
      helpModal.classList.remove("hidden");
    });
  }
  if (authRetryBtn) {
    authRetryBtn.addEventListener("click", () => {
      if (connectedDevice?.host) {
        connectToDevice(connectedDevice.host, connectedDevice.port || 5555);
      }
    });
  }

  // Custom package launch
  if (launchCustomBtn && customPackageInput) {
    launchCustomBtn.addEventListener("click", () => {
      const pkg = customPackageInput.value.trim();
      if (pkg) launchApp(pkg);
    });
  }

  // Close modals on background tap
  [remoteSettingsModal, keyboardModal, dotsMenuModal, deviceModal, qrModal, helpModal, deviceStatusModal].forEach((modal) => {
    if (!modal) return;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  });

  // ----------------------------------------------------
  // 14. DEVICE DISCOVERY & SAVED LIST
  // ----------------------------------------------------
  async function triggerScan() {
    if (!scanBtn || !scanBtnText || !discoveredList) return;
    scanBtn.classList.add("scanning");
    scanBtnText.textContent = "Scanning...";
    discoveredList.innerHTML = `<div class="empty-state">Searching for Fire TVs on local Wi-Fi...</div>`;

    try {
      const res = await fetch("/api/discover");
      const data = await res.json();
      renderDiscoveredDevices(data.devices);
    } catch (e) {
      discoveredList.innerHTML = `<div class="empty-state">Scan failed: ${e.message}</div>`;
    } finally {
      scanBtn.classList.remove("scanning");
      scanBtnText.textContent = "Scan Network";
    }
  }

  function renderDiscoveredDevices(devices) {
    if (!discoveredList) return;
    if (!devices || devices.length === 0) {
      discoveredList.innerHTML = `
        <div class="empty-state">
          No Fire TVs found.<br>
          Ensure your Fire TV is on the same Wi-Fi and has <strong>ADB Debugging ON</strong>.
        </div>
      `;
      return;
    }

    discoveredList.innerHTML = "";
    devices.forEach((dev) => {
      const item = document.createElement("div");
      item.className = "device-item";
      item.innerHTML = `
        <div class="device-meta">
          <span class="device-item-name">${dev.name || "Amazon Fire TV"}</span>
          <span class="device-item-ip">${dev.ip} ${dev.adb_available ? "• ADB Ready" : ""}</span>
        </div>
        <button class="btn-secondary">Connect</button>
      `;
      item.querySelector("button").addEventListener("click", () => {
        connectToDevice(dev.ip, 5555, dev.name);
      });
      discoveredList.appendChild(item);
    });
  }

  async function loadSavedDevices() {
    if (!savedList) return;
    try {
      const res = await fetch("/api/saved-devices");
      const devices = await res.json();
      renderSavedDevices(devices);
    } catch (e) {}
  }

  function renderSavedDevices(devices) {
    if (!savedList) return;
    if (!devices || devices.length === 0) {
      savedList.innerHTML = `<div class="empty-state">No saved devices yet.</div>`;
      return;
    }

    savedList.innerHTML = "";
    devices.forEach((dev) => {
      const item = document.createElement("div");
      item.className = "device-item";
      item.innerHTML = `
        <div class="device-meta">
          <span class="device-item-name">${dev.name || "Fire TV"}</span>
          <span class="device-item-ip">${dev.host}:${dev.port || 5555}</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn-secondary btn-connect-saved">Connect</button>
          <button class="btn-close btn-del-saved" title="Delete">✕</button>
        </div>
      `;
      item.querySelector(".btn-connect-saved").addEventListener("click", () => {
        connectToDevice(dev.host, dev.port || 5555, dev.name);
      });
      item.querySelector(".btn-del-saved").addEventListener("click", async (e) => {
        e.stopPropagation();
        await fetch(`/api/saved-devices/${encodeURIComponent(dev.host)}`, { method: "DELETE" });
        loadSavedDevices();
      });
      savedList.appendChild(item);
    });
  }

  async function connectToDevice(host, port = 5555, name = "") {
    triggerHaptic(20);
    if (deviceModal) deviceModal.classList.add("hidden");
    handleStatusUpdate({ state: "connecting", host, port });

    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, name, save: true })
      });
      const data = await res.json();
      handleStatusUpdate(data);
      loadSavedDevices();
    } catch (e) {
      handleStatusUpdate({ state: "error", host, port, last_error: e.message });
    }
  }

  async function openQrModal() {
    if (!qrModal || !qrContainer || !qrUrlInput) return;
    try {
      const res = await fetch("/api/server-info");
      const info = await res.json();
      const qrRes = await fetch("/api/qr");
      const svgText = await qrRes.text();

      qrContainer.innerHTML = svgText;
      qrUrlInput.value = info.mobile_url;
      qrModal.classList.remove("hidden");
    } catch (e) {}
  }

  // ----------------------------------------------------
  // 15. PHYSICAL KEYBOARD CONTROLS
  // ----------------------------------------------------
  const KEY_MAP = {
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    Enter: "SELECT",
    Escape: "BACK",
    Backspace: "BACK",
    " ": "PLAY_PAUSE",
    h: "HOME",
    H: "HOME",
    m: "MENU",
    M: "MENU",
    "+": "VOLUME_UP",
    "=": "VOLUME_UP",
    "-": "VOLUME_DOWN",
    _: "VOLUME_DOWN"
  };

  window.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    const commandKey = KEY_MAP[e.key];
    if (commandKey) {
      e.preventDefault();
      sendKey(commandKey);
    }
  });

  async function loadApps() {
    try {
      const res = await fetch("/api/apps");
      const apps = await res.json();
      if (apps && apps.length > 0) {
        renderDrawerApps(apps);
        renderStudioApps(apps);
      }
    } catch (e) {}
  }

  // ----------------------------------------------------
  // Initialization
  // ----------------------------------------------------
  setControllerMode(currentControllerMode);
  setDrawerTab(currentDrawerTab);
  SmartLengthEngine.init();
  TvMonitor.init();
  setDesktopMode(isDesktopStudio);
  initWebSocket();
  fetchStatus();
  loadApps();
  startStatusPolling();
})();
