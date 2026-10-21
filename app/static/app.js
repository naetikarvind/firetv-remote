// Fire TV Remote Pro - Client Application & Smart Length Sizer Engine
(() => {
  // State
  let ws = null;
  let isWsConnected = false;
  let currentState = "disconnected";
  let connectedDevice = null;
  let pollInterval = null;

  // DOM Elements
  const statusBtn = document.getElementById("statusBtn");
  const statusText = document.getElementById("statusText");
  const deviceAlertsBtn = document.getElementById("deviceAlertsBtn");
  const devicePillText = document.getElementById("devicePillText");
  const deviceAlertBadge = document.getElementById("deviceAlertBadge");
  const desktopModeBtn = document.getElementById("desktopModeBtn");
  const powerBtn = document.getElementById("powerBtn");
  const mobileQrBtn = document.getElementById("mobileQrBtn");
  const helpBtn = document.getElementById("helpBtn");
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

  // Modals
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

  // Keyboard Pane
  const textInput = document.getElementById("textInput");
  const sendTextBtn = document.getElementById("sendTextBtn");
  const clearTextBtn = document.getElementById("clearTextBtn");

  // Apps Pane
  const appsGrid = document.getElementById("appsGrid");
  const customPackageInput = document.getElementById("customPackageInput");
  const launchCustomBtn = document.getElementById("launchCustomBtn");

  // Trackpad
  const trackpadSurface = document.getElementById("trackpadSurface");
  const trackpadRipple = document.getElementById("trackpadRipple");

  // TV Monitor Elements
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
  // Haptic Feedback
  // ----------------------------------------------------
  function triggerHaptic(duration = 15) {
    if ("vibrate" in navigator) {
      try {
        navigator.vibrate(duration);
      } catch (e) {}
    }
  }

  // ----------------------------------------------------
  // 1. SMART LENGTH ENGINE (Dynamic JavaScript Auto-Sizing)
  // ----------------------------------------------------
  const SmartLengthEngine = {
    rafId: null,

    init() {
      this.update = this.update.bind(this);

      // Listen to all visual viewport, window, orientation, and container size changes
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", this.requestUpdate.bind(this));
        window.visualViewport.addEventListener("scroll", this.requestUpdate.bind(this));
      }
      window.addEventListener("resize", this.requestUpdate.bind(this));
      window.addEventListener("orientationchange", this.requestUpdate.bind(this));

      // ResizeObserver on main container
      const appEl = document.getElementById("app");
      if (window.ResizeObserver && appEl) {
        const ro = new ResizeObserver(() => this.requestUpdate());
        ro.observe(appEl);
      }

      // Initial execution
      this.update();
    },

    requestUpdate() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(() => {
        this.update();
        this.ensureZeroScroll();
      });
    },

    update() {
      const vv = window.visualViewport;
      const viewportHeight = vv ? Math.round(vv.height) : window.innerHeight;
      const viewportWidth  = vv ? Math.round(vv.width)  : window.innerWidth;

      // ── 1. Persist actual viewport dimensions ──────────────────────────────
      document.documentElement.style.setProperty("--app-actual-height", `${viewportHeight}px`);
      document.documentElement.style.setProperty("--app-actual-width",  `${viewportWidth}px`);

      // ── 2. Classify the screen so layout decisions are centralised here ────
      //
      //  "phone"   → narrow portrait phones   (width < 480)
      //  "phablet" → large phones / small tabs (480–767)
      //  "tablet"  → tablets / small laptops   (768–1199)
      //  "desktop" → widescreen / large display (≥1200)
      //
      const isLandscapePhone = viewportWidth > viewportHeight && viewportHeight <= 540;
      // For a landscape phone use the SHORT dimension to classify
      const classifyWidth = isLandscapePhone ? viewportHeight : viewportWidth;
      let screenClass;
      if      (classifyWidth < 480)  screenClass = "phone";
      else if (classifyWidth < 768)  screenClass = "phablet";
      else if (classifyWidth < 1200) screenClass = "tablet";
      else                           screenClass = "desktop";

      // Propagate class to <html> so CSS can also react
      document.documentElement.dataset.screen = screenClass;

      // ── 3. Compute container max-width and horizontal padding ──────────────
      let maxWidth, padX, padTop, padBottom;
      const safeTop    = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sait") || "0") || 0;
      const safeBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--saib") || "0") || 0;

      if (screenClass === "phone" || isLandscapePhone) {
        // Fill the full screen on phones (portrait or landscape) — no wasted margins
        maxWidth  = viewportWidth;
        padX      = Math.max(10, Math.round(Math.min(viewportWidth, viewportHeight) * 0.04));
        padTop    = Math.max(8, safeTop);
        padBottom = Math.max(8, safeBottom);
      } else if (screenClass === "phablet") {
        // Fill the width but add modest breathing room
        maxWidth  = viewportWidth;
        padX      = Math.max(14, Math.round(viewportWidth * 0.045));
        padTop    = Math.max(10, safeTop);
        padBottom = Math.max(10, safeBottom);
      } else if (screenClass === "tablet") {
        // Centre at a comfortable reading width, no wider than the screen
        maxWidth  = Math.min(viewportWidth, 560);
        padX      = Math.max(18, Math.round(viewportWidth * 0.05));
        padTop    = Math.max(12, safeTop);
        padBottom = Math.max(12, safeBottom);
      } else {
        // Desktop — handled by desktop-studio CSS, but cap the compact remote
        maxWidth  = document.body.classList.contains("desktop-studio-active")
                      ? Math.min(1520, Math.round(viewportWidth * 0.96))
                      : Math.min(480, Math.round(viewportWidth * 0.38));
        padX      = 24;
        padTop    = 14;
        padBottom = 14;
      }

      document.documentElement.style.setProperty("--app-max-width",    `${maxWidth}px`);
      document.documentElement.style.setProperty("--app-pad-x",        `${padX}px`);
      document.documentElement.style.setProperty("--app-pad-top",      `${padTop}px`);
      document.documentElement.style.setProperty("--app-pad-bottom",   `${padBottom}px`);

      // ── 4. Measure remaining vertical space for controls ──────────────────
      const headerEl    = document.querySelector(".header");
      const navEl       = document.querySelector(".nav-tabs");
      const hintsEl     = document.querySelector(".desktop-hints");
      const remotePane  = document.getElementById("tab-remote");
      const isDesktop   = document.body.classList.contains("desktop-studio-active");

      const headerH = headerEl ? headerEl.offsetHeight : 44;
      const navH    = (navEl && navEl.offsetParent !== null) ? navEl.offsetHeight : 0;
      const hintsH  = (hintsEl && hintsEl.offsetParent !== null) ? hintsEl.offsetHeight : 0;

      const overhead       = headerH + navH + hintsH + padTop + padBottom;
      const availableNetH  = Math.max(260, viewportHeight - overhead);

      // ── 5. Compute proportional control sizes ─────────────────────────────
      let dpadSize, btnSize, playSize, gapSize;

      if (isDesktop && remotePane && remotePane.clientHeight > 100) {
        // Desktop Studio Mode: Base calculations directly on the actual Column 1 remote container height
        const remoteH = remotePane.clientHeight - 24;
        dpadSize = Math.max(120, Math.min(235, Math.round(remoteH * 0.38)));
        btnSize  = Math.max(34,  Math.min(48,  Math.round(remoteH * 0.088)));
        playSize = Math.max(40,  Math.min(56,  Math.round(remoteH * 0.105)));
        gapSize  = Math.max(4,   Math.min(12,  Math.round(remoteH * 0.018)));
      } else if (isLandscapePhone) {
        dpadSize = Math.max(120, Math.min(180, Math.round(viewportHeight * 0.55)));
        btnSize  = Math.max(36,  Math.min(44,  Math.round(viewportHeight * 0.11)));
        playSize = Math.max(42,  Math.min(50,  Math.round(viewportHeight * 0.12)));
        gapSize  = 5;
      } else if (availableNetH < 440) {
        dpadSize = Math.max(130, Math.min(170, Math.round(availableNetH * 0.38), Math.round(viewportWidth * 0.50)));
        btnSize  = Math.max(36,  Math.min(42,  Math.round(availableNetH * 0.085)));
        playSize = Math.max(44,  Math.min(50,  Math.round(availableNetH * 0.10)));
        gapSize  = 4;
      } else if (availableNetH < 620) {
        dpadSize = Math.max(160, Math.min(210, Math.round(availableNetH * 0.36), Math.round(viewportWidth * 0.54)));
        btnSize  = Math.max(42,  Math.min(50,  Math.round(availableNetH * 0.09)));
        playSize = Math.max(50,  Math.min(58,  Math.round(availableNetH * 0.105)));
        gapSize  = Math.min(12, Math.max(6, Math.round(availableNetH * 0.018)));
      } else {
        dpadSize = Math.max(180, Math.min(240, Math.round(availableNetH * 0.35), Math.round(maxWidth * 0.54)));
        btnSize  = Math.min(54, Math.max(46, Math.round(availableNetH * 0.075)));
        playSize = Math.min(62, Math.max(54, Math.round(availableNetH * 0.088)));
        gapSize  = Math.min(16, Math.max(8, Math.round(availableNetH * 0.02)));
      }

      const centerSize = Math.round(dpadSize * 0.38);
      const tvHeight   = Math.min(Math.round(availableNetH * 0.72), 520);

      document.documentElement.style.setProperty("--smart-dpad-size",      `${dpadSize}px`);
      document.documentElement.style.setProperty("--smart-dpad-center",    `${centerSize}px`);
      document.documentElement.style.setProperty("--smart-btn-size",       `${btnSize}px`);
      document.documentElement.style.setProperty("--smart-play-btn-size",  `${playSize}px`);
      document.documentElement.style.setProperty("--smart-gap",            `${gapSize}px`);
      document.documentElement.style.setProperty("--smart-tv-height",      `${tvHeight}px`);

      if (tvScreenFrame) {
        tvScreenFrame.style.maxHeight = `${Math.min(Math.round(availableNetH * 0.62), 450)}px`;
      }
    },

    // Zero-Scroll Guarantee: Ensures remote deck never overflows available page length
    ensureZeroScroll() {
      const remoteDeck = document.querySelector(".remote-deck");
      const remotePane = document.getElementById("tab-remote");
      if (!remoteDeck || !remotePane) return;

      const isDesktop = document.body.classList.contains("desktop-studio-active");
      const isVisible = isDesktop || remotePane.classList.contains("active");
      if (!isVisible) return;

      remoteDeck.style.transform = "";
      const availableHeight = remotePane.clientHeight;
      const scrollHeight = remoteDeck.scrollHeight;

      if (availableHeight > 60 && scrollHeight > availableHeight) {
        const scaleFactor = Math.max(0.60, (availableHeight - 6) / scrollHeight);
        remoteDeck.style.transform = `scale(${scaleFactor.toFixed(3)})`;
        remoteDeck.style.transformOrigin = "center center";
      }
    }
  };

  // ----------------------------------------------------
  // 2. DESKTOP STUDIO MODE CONTROLLER
  // ----------------------------------------------------
  let isDesktopStudio = localStorage.getItem("firetv_desktop_studio") === "true";

  function setDesktopMode(enabled) {
    isDesktopStudio = enabled;
    localStorage.setItem("firetv_desktop_studio", enabled ? "true" : "false");
    document.body.classList.toggle("desktop-studio-active", enabled);

    if (desktopModeBtn) {
      desktopModeBtn.classList.toggle("active", enabled);
      desktopModeBtn.title = enabled ? "Switch to Handheld Remote Mode" : "Switch to Desktop Studio Mode";
    }

    if (enabled && currentActiveTab === "remote") {
      currentActiveTab = lastDesktopToolTab || "apps";
    } else if (!enabled && currentActiveTab !== "remote") {
      currentActiveTab = "remote";
    }

    syncTabsForScreen();
    SmartLengthEngine.update();

    if (enabled) {
      TvMonitor.startLiveSync();
      TvMonitor.fetchScreen();
    } else {
      TvMonitor.stopLiveSync();
    }
  }

  if (desktopModeBtn) {
    desktopModeBtn.addEventListener("click", () => {
      setDesktopMode(!isDesktopStudio);
      triggerHaptic(15);
    });
  }

  // ----------------------------------------------------
  // 3. LIVE TV SCREEN MONITOR ENGINE
  // ----------------------------------------------------
  const TvMonitor = {
    isLiveSyncActive: true,
    syncInterval: null,
    isFetching: false,
    refreshTimeout: null,

    init() {
      if (!tvScreenImg) return;

      // Handle image load / error
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

      // Capture button
      if (tvRefreshBtn) {
        tvRefreshBtn.addEventListener("click", () => {
          this.fetchScreen();
          triggerHaptic(15);
        });
      }

      // Live Sync toggle button
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

      // Fullscreen button
      if (tvFullscreenBtn && tvScreenFrame) {
        tvFullscreenBtn.addEventListener("click", () => {
          if (!document.fullscreenElement) {
            tvScreenFrame.requestFullscreen?.().catch(() => {});
          } else {
            document.exitFullscreen?.().catch(() => {});
          }
        });
      }

      // Check connection button inside placeholder
      if (tvConnectPromptBtn) {
        tvConnectPromptBtn.addEventListener("click", () => {
          deviceModal.classList.remove("hidden");
        });
      }

      // Interactive Click on TV screen (D-pad touch regions)
      if (tvScreenFrame) {
        tvScreenFrame.addEventListener("click", (e) => {
          if (e.target.closest(".tv-controls-bar") || e.target.closest("button")) return;
          const rect = tvScreenFrame.getBoundingClientRect();
          const clickX = (e.clientX - rect.left) / rect.width;
          const clickY = (e.clientY - rect.top) / rect.height;

          // Determine quadrant: Left, Right, Up, Down, or Center OK
          if (clickX >= 0.30 && clickX <= 0.70 && clickY >= 0.30 && clickY <= 0.70) {
            sendKey("SELECT");
          } else if (clickX < 0.28) {
            sendKey("LEFT");
          } else if (clickX > 0.72) {
            sendKey("RIGHT");
          } else if (clickY < 0.30) {
            sendKey("UP");
          } else {
            sendKey("DOWN");
          }
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
        if (!res.ok) {
          throw new Error("Screen capture offline");
        }
        const blob = await res.blob();
        if (blob && blob.size > 200) {
          const objectUrl = URL.createObjectURL(blob);
          const oldUrl = tvScreenImg.src;
          tvScreenImg.src = objectUrl;
          if (oldUrl && oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
        }
      } catch (e) {
        this.isFetching = false;
        if (tvScreenPlaceholder && currentState !== "connected") {
          tvScreenPlaceholder.classList.remove("hidden");
        }
      }
    },

    startLiveSync() {
      this.stopLiveSync();
      if (!this.isLiveSyncActive) return;
      // Refresh screen snapshot every 1.8 seconds in desktop studio mode
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

    // Fast reaction: Refresh screenshot 350ms after sending a key command
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
  // WebSocket Setup (Ultra-Low Latency)
  // ----------------------------------------------------
  function initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        isWsConnected = true;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "status") {
            handleStatusUpdate(msg.data);
          }
        } catch (e) {
          console.error("WS parse error:", e);
        }
      };

      ws.onclose = () => {
        isWsConnected = false;
        setTimeout(initWebSocket, 2000);
      };

      ws.onerror = () => {
        isWsConnected = false;
      };
    } catch (e) {
      console.warn("WebSocket not supported or failed:", e);
    }
  }

  // ----------------------------------------------------
  // Status Management
  // ----------------------------------------------------
  function handleStatusUpdate(data) {
    currentState = data.state;
    connectedDevice = data;

    statusBtn.className = "status-pill";
    if (deviceAlertsBtn) deviceAlertsBtn.className = "device-alerts-pill";
    if (deviceAlertBadge) deviceAlertBadge.classList.add("hidden");

    if (data.state === "connected") {
      statusBtn.classList.add("connected");
      statusText.textContent = "Connected";
      if (devicePillText) devicePillText.textContent = data.info?.model || data.host || "Fire TV";

      if (deviceBar) deviceBar.classList.remove("hidden");
      if (noDeviceCard) noDeviceCard.classList.add("hidden");
      deviceModel.textContent = data.info?.model || "Amazon Fire TV";
      deviceApp.textContent = `App: ${data.info?.current_app || "Home"}`;
      authAlert.classList.add("hidden");
      adbAlert.classList.add("hidden");
      stopAdbWatcher();
      if (tvScreenPlaceholder) tvScreenPlaceholder.classList.add("hidden");
      TvMonitor.fetchScreen();
    } else if (data.state === "authorizing" || data.state === "unauthorized") {
      statusBtn.classList.add("authorizing");
      statusText.textContent = "Authorize on TV...";
      if (devicePillText) devicePillText.textContent = "Auth Needed";
      if (deviceAlertsBtn) deviceAlertsBtn.classList.add("has-alert");
      if (deviceAlertBadge) {
        deviceAlertBadge.textContent = "!";
        deviceAlertBadge.className = "alert-badge amber-badge";
        deviceAlertBadge.classList.remove("hidden");
      }

      if (deviceBar) deviceBar.classList.add("hidden");
      if (noDeviceCard) noDeviceCard.classList.remove("hidden");
      authAlert.classList.remove("hidden");
      adbAlert.classList.add("hidden");
      stopAdbWatcher();
      if (tvScreenPlaceholder) tvScreenPlaceholder.classList.remove("hidden");
    } else if (data.state === "connecting") {
      statusBtn.classList.add("authorizing");
      statusText.textContent = "Connecting...";
      if (devicePillText) devicePillText.textContent = "Connecting...";
      if (deviceBar) deviceBar.classList.add("hidden");
      if (noDeviceCard) noDeviceCard.classList.remove("hidden");
      authAlert.classList.add("hidden");
      adbAlert.classList.add("hidden");
    } else {
      statusBtn.classList.add("disconnected");
      statusText.textContent = data.state === "error" ? "Connection Failed" : "Disconnected";
      if (deviceBar) deviceBar.classList.add("hidden");
      if (noDeviceCard) noDeviceCard.classList.remove("hidden");
      authAlert.classList.add("hidden");

      if (data.state === "error" && data.last_error && (data.last_error.includes("ADB Debugging") || data.last_error.includes("refused"))) {
        if (devicePillText) devicePillText.textContent = "ADB Off";
        if (deviceAlertsBtn) deviceAlertsBtn.classList.add("has-error");
        if (deviceAlertBadge) {
          deviceAlertBadge.textContent = "!";
          deviceAlertBadge.className = "alert-badge";
          deviceAlertBadge.classList.remove("hidden");
        }

        adbAlert.classList.remove("hidden");
        adbAlertTitle.textContent = `ADB Debugging is OFF on ${data.host || "Fire TV"}`;
        startAdbWatcher(data.host);
      } else {
        if (devicePillText) devicePillText.textContent = "Fire TV";
        adbAlert.classList.add("hidden");
        stopAdbWatcher();
      }
      if (tvScreenPlaceholder) tvScreenPlaceholder.classList.remove("hidden");
    }

    if (data.apps && data.apps.length > 0 && appsGrid.children.length === 0) {
      renderApps(data.apps);
    }

    SmartLengthEngine.requestUpdate();
  }

  function startAdbWatcher(ip) {
    if (!ip) return;
    if (adbWatcherInterval) return;
    adbPollStatus.textContent = `Watching ${ip} in real-time... toggle ADB ON on your TV`;

    adbWatcherInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/check-adb/${encodeURIComponent(ip)}`);
        const json = await res.json();
        if (json.adb_open) {
          adbPollStatus.textContent = `✅ ADB Detected on ${ip}! Connecting now...`;
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
    } catch (e) {
      console.error("Error fetching status:", e);
    }
  }

  function startStatusPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(fetchStatus, 3000);
  }

  // ----------------------------------------------------
  // Key Sending (WebSocket + REST fallback)
  // ----------------------------------------------------
  function sendKey(key) {
    triggerHaptic(12);

    // Refresh live screen monitor immediately after key interaction
    TvMonitor.scheduleImmediateRefresh(350);

    if (isWsConnected && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "key", key }));
      return;
    }

    fetch("/api/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    }).catch((e) => console.error("Failed to send key:", e));
  }

  // ----------------------------------------------------
  // Text Input
  // ----------------------------------------------------
  async function sendText() {
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
      TvMonitor.scheduleImmediateRefresh(400);
    } catch (e) {
      console.error("Error sending text:", e);
    }
  }

  // ----------------------------------------------------
  // App Launching
  // ----------------------------------------------------
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
    } catch (e) {
      console.error("Error launching app:", e);
    }
  }

  function renderApps(apps) {
    appsGrid.innerHTML = "";
    apps.forEach((app) => {
      const card = document.createElement("div");
      card.className = "app-card";
      const rawIcon = app.icon || `/icons/apps/${app.id}.png`;
      const version = window.__APP_VERSION__ || "2.2.0";
      const iconSrc = rawIcon.includes("?") ? rawIcon : `${rawIcon}?v=${version}`;
      card.innerHTML = `
        <div class="app-icon-container">
          <img src="${iconSrc}" class="app-icon-img" alt="${app.name}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div class="app-badge-fallback" style="background: ${app.color || '#ff5722'}">
            ${app.name.charAt(0)}
          </div>
        </div>
        <span class="app-title">${app.name}</span>
      `;
      card.addEventListener("click", () => launchApp(app.id));
      appsGrid.appendChild(card);
    });
  }

  // ----------------------------------------------------
  // Trackpad Touch & Swipe Gestures
  // ----------------------------------------------------
  let touchStartX = 0;
  let touchStartY = 0;
  let isPointerDown = false;

  function showRipple(x, y) {
    trackpadRipple.style.left = `${x - 25}px`;
    trackpadRipple.style.top = `${y - 25}px`;
    trackpadRipple.style.opacity = "1";
    trackpadRipple.style.transform = "scale(2.5)";
    setTimeout(() => {
      trackpadRipple.style.opacity = "0";
      trackpadRipple.style.transform = "scale(0)";
    }, 200);
  }

  function handleTouchStart(e) {
    const touch = e.touches ? e.touches[0] : e;
    const rect = trackpadSurface.getBoundingClientRect();
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isPointerDown = true;
    showRipple(touch.clientX - rect.left, touch.clientY - rect.top);
  }

  function handleTouchMove(e) {
    if (!isPointerDown) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    const diffX = touch.clientX - touchStartX;
    const diffY = touch.clientY - touchStartY;

    if (Math.abs(diffX) >= 36) {
      if (diffX > 0) sendKey("RIGHT");
      else sendKey("LEFT");
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    } else if (Math.abs(diffY) >= 36) {
      if (diffY > 0) sendKey("DOWN");
      else sendKey("UP");
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }
  }

  function handleTouchEnd() {
    isPointerDown = false;
  }

  trackpadSurface.addEventListener("touchstart", handleTouchStart, { passive: false });
  trackpadSurface.addEventListener("touchmove", handleTouchMove, { passive: false });
  trackpadSurface.addEventListener("touchend", handleTouchEnd);
  trackpadSurface.addEventListener("mousedown", handleTouchStart);
  window.addEventListener("mousemove", handleTouchMove);
  window.addEventListener("mouseup", handleTouchEnd);

  // ----------------------------------------------------
  // Discovery & Device Connection
  // ----------------------------------------------------
  async function triggerScan() {
    scanBtn.classList.add("scanning");
    scanBtnText.textContent = "Scanning...";
    discoveredList.innerHTML = `<div class="empty-state">Searching for Fire TVs on local Wi-Fi network...</div>`;

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
    if (!devices || devices.length === 0) {
      discoveredList.innerHTML = `
        <div class="empty-state">
          No Fire TVs found.<br>
          Make sure your Fire TV is on the same Wi-Fi and has <strong>ADB Debugging ON</strong>.
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
    try {
      const res = await fetch("/api/saved-devices");
      const devices = await res.json();
      renderSavedDevices(devices);
    } catch (e) {
      console.error("Error loading saved devices:", e);
    }
  }

  function renderSavedDevices(devices) {
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
    deviceModal.classList.add("hidden");
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
    try {
      const res = await fetch("/api/server-info");
      const info = await res.json();
      const qrRes = await fetch("/api/qr");
      const svgText = await qrRes.text();

      qrContainer.innerHTML = svgText;
      qrUrlInput.value = info.mobile_url;
      qrModal.classList.remove("hidden");
    } catch (e) {
      console.error("Error loading QR code:", e);
    }
  }

  // ----------------------------------------------------
  // Navigation Tabs & Layout Synchronization
  // ----------------------------------------------------
  let currentActiveTab = "remote";
  let lastDesktopToolTab = "apps";

  function syncTabsForScreen() {
    const isStudioActive = document.body.classList.contains("desktop-studio-active");

    if (isStudioActive) {
      // In Desktop Studio mode, the remote is permanently docked in Column 1.
      // If currentActiveTab is "remote", switch it to the last active desktop tool tab
      if (currentActiveTab === "remote") {
        currentActiveTab = lastDesktopToolTab || "apps";
      } else {
        lastDesktopToolTab = currentActiveTab;
      }

      // Update active highlight on visible nav tabs (Trackpad, Keyboard, Apps)
      document.querySelectorAll(".nav-tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.tab === currentActiveTab);
      });

      // 3-Column Desktop Studio Mode:
      // Column 1: Remote is always visible
      const remotePane = document.getElementById("tab-remote");
      if (remotePane) remotePane.classList.add("active");

      // Column 3: The selected tool pane (Trackpad, Keyboard, or Apps)
      ["trackpad", "keyboard", "apps"].forEach((tabKey) => {
        const pane = document.getElementById(`tab-${tabKey}`);
        if (pane) {
          pane.classList.toggle("active", tabKey === currentActiveTab);
        }
      });
    } else {
      // Standard Handheld Remote Mode:
      // Update active highlight on all nav tabs
      document.querySelectorAll(".nav-tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.tab === currentActiveTab);
      });

      // EXACTLY ONE TAB IS ACTIVE AT ANY TIME!
      ["remote", "trackpad", "keyboard", "apps"].forEach((tabKey) => {
        const pane = document.getElementById(`tab-${tabKey}`);
        if (pane) {
          pane.classList.toggle("active", tabKey === currentActiveTab);
        }
      });
    }

    SmartLengthEngine.requestUpdate();
  }

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      currentActiveTab = tab.dataset.tab;
      syncTabsForScreen();
      triggerHaptic(10);
    });
  });

  // Instant 0ms Pointerdown + Auto-repeat on hold
  function bindInstantKeyButton(btn, getKeyFn) {
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

  // Remote Buttons ([data-key])
  document.querySelectorAll("[data-key]").forEach((btn) => {
    bindInstantKeyButton(btn, () => btn.dataset.key);
  });

  // Power Button
  bindInstantKeyButton(powerBtn, "POWER");

  // Text Input handlers
  sendTextBtn.addEventListener("click", sendText);
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      sendText();
      sendKey("ENTER");
    }
  });
  clearTextBtn.addEventListener("click", () => {
    textInput.value = "";
    textInput.focus();
  });

  // Custom App launch
  launchCustomBtn.addEventListener("click", () => {
    const pkg = customPackageInput.value.trim();
    if (pkg) launchApp(pkg);
  });

  // Modals open/close
  if (deviceAlertsBtn && deviceStatusModal) {
    deviceAlertsBtn.addEventListener("click", () => {
      deviceStatusModal.classList.remove("hidden");
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

  statusBtn.addEventListener("click", () => {
    deviceModal.classList.remove("hidden");
    loadSavedDevices();
  });
  closeDeviceModal.addEventListener("click", () => deviceModal.classList.add("hidden"));
  scanBtn.addEventListener("click", triggerScan);

  manualConnectForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const ip = manualIpInput.value.trim();
    const port = parseInt(manualPortInput.value.trim(), 10) || 5555;
    if (ip) connectToDevice(ip, port);
  });

  changeDeviceBtn.addEventListener("click", () => {
    if (deviceStatusModal) deviceStatusModal.classList.add("hidden");
    deviceModal.classList.remove("hidden");
    loadSavedDevices();
  });

  mobileQrBtn.addEventListener("click", openQrModal);
  closeQrModal.addEventListener("click", () => qrModal.classList.add("hidden"));
  copyUrlBtn.addEventListener("click", () => {
    qrUrlInput.select();
    navigator.clipboard.writeText(qrUrlInput.value);
    copyUrlBtn.textContent = "Copied!";
    setTimeout(() => (copyUrlBtn.textContent = "Copy"), 2000);
  });

  helpBtn.addEventListener("click", () => helpModal.classList.remove("hidden"));
  showGuideBtn.addEventListener("click", () => {
    if (deviceStatusModal) deviceStatusModal.classList.add("hidden");
    helpModal.classList.remove("hidden");
  });
  closeHelpModal.addEventListener("click", () => helpModal.classList.add("hidden"));
  gotItBtn.addEventListener("click", () => helpModal.classList.add("hidden"));

  authRetryBtn.addEventListener("click", () => {
    if (connectedDevice?.host) {
      connectToDevice(connectedDevice.host, connectedDevice.port || 5555);
    }
  });

  // Close modals on background tap
  [deviceModal, qrModal, helpModal, deviceStatusModal].forEach((modal) => {
    if (!modal) return;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  });

  // ----------------------------------------------------
  // 4. PHYSICAL KEYBOARD CONTROLS & LIVE VISUAL GLOW
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
    // Ignore keyboard shortcuts if user is typing in a text field
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      return;
    }

    const commandKey = KEY_MAP[e.key];
    if (commandKey) {
      e.preventDefault();
      sendKey(commandKey);

      // Light up matching on-screen hotkey chip
      const matchingChip = document.querySelector(`.hotkey-chip[data-hotkey="${e.code}"]`) ||
                           document.querySelector(`.hotkey-chip[data-hotkey="${e.key}"]`);
      if (matchingChip) {
        matchingChip.classList.add("key-pressed");
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    const matchingChip = document.querySelector(`.hotkey-chip[data-hotkey="${e.code}"]`) ||
                         document.querySelector(`.hotkey-chip[data-hotkey="${e.key}"]`);
    if (matchingChip) {
      matchingChip.classList.remove("key-pressed");
    }
  });

  async function loadApps() {
    try {
      const res = await fetch("/api/apps");
      const apps = await res.json();
      if (apps && apps.length > 0) {
        renderApps(apps);
      }
    } catch (e) {
      console.error("Error loading apps:", e);
    }
  }

  // ----------------------------------------------------
  // Initialization
  // ----------------------------------------------------
  SmartLengthEngine.init();
  TvMonitor.init();
  setDesktopMode(isDesktopStudio);
  initWebSocket();
  fetchStatus();
  loadApps();
  startStatusPolling();
  syncTabsForScreen();
})();
