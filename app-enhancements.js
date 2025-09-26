/* global document, window, navigator, localStorage, CustomEvent */
(function initEnhancements() {
  'use strict';

  const SPLASH_TIMEOUT_MS = 5000;
  const ROUTE_STORAGE_KEY = 'runlog_routes_v1';
  const ROUTE_DRAFT_KEY = 'runlog_active_route_v1';
  const ROUTE_EDIT_DRAFT_KEY = 'runlog_route_edit_drafts_v1';
  const ROUTE_UNDO_KEY = 'runlog_route_undo_v1';
  const CRASH_QUEUE_KEY = 'runlog_crash_queue_v1';
  const SYNC_QUEUE_KEY = 'runlog_sync_queue_v1';
  const MAX_NAV_WAYPOINTS = 20;
  const MIN_SAMPLE_DISTANCE_M = 35;
  const MIN_SAMPLE_TIME_MS = 12000;
  const MIN_SAMPLE_ANGLE_DEG = 15;
  const LARGE_GAP_DISTANCE_M = 500;
  const LARGE_GAP_TIME_MS = 60000;

  const appState = {
    store: null,
    recorder: null,
    history: null,
    splash: null,
    crashReporter: null,
    backgroundSync: null,
  };

  function safeParse(json, fallback) {
    if (typeof json !== 'string' || !json) return fallback;
    try {
      return JSON.parse(json);
    } catch (error) {
      console.warn('Failed to parse JSON', error);
      return fallback;
    }
  }

  function safeStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.warn('Failed to stringify value', error);
      return null;
    }
  }

  function storageGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return safeParse(raw, fallback);
    } catch (error) {
      console.warn('Failed to get storage', key, error);
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      const serialized = safeStringify(value);
      if (serialized === null) return false;
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      console.warn('Failed to set storage', key, error);
      return false;
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove storage', key, error);
    }
  }

  class BackgroundStateSync {
    constructor() {
      this.registration = null;
      this.controller = typeof navigator !== 'undefined' && navigator.serviceWorker
        ? navigator.serviceWorker.controller
        : null;
      this.pendingMessages = [];
      this.pendingRequests = new Map();
      this.requestSeq = 0;
      this.readyPromise = this.init();
      if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', (event) => this.handleMessage(event));
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          this.controller = navigator.serviceWorker.controller;
          this.flushPendingMessages();
        });
      }
    }

    async init() {
      if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
      try {
        const registration = await navigator.serviceWorker.ready;
        this.registration = registration;
        this.controller = navigator.serviceWorker.controller || this.controller;
        this.flushPendingMessages();
        return registration;
      } catch (error) {
        console.warn('Background sync registration unavailable', error);
        return null;
      }
    }

    flushPendingMessages() {
      if (!this.controller || !this.pendingMessages.length) return;
      const queue = this.pendingMessages.splice(0, this.pendingMessages.length);
      queue.forEach((message) => {
        try {
          this.controller.postMessage(message);
        } catch (error) {
          console.warn('Failed to post background sync message', error);
        }
      });
    }

    sendMessage(message) {
      if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
      if (this.controller) {
        try {
          this.controller.postMessage(message);
        } catch (error) {
          console.warn('Failed to post background sync message', error);
        }
      } else {
        this.pendingMessages.push(message);
      }
    }

    async mirrorState(state) {
      await this.readyPromise;
      const payload = {
        namespace: 'runlog-bg',
        type: 'STATE_UPDATE',
        state: state ? JSON.parse(JSON.stringify(state)) : {},
      };
      this.sendMessage(payload);
    }

    async requestState() {
      await this.readyPromise;
      if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
      const requestId = `req_${Date.now()}_${this.requestSeq += 1}`;
      const resultPromise = new Promise((resolve) => {
        const timeoutId = window.setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            resolve(null);
          }
        }, 3000);
        this.pendingRequests.set(requestId, { resolve, timeoutId });
      });
      this.sendMessage({
        namespace: 'runlog-bg',
        type: 'STATE_REQUEST',
        requestId,
      });
      return resultPromise;
    }

    async registerSync() {
      const registration = await this.readyPromise;
      if (!registration || !registration.sync || typeof registration.sync.register !== 'function') {
        return false;
      }
      try {
        await registration.sync.register('runlog-route-sync');
        return true;
      } catch (error) {
        console.warn('Background sync registration failed', error);
        return false;
      }
    }

    handleMessage(event) {
      if (!event || !event.data || event.data.namespace !== 'runlog-bg') return;
      const data = event.data;
      if (data.type === 'STATE_RESPONSE' && data.requestId) {
        const entry = this.pendingRequests.get(data.requestId);
        if (entry) {
          window.clearTimeout(entry.timeoutId);
          entry.resolve(data.state || null);
          this.pendingRequests.delete(data.requestId);
        }
        return;
      }
      if (data.type === 'SYNC_ERROR') {
        console.warn('Background sync failed to flush queue', data.error);
        return;
      }
      if (data.type === 'SYNC_COMPLETE') {
        console.info('Background sync queue flushed', data.processed);
      }
    }
  }

  function generateId(prefix) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function toRad(deg) {
    return deg * (Math.PI / 180);
  }

  function toDeg(rad) {
    return rad * (180 / Math.PI);
  }

  function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    const brng = Math.atan2(y, x);
    return (toDeg(brng) + 360) % 360;
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '-';
    const datePart = date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timePart = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }

  function formatDuration(ms) {
    if (!ms || ms < 0) return '00:00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatDistance(meters) {
    if (!meters || meters <= 0) return '0 km';
    return `${(meters / 1000).toFixed(2)} km`;
  }

  function formatDateInputValue(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  function formatDateKey(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDisplayDate(dateKey) {
    if (!dateKey) return '';
    const parts = String(dateKey).split('-');
    if (parts.length !== 3) return dateKey;
    const [year, month, day] = parts;
    if (!year || !month || !day) return dateKey;
    return `${year}/${month}/${day}`;
  }

  function csvEscape(value) {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  class CrashReporter {
    constructor() {
      this.queue = storageGet(CRASH_QUEUE_KEY, []);
      this.isFlushing = false;
      this.flush = this.flush.bind(this);
      window.addEventListener('online', this.flush);
      this.installHandlers();
    }

    installHandlers() {
      window.addEventListener('error', (event) => {
        const error = event?.error || new Error(String(event?.message || 'Unknown error'));
        this.capture(error, { type: 'error', source: event?.filename || 'window' });
      });
      window.addEventListener('unhandledrejection', (event) => {
        const reason = event?.reason instanceof Error ? event.reason : new Error(String(event?.reason || 'Unhandled rejection'));
        this.capture(reason, { type: 'promise', source: 'unhandledrejection' });
      });
    }

    capture(error, context = {}) {
      if (!error) return;
      const payload = {
        id: generateId('crash'),
        timestamp: Date.now(),
        message: error.message || String(error),
        stack: error.stack || null,
        context,
        userAgent: navigator.userAgent,
        online: navigator.onLine,
      };
      this.queue.push(payload);
      storageSet(CRASH_QUEUE_KEY, this.queue);
      if (navigator.onLine) {
        this.flush();
      }
    }

    async flush() {
      if (this.isFlushing) return;
      if (!navigator.onLine) return;
      if (!this.queue.length) return;
      this.isFlushing = true;
      try {
        while (this.queue.length) {
          const payload = this.queue[0];
          const body = safeStringify(payload);
          if (typeof body !== 'string') break;
          let sent = false;
          try {
            if (navigator.sendBeacon) {
              sent = navigator.sendBeacon('/crash-report', body);
            }
          } catch (err) {
            console.warn('sendBeacon failed', err);
          }
          if (!sent) {
            try {
              const response = await fetch('/crash-report', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body,
                keepalive: true,
              });
              sent = response.ok;
            } catch (err) {
              console.warn('Crash report upload failed', err);
            }
          }
          if (!sent) break;
          this.queue.shift();
          storageSet(CRASH_QUEUE_KEY, this.queue);
        }
      } finally {
        this.isFlushing = false;
      }
    }
  }

  class SplashController {
    constructor(timeout = SPLASH_TIMEOUT_MS) {
      this.timeout = timeout;
      this.visible = false;
      this.timerId = null;
      this.el = null;
      this.messageEl = null;
      this.offlineBtn = null;
      this.dismissed = false;
    }

    attach() {
      this.el = document.getElementById('splashScreen');
      if (!this.el) return;
      this.messageEl = document.getElementById('splashMessage');
      this.offlineBtn = document.getElementById('splashOfflineBtn');
      this.show();
      window.addEventListener('online', () => this.updateMessage());
      window.addEventListener('offline', () => this.updateMessage());
      document.addEventListener('runlog:ready', () => this.hide('ready'), { once: true });
      window.addEventListener('load', () => this.hide('load'), { once: true });
      if (this.offlineBtn) {
        this.offlineBtn.addEventListener('click', () => this.hide('manual'));
      }
    }

    show() {
      if (!this.el) return;
      this.visible = true;
      this.dismissed = false;
      this.el.style.display = 'flex';
      this.el.classList.remove('hidden');
      this.updateMessage();
      if (this.offlineBtn) {
        this.offlineBtn.hidden = navigator.onLine;
      }
      this.timerId = window.setTimeout(() => this.hide('timeout'), this.timeout);
    }

    updateMessage() {
      if (!this.messageEl) return;
      if (navigator.onLine) {
        this.messageEl.textContent = '初期化中...';
        if (this.offlineBtn) this.offlineBtn.hidden = true;
      } else {
        this.messageEl.textContent = 'オフラインモードで起動しています';
        if (this.offlineBtn && !this.dismissed) this.offlineBtn.hidden = false;
      }
    }

    hide(reason) {
      if (!this.el || !this.visible) return;
      this.visible = false;
      this.dismissed = true;
      if (this.timerId) {
        window.clearTimeout(this.timerId);
        this.timerId = null;
      }
      this.el.classList.add('hidden');
      window.setTimeout(() => {
        if (this.el) this.el.style.display = 'none';
      }, 320);
      document.dispatchEvent(new CustomEvent('runlog:splash-hidden', { detail: { reason } }));
    }
  }

  class RouteStore {
    constructor(backgroundSync) {
      this.backgroundSync = backgroundSync || null;
      this.routes = storageGet(ROUTE_STORAGE_KEY, []);
      this.activeDraft = storageGet(ROUTE_DRAFT_KEY, null);
      this.editDrafts = storageGet(ROUTE_EDIT_DRAFT_KEY, {});
      this.undoHistory = storageGet(ROUTE_UNDO_KEY, {});
      this.syncQueue = storageGet(SYNC_QUEUE_KEY, []);
      this.mirrorState();
      this.requestBackgroundSync();
    }

    getRoutes() {
      return [...this.routes].sort((a, b) => (b.startAt || 0) - (a.startAt || 0));
    }

    upsertRoute(route) {
      if (!route || !route.id) return;
      const index = this.routes.findIndex((item) => item && item.id === route.id);
      if (index >= 0) {
        this.routes[index] = { ...route };
      } else {
        this.routes.push({ ...route });
      }
      storageSet(ROUTE_STORAGE_KEY, this.routes);
      this.enqueueSync({ type: 'upsert', routeId: route.id });
      this.notify({ route });
    }

    setRoutes(routes, options = {}) {
      this.routes = [...routes];
      storageSet(ROUTE_STORAGE_KEY, this.routes);
      if (options.skipSyncEnqueue) {
        this.mirrorState();
      } else {
        this.enqueueSync({ type: 'replace', routes: this.routes.map((route) => route.id) });
      }
      this.notify();
    }

    removeRoute(routeId) {
      this.setRoutes(this.routes.filter((route) => route.id !== routeId));
      this.enqueueSync({ type: 'delete', routeId });
    }

    getActiveDraft() {
      return this.activeDraft ? { ...this.activeDraft } : null;
    }

    saveActiveDraft(route) {
      this.activeDraft = route ? { ...route } : null;
      if (route) {
        storageSet(ROUTE_DRAFT_KEY, this.activeDraft);
      } else {
        storageRemove(ROUTE_DRAFT_KEY);
      }
      this.mirrorState();
    }

    getEditDraft(routeId) {
      if (!routeId) return null;
      const drafts = this.editDrafts || {};
      return drafts[routeId] ? { ...drafts[routeId] } : null;
    }

    setEditDraft(routeId, draft) {
      if (!routeId) return;
      const drafts = this.editDrafts || {};
      if (draft === null) {
        delete drafts[routeId];
      } else {
        drafts[routeId] = { ...draft };
      }
      this.editDrafts = drafts;
      storageSet(ROUTE_EDIT_DRAFT_KEY, drafts);
      this.mirrorState();
    }

    getUndoState(routeId) {
      if (!routeId) return { undo: [], redo: [] };
      const history = this.undoHistory || {};
      const entry = history[routeId] || { undo: [], redo: [] };
      entry.undo = entry.undo || [];
      entry.redo = entry.redo || [];
      return entry;
    }

    saveUndoState(routeId, entry) {
      if (!routeId) return;
      const history = this.undoHistory || {};
      history[routeId] = {
        undo: (entry.undo || []).slice(-20),
        redo: (entry.redo || []).slice(-20),
      };
      this.undoHistory = history;
      storageSet(ROUTE_UNDO_KEY, history);
      this.mirrorState();
    }

    enqueueSync(task) {
      if (!task) return;
      this.syncQueue = this.syncQueue || [];
      this.syncQueue.push({ ...task, queuedAt: Date.now() });
      storageSet(SYNC_QUEUE_KEY, this.syncQueue);
      document.dispatchEvent(new CustomEvent('runlog:sync-queued', { detail: { queueLength: this.syncQueue.length } }));
      this.mirrorState();
      this.requestBackgroundSync();
    }

    markSynced(predicate) {
      if (!Array.isArray(this.syncQueue) || !this.syncQueue.length) return;
      const remaining = this.syncQueue.filter((task) => {
        if (!predicate) return true;
        return !predicate(task);
      });
      this.syncQueue = remaining;
      storageSet(SYNC_QUEUE_KEY, remaining);
      this.mirrorState();
    }

    notify(detail) {
      document.dispatchEvent(new CustomEvent('runlog:routes-changed', { detail }));
    }

    mirrorState() {
      if (!this.backgroundSync) return;
      const payload = {
        routes: this.routes,
        activeDraft: this.activeDraft,
        syncQueue: this.syncQueue,
        timestamp: Date.now(),
      };
      this.backgroundSync.mirrorState(payload);
    }

    requestBackgroundSync() {
      if (!this.backgroundSync) return;
      if (Array.isArray(this.syncQueue) && this.syncQueue.length) {
        this.backgroundSync.registerSync();
      }
    }

    async restoreFromBackground() {
      if (!this.backgroundSync) return;
      try {
        const state = await this.backgroundSync.requestState();
        if (!state) return;
        let changed = false;
        if (Array.isArray(state.routes) && state.routes.length && (!Array.isArray(this.routes) || !this.routes.length)) {
          this.routes = state.routes.map((route) => ({ ...route }));
          storageSet(ROUTE_STORAGE_KEY, this.routes);
          changed = true;
        }
        if (state.activeDraft && !this.activeDraft) {
          this.activeDraft = { ...state.activeDraft };
          storageSet(ROUTE_DRAFT_KEY, this.activeDraft);
          changed = true;
        }
        if (Array.isArray(state.syncQueue) && state.syncQueue.length && (!Array.isArray(this.syncQueue) || !this.syncQueue.length)) {
          this.syncQueue = state.syncQueue.map((task) => ({ ...task }));
          storageSet(SYNC_QUEUE_KEY, this.syncQueue);
          this.requestBackgroundSync();
          changed = true;
        }
        if (changed) {
          this.mirrorState();
          this.notify();
        }
      } catch (error) {
        console.warn('Failed to restore state from background', error);
      }
    }
  }

  class WakeLockManager {
    constructor() {
      this.sentinel = null;
      this.enabled = false;
      this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    }

    async enable() {
      if (this.enabled) {
        if (!this.sentinel) {
          this.acquire().catch(() => {});
        }
        return;
      }
      this.enabled = true;
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      await this.acquire();
    }

    async disable() {
      if (!this.enabled) return;
      this.enabled = false;
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      if (this.sentinel) {
        try {
          await this.sentinel.release();
        } catch (error) {
          console.warn('Wake lock release failed', error);
        }
        this.sentinel = null;
      }
    }

    async acquire() {
      if (!this.enabled) return;
      if (typeof navigator === 'undefined' || !navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') {
        return;
      }
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        this.sentinel = sentinel;
        sentinel.addEventListener('release', () => {
          this.sentinel = null;
          if (this.enabled) {
            this.acquire().catch(() => {});
          }
        });
      } catch (error) {
        console.warn('Wake lock request failed', error);
      }
    }

    async handleVisibilityChange() {
      if (document.visibilityState === 'visible' && this.enabled && !this.sentinel) {
        await this.acquire();
      }
    }
  }

  class RouteRecorder {
    constructor(store, crashReporter) {
      this.store = store;
      this.crashReporter = crashReporter;
      this.state = 'idle';
      this.watchId = null;
      this.activeRoute = null;
      this.lastPoint = null;
      this.statusEl = null;
      this.recordBtn = null;
      this.stopBtn = null;
      this.waypointBtn = null;
      this.statusInterval = null;
      this.restored = false;
      this.wakeLock = new WakeLockManager();
    }

    init() {
      this.statusEl = document.getElementById('routeStatus');
      this.recordBtn = document.getElementById('btnRouteRecord');
      this.stopBtn = document.getElementById('btnRouteStop');
      this.waypointBtn = document.getElementById('btnRouteWaypoint');
      if (this.recordBtn) {
        this.recordBtn.addEventListener('click', () => this.toggle());
      }
      if (this.stopBtn) {
        this.stopBtn.addEventListener('click', () => this.stop());
      }
      if (this.waypointBtn) {
        this.waypointBtn.addEventListener('click', () => this.addWaypoint());
      }
      window.addEventListener('online', () => this.updateStatus());
      window.addEventListener('offline', () => this.updateStatus());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.updateStatus();
          if (this.state === 'recording') {
            this.wakeLock.enable().catch(() => {});
          }
        }
      });
      window.addEventListener('beforeunload', () => {
        this.prepareForUnload();
      });
      this.restoreDraft();
      this.updateUI();
    }

    restoreDraft() {
      if (this.restored) return;
      const draft = this.store.getActiveDraft();
      if (!draft) return;
      this.activeRoute = {
        ...draft,
        track: (draft.track || []).slice(),
        waypoints: (draft.waypoints || []).slice(),
      };
      this.state = draft.status || 'paused';
      this.lastPoint = this.activeRoute.track.length ? this.activeRoute.track[this.activeRoute.track.length - 1] : null;
      this.restored = true;
      if (this.state === 'recording') {
        this.startWatch();
        this.wakeLock.enable().catch(() => {});
      }
    }

    toggle() {
      if (this.state === 'idle') {
        this.start();
      } else if (this.state === 'recording') {
        this.pause();
      } else if (this.state === 'paused') {
        this.resume();
      }
    }

    async start() {
      if (!navigator.geolocation) {
        alert('この端末では位置情報を取得できません。');
        return;
      }
      try {
        const permission = await this.checkPermission();
        if (permission === 'denied') {
          this.showPermissionFallback();
          return;
        }
      } catch (error) {
        console.warn('Permission check failed', error);
      }
      const route = {
        id: generateId('route'),
        startAt: Date.now(),
        endAt: null,
        status: 'recording',
        distance: 0,
        durationMs: 0,
        track: [],
        waypoints: [],
        metadata: {
          type: '走行',
          name: '',
          memo: '',
          startNote: '',
          endNote: '',
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.activeRoute = route;
      this.state = 'recording';
      this.lastPoint = null;
      this.store.saveActiveDraft(route);
      this.startWatch();
      this.wakeLock.enable().catch(() => {});
      this.updateUI();
      document.dispatchEvent(new CustomEvent('runlog:recording-started', { detail: { routeId: route.id } }));
    }

    async checkPermission() {
      if (!navigator.permissions || !navigator.permissions.query) return 'prompt';
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state === 'denied') return 'denied';
        if (status.state === 'granted') return 'granted';
        return 'prompt';
      } catch (error) {
        console.warn('permissions.query failed', error);
        return 'prompt';
      }
    }

    showPermissionFallback() {
      const message = [
        '位置情報の権限が必要です。',
        '設定アプリで「位置情報」→本アプリを選択し「常に許可」または「使用中のみ許可」を有効にしてください。',
        '背景で継続取得する場合は電池最適化の除外設定も併せてご確認ください。',
      ].join('\n');
      alert(message);
    }

    startWatch() {
      if (!navigator.geolocation) return;
      if (this.watchId !== null) {
        navigator.geolocation.clearWatch(this.watchId);
      }
      const options = {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      };
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this.handlePosition(pos),
        (error) => {
          console.warn('位置情報の取得に失敗しました', error);
          this.crashReporter.capture(error, { type: 'geolocation', phase: 'watchPosition' });
        },
        options,
      );
      this.ensureTicker();
    }

    stopWatch() {
      if (this.watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(this.watchId);
      }
      this.watchId = null;
      this.clearTicker();
    }

    prepareForUnload() {
      if (this.activeRoute) {
        this.activeRoute.updatedAt = Date.now();
        this.store.saveActiveDraft(this.activeRoute);
      }
      if (this.state === 'recording') {
        this.wakeLock.disable().catch(() => {});
      }
    }

    ensureTicker() {
      if (this.statusInterval) return;
      this.statusInterval = window.setInterval(() => this.updateStatus(), 1000);
    }

    clearTicker() {
      if (this.statusInterval) {
        window.clearInterval(this.statusInterval);
        this.statusInterval = null;
      }
    }

    pause() {
      if (this.state !== 'recording') return;
      this.state = 'paused';
      this.stopWatch();
      if (this.activeRoute) {
        this.activeRoute.status = 'paused';
        this.activeRoute.updatedAt = Date.now();
        this.store.saveActiveDraft(this.activeRoute);
      }
      this.wakeLock.disable().catch(() => {});
      this.updateUI();
      document.dispatchEvent(new CustomEvent('runlog:recording-paused', { detail: { routeId: this.activeRoute?.id } }));
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'recording';
      if (this.activeRoute) {
        this.activeRoute.status = 'recording';
        this.activeRoute.updatedAt = Date.now();
        this.store.saveActiveDraft(this.activeRoute);
      }
      this.startWatch();
      this.wakeLock.enable().catch(() => {});
      this.updateUI();
      document.dispatchEvent(new CustomEvent('runlog:recording-resumed', { detail: { routeId: this.activeRoute?.id } }));
    }

    stop() {
      if (!this.activeRoute) return;
      if (this.state === 'idle') return;
      this.stopWatch();
      this.wakeLock.disable().catch(() => {});
      const now = Date.now();
      this.activeRoute.endAt = now;
      this.activeRoute.status = 'completed';
      this.activeRoute.updatedAt = now;
      this.activeRoute.durationMs = this.activeRoute.startAt ? Math.max(0, now - this.activeRoute.startAt) : 0;
      if (this.activeRoute.track.length) {
        const start = this.activeRoute.track[0];
        const end = this.activeRoute.track[this.activeRoute.track.length - 1];
        if (start && !this.activeRoute.metadata.startNote) {
          this.activeRoute.metadata.startNote = `${start.lat.toFixed(5)}, ${start.lon.toFixed(5)}`;
        }
        if (end && !this.activeRoute.metadata.endNote) {
          this.activeRoute.metadata.endNote = `${end.lat.toFixed(5)}, ${end.lon.toFixed(5)}`;
        }
      }
      if (!this.activeRoute.metadata) {
        this.activeRoute.metadata = {};
      }
      const defaultName = this.activeRoute.metadata.name || (this.activeRoute.startAt ? formatDateTime(this.activeRoute.startAt) : '');
      const nameInput = window.prompt('ルート名を入力してください（任意）', defaultName);
      if (nameInput !== null) {
        this.activeRoute.metadata.name = nameInput.trim();
      }
      this.store.upsertRoute(this.activeRoute);
      this.store.saveActiveDraft(null);
      document.dispatchEvent(new CustomEvent('runlog:recording-stopped', { detail: { routeId: this.activeRoute.id } }));
      this.activeRoute = null;
      this.lastPoint = null;
      this.state = 'idle';
      this.updateUI();
    }

    addWaypoint() {
      if (!this.activeRoute) return;
      if (!this.activeRoute.track.length) {
        alert('まだ位置が記録されていません。');
        return;
      }
      const label = window.prompt('通過点のメモ（任意）を入力してください。', '');
      const last = this.activeRoute.track[this.activeRoute.track.length - 1];
      this.activeRoute.waypoints.push({
        id: generateId('wp'),
        lat: last.lat,
        lon: last.lon,
        time: last.time,
        memo: label || '',
      });
      this.activeRoute.updatedAt = Date.now();
      this.store.saveActiveDraft(this.activeRoute);
      this.updateStatus();
      document.dispatchEvent(new CustomEvent('runlog:waypoint-added', { detail: { routeId: this.activeRoute.id } }));
    }

    handlePosition(position) {
      if (!this.activeRoute) return;
      const coords = position.coords || {};
      const latitude = Number(coords.latitude);
      const longitude = Number(coords.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      const point = {
        lat: latitude,
        lon: longitude,
        speed: Number.isFinite(coords.speed) ? coords.speed : null,
        bearing: Number.isFinite(coords.heading) ? coords.heading : null,
        accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
        time: position.timestamp || Date.now(),
        source: 'gps',
      };
      if (!this.shouldRecordPoint(point)) {
        return;
      }
      this.commitPoint(point);
      this.store.saveActiveDraft(this.activeRoute);
      this.updateStatus();
    }

    shouldRecordPoint(point) {
      if (!this.activeRoute) return false;
      if (!this.activeRoute.track.length) return true;
      const previous = this.activeRoute.track[this.activeRoute.track.length - 1];
      const distance = haversineDistanceMeters(previous.lat, previous.lon, point.lat, point.lon);
      const timeDiff = Math.abs(point.time - previous.time);
      const prevBearing = previous.bearing ?? calculateBearing(previous.lat, previous.lon, point.lat, point.lon);
      const nextBearing = point.bearing ?? prevBearing;
      const angleDiff = Math.abs(prevBearing - nextBearing);
      const normalizedAngle = angleDiff > 180 ? 360 - angleDiff : angleDiff;
      if (distance >= MIN_SAMPLE_DISTANCE_M) return true;
      if (timeDiff >= MIN_SAMPLE_TIME_MS) return true;
      if (normalizedAngle >= MIN_SAMPLE_ANGLE_DEG) return true;
      return false;
    }

    commitPoint(point) {
      if (!this.activeRoute) return;
      const track = this.activeRoute.track;
      if (track.length) {
        const prev = track[track.length - 1];
        const distance = haversineDistanceMeters(prev.lat, prev.lon, point.lat, point.lon);
        if (distance > 0) {
          this.activeRoute.distance += distance;
        }
        const timeDiff = Math.abs(point.time - prev.time);
        if (distance >= LARGE_GAP_DISTANCE_M && timeDiff >= LARGE_GAP_TIME_MS) {
          const segments = Math.min(3, Math.max(1, Math.round(distance / LARGE_GAP_DISTANCE_M)));
          for (let i = 1; i < segments; i += 1) {
            const ratio = i / segments;
            track.push({
              lat: prev.lat + (point.lat - prev.lat) * ratio,
              lon: prev.lon + (point.lon - prev.lon) * ratio,
              time: prev.time + (point.time - prev.time) * ratio,
              speed: null,
              bearing: calculateBearing(prev.lat, prev.lon, point.lat, point.lon),
              accuracy: null,
              source: 'interpolated',
            });
          }
        }
      }
      track.push(point);
      this.lastPoint = point;
      if (!this.activeRoute.waypoints.length) {
        this.activeRoute.waypoints.push({ id: generateId('wp'), lat: point.lat, lon: point.lon, time: point.time, memo: '開始地点' });
      }
      this.activeRoute.durationMs = this.activeRoute.startAt ? Math.max(0, point.time - this.activeRoute.startAt) : 0;
      this.activeRoute.updatedAt = Date.now();
    }

    updateUI() {
      this.updateButtons();
      this.updateStatus();
    }

    updateButtons() {
      if (!this.recordBtn) return;
      if (this.state === 'idle') {
        this.recordBtn.textContent = 'ルート記録開始';
        if (this.stopBtn) this.stopBtn.hidden = true;
        if (this.waypointBtn) this.waypointBtn.hidden = true;
      } else if (this.state === 'recording') {
        this.recordBtn.textContent = '一時停止';
        if (this.stopBtn) this.stopBtn.hidden = false;
        if (this.waypointBtn) this.waypointBtn.hidden = false;
      } else if (this.state === 'paused') {
        this.recordBtn.textContent = '再開';
        if (this.stopBtn) this.stopBtn.hidden = false;
        if (this.waypointBtn) this.waypointBtn.hidden = true;
      }
    }

    updateStatus() {
      if (!this.statusEl) return;
      if (!this.activeRoute) {
        this.statusEl.textContent = navigator.onLine ? '未記録' : '未記録（オフライン）';
        return;
      }
      const duration = this.activeRoute.durationMs || (this.activeRoute.startAt ? Math.max(0, Date.now() - this.activeRoute.startAt) : 0);
      const distance = this.activeRoute.distance || 0;
      const pointCount = this.activeRoute.track.length;
      const base = `${formatDistance(distance)} / ${formatDuration(duration)} / ${pointCount}点`;
      if (this.state === 'recording') {
        this.statusEl.textContent = navigator.onLine ? `記録中: ${base}` : `記録中(オフライン): ${base}`;
      } else if (this.state === 'paused') {
        this.statusEl.textContent = `一時停止中: ${base}`;
      } else {
        this.statusEl.textContent = base;
      }
    }
  }

  class RouteHistoryView {
    constructor(store) {
      this.store = store;
      this.selectedRouteId = null;
      this.filters = {
        startDate: null,
        endDate: null,
        name: '',
        recordedDate: '',
      };
      this.listEl = null;
      this.summaryEl = null;
      this.detailsEl = null;
      this.selection = new Set();
    }

    init() {
      const button = document.getElementById('btnHistory');
      if (button) {
        button.addEventListener('click', () => this.show());
      }
      document.addEventListener('runlog:routes-changed', () => {
        if (this.listEl) {
          this.refresh();
        }
      });
    }

    show() {
      const content = document.getElementById('content');
      if (!content) return;
      content.innerHTML = this.template();
      this.cacheElements();
      this.bindControls();
      this.refresh();
    }

    template() {
      const nameOptions = this.getNameOptions().map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
      const dateOptions = this.getDateOptions().map((date) => `<option value="${date}">${escapeHtml(formatDisplayDate(date))}</option>`).join('');
      return `
        <section class="history-container">
          <h2>ルート一覧</h2>
          <div class="history-controls">
            <div class="history-control-group">
              <label>開始日<input type="date" id="historyStart"></label>
              <label>終了日<input type="date" id="historyEnd"></label>
            </div>
            <div class="history-control-group">
              <label>ルート名
                <select id="historyName">
                  <option value="">すべて</option>
                  ${nameOptions}
                </select>
              </label>
              <label>記録日
                <select id="historyDate">
                  <option value="">すべて</option>
                  ${dateOptions}
                </select>
              </label>
            </div>
            <div class="history-actions">
              <button type="button" id="historyDeleteSelected" disabled>選択削除</button>
              <button type="button" id="historySaveDrafts" disabled>保存</button>
              <button type="button" id="historyUndo" disabled>取り消し</button>
              <button type="button" id="historyRedo" disabled>やり直し</button>
            </div>
          </div>
          <div id="historySummary" class="history-summary"></div>
          <div class="history-content">
            <div id="historyList" class="history-list" aria-live="polite"></div>
            <div id="historyDetails" class="history-details" aria-live="polite"></div>
          </div>
        </section>
      `;
    }

    cacheElements() {
      this.listEl = document.getElementById('historyList');
      this.summaryEl = document.getElementById('historySummary');
      this.detailsEl = document.getElementById('historyDetails');
    }

    bindControls() {
      const startEl = document.getElementById('historyStart');
      const endEl = document.getElementById('historyEnd');
      const nameEl = document.getElementById('historyName');
      const dateEl = document.getElementById('historyDate');
      if (startEl) {
        startEl.value = formatDateInputValue(this.filters.startDate);
        startEl.addEventListener('change', () => {
          this.filters.startDate = startEl.value ? new Date(startEl.value).getTime() : null;
          this.refresh();
        });
      }
      if (endEl) {
        endEl.value = formatDateInputValue(this.filters.endDate);
        endEl.addEventListener('change', () => {
          this.filters.endDate = endEl.value ? new Date(endEl.value).getTime() + 86400000 - 1 : null;
          this.refresh();
        });
      }
      if (nameEl) {
        nameEl.value = this.filters.name;
        nameEl.addEventListener('change', () => {
          this.filters.name = nameEl.value;
          this.refresh();
        });
      }
      if (dateEl) {
        dateEl.value = this.filters.recordedDate;
        dateEl.addEventListener('change', () => {
          this.filters.recordedDate = dateEl.value;
          this.refresh();
        });
      }
      const deleteBtn = document.getElementById('historyDeleteSelected');
      if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteSelected());
      const saveBtn = document.getElementById('historySaveDrafts');
      if (saveBtn) saveBtn.addEventListener('click', () => this.saveDrafts());
      const undoBtn = document.getElementById('historyUndo');
      if (undoBtn) undoBtn.addEventListener('click', () => this.undo());
      const redoBtn = document.getElementById('historyRedo');
      if (redoBtn) redoBtn.addEventListener('click', () => this.redo());
    }

    getNameOptions() {
      const routes = this.store.getRoutes();
      const names = routes
        .map((route) => (route.metadata?.name || '').trim())
        .filter(Boolean);
      const unique = Array.from(new Set(names));
      return unique.sort((a, b) => a.localeCompare(b, 'ja-JP'));
    }

    getDateOptions() {
      const routes = this.store.getRoutes();
      const dates = routes
        .map((route) => formatDateKey(route.startAt))
        .filter(Boolean);
      const unique = Array.from(new Set(dates));
      return unique.sort((a, b) => b.localeCompare(a));
    }

    updateFilterOptions() {
      const nameValues = this.getNameOptions();
      const dateValues = this.getDateOptions();
      const nameEl = document.getElementById('historyName');
      if (nameEl) {
        const nameOptions = ['<option value="">すべて</option>']
          .concat(nameValues.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`))
          .join('');
        nameEl.innerHTML = nameOptions;
        if (this.filters.name && !nameValues.includes(this.filters.name)) {
          this.filters.name = '';
        }
        nameEl.value = this.filters.name;
      }
      const dateEl = document.getElementById('historyDate');
      if (dateEl) {
        const dateOptions = ['<option value="">すべて</option>']
          .concat(dateValues.map((date) => `<option value="${date}">${escapeHtml(formatDisplayDate(date))}</option>`))
          .join('');
        dateEl.innerHTML = dateOptions;
        if (this.filters.recordedDate && !dateValues.includes(this.filters.recordedDate)) {
          this.filters.recordedDate = '';
        }
        dateEl.value = this.filters.recordedDate;
      }
    }

    refresh() {
      if (!this.summaryEl || !this.listEl) return;
      this.updateFilterOptions();
      const routes = this.applyFilters(this.store.getRoutes());
      const totals = this.calculateTotals(routes);
      const avgSpeed = totals.duration > 0 ? (totals.distance / 1000) / (totals.duration / 3600000) : 0;
      this.summaryEl.innerHTML = `
        <div>件数: <strong>${routes.length}</strong></div>
        <div>合計距離: <strong>${formatDistance(totals.distance)}</strong></div>
        <div>走行時間: <strong>${formatDuration(totals.duration)}</strong></div>
        <div>平均速度: <strong>${avgSpeed.toFixed(1)} km/h</strong></div>
      `;
      this.renderList(routes);
      this.updateActions();
      if (this.selectedRouteId) {
        const exists = routes.some((route) => route.id === this.selectedRouteId);
        if (!exists && this.detailsEl) {
          this.detailsEl.innerHTML = '';
          this.selectedRouteId = null;
        }
      }
    }

    applyFilters(routes) {
      return routes.filter((route) => {
        const startAt = route.startAt || 0;
        if (this.filters.startDate && startAt < this.filters.startDate) return false;
        if (this.filters.endDate && startAt > this.filters.endDate) return false;
        if (this.filters.name) {
          const routeName = (route.metadata?.name || '').trim();
          if (routeName !== this.filters.name) return false;
        }
        if (this.filters.recordedDate) {
          const recorded = formatDateKey(startAt);
          if (recorded !== this.filters.recordedDate) return false;
        }
        return true;
      });
    }

    calculateTotals(routes) {
      return routes.reduce((acc, route) => {
        acc.distance += route.distance || 0;
        acc.duration += route.durationMs || (route.endAt && route.startAt ? Math.max(0, route.endAt - route.startAt) : 0);
        return acc;
      }, { distance: 0, duration: 0 });
    }

    renderList(routes) {
      if (!this.listEl) return;
      if (!routes.length) {
        this.listEl.innerHTML = '<p>記録がありません。</p>';
        return;
      }
      const drafts = this.store.editDrafts || {};
      this.listEl.innerHTML = routes.map((route) => {
        const selected = this.selection.has(route.id);
        const unsaved = drafts[route.id] ? '<span class="history-unsaved">●未保存</span>' : '';
        const routeName = (route.metadata?.name || '').trim();
        const title = routeName ? escapeHtml(routeName) : formatDateTime(route.startAt);
        const metaParts = [];
        if (routeName) {
          metaParts.push(formatDateTime(route.startAt));
        }
        metaParts.push(formatDistance(route.distance));
        metaParts.push(formatDuration(route.durationMs));
        const metaText = metaParts.join(' / ');
        return `
          <div class="history-item" data-route-id="${route.id}">
            <label class="history-item-select">
              <input type="checkbox" data-role="select" ${selected ? 'checked' : ''}>
            </label>
            <button type="button" class="history-item-open" data-role="open">詳細</button>
            <div class="history-item-body">
              <div class="history-item-title">${title}</div>
              <div class="history-item-meta">${metaText}</div>
            </div>
            ${unsaved}
          </div>
        `;
      }).join('');
      this.listEl.querySelectorAll('.history-item').forEach((item) => {
        const routeId = item.getAttribute('data-route-id');
        const select = item.querySelector('input[data-role="select"]');
        const openBtn = item.querySelector('button[data-role="open"]');
        if (select) {
          select.addEventListener('change', () => {
            if (select.checked) {
              this.selection.add(routeId);
            } else {
              this.selection.delete(routeId);
            }
            this.updateActions();
          });
        }
        if (openBtn) {
          openBtn.addEventListener('click', () => this.openDetails(routeId));
        }
      });
    }

    openDetails(routeId) {
      this.selectedRouteId = routeId;
      const route = this.store.getRoutes().find((item) => item.id === routeId);
      if (!route || !this.detailsEl) return;
      const draft = this.store.getEditDraft(routeId) || {};
      const merged = {
        ...route,
        metadata: {
          ...route.metadata,
          ...draft,
        },
      };
      const routeName = (merged.metadata.name || '').trim();
      this.detailsEl.innerHTML = `
        <article class="history-detail">
          <header>
            <h3>${formatDateTime(merged.startAt)} → ${formatDateTime(merged.endAt)}</h3>
            <div>${formatDistance(merged.distance)} / ${formatDuration(merged.durationMs)}</div>
          </header>
          <section class="history-detail-grid">
            <label>ルート名
              <input type="text" id="routeName" value="${escapeHtml(routeName)}">
            </label>
            <label>種別
              <select id="routeType">
                ${['走行', '積込', '乗船', '休憩', 'その他'].map((type) => `<option value="${type}" ${merged.metadata.type === type ? 'selected' : ''}>${type}</option>`).join('')}
              </select>
            </label>
            <label>開始メモ
              <input type="text" id="routeStartNote" value="${escapeHtml(merged.metadata.startNote || '')}">
            </label>
            <label>終了メモ
              <input type="text" id="routeEndNote" value="${escapeHtml(merged.metadata.endNote || '')}">
            </label>
            <label class="history-detail-full">メモ
              <textarea id="routeMemo" rows="4">${escapeHtml(merged.metadata.memo || '')}</textarea>
            </label>
          </section>
          <section class="history-detail-actions">
            <button type="button" id="routeNavBtn">このルートでナビ</button>
            <button type="button" id="routeDeleteBtn">このルートを削除</button>
          </section>
          <section>
            <h4>トラックポイント (${merged.track.length}点)</h4>
            <div class="history-track-list">${this.renderTrackTable(merged.track)}</div>
          </section>
        </article>
      `;
      this.bindDetails(merged);
      this.updateActions();
    }

    renderTrackTable(track) {
      if (!track.length) return '<p>データがありません。</p>';
      const header = '<div class="history-track-row history-track-header"><span>時刻</span><span>緯度</span><span>経度</span><span>速度(km/h)</span></div>';
      const rows = track.slice(0, 1000).map((point) => {
        const speed = Number.isFinite(point.speed) ? (point.speed * 3.6).toFixed(1) : '-';
        return `<div class="history-track-row"><span>${formatDateTime(point.time)}</span><span>${point.lat.toFixed(5)}</span><span>${point.lon.toFixed(5)}</span><span>${speed}</span></div>`;
      }).join('');
      return header + rows;
    }

    bindDetails(route) {
      const nameEl = document.getElementById('routeName');
      const typeEl = document.getElementById('routeType');
      const startEl = document.getElementById('routeStartNote');
      const endEl = document.getElementById('routeEndNote');
      const memoEl = document.getElementById('routeMemo');
      const navBtn = document.getElementById('routeNavBtn');
      const deleteBtn = document.getElementById('routeDeleteBtn');
      if (nameEl) nameEl.addEventListener('input', () => this.applyEdit(route.id, { name: nameEl.value }));
      if (typeEl) typeEl.addEventListener('change', () => this.applyEdit(route.id, { type: typeEl.value }));
      if (startEl) startEl.addEventListener('input', () => this.applyEdit(route.id, { startNote: startEl.value }));
      if (endEl) endEl.addEventListener('input', () => this.applyEdit(route.id, { endNote: endEl.value }));
      if (memoEl) memoEl.addEventListener('input', () => this.applyEdit(route.id, { memo: memoEl.value }));
      if (navBtn) navBtn.addEventListener('click', () => this.openNavigation(route));
      if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteRoute(route.id));
    }

    applyEdit(routeId, patch) {
      const current = this.store.getEditDraft(routeId) || {};
      const next = { ...current, ...patch };
      const history = this.store.getUndoState(routeId);
      history.undo.push(current);
      history.redo = [];
      this.store.saveUndoState(routeId, history);
      this.store.setEditDraft(routeId, next);
      this.updateActions();
      this.refresh();
    }

    saveDrafts() {
      const drafts = this.store.editDrafts || {};
      Object.entries(drafts).forEach(([routeId, patch]) => {
        const route = this.store.getRoutes().find((item) => item.id === routeId);
        if (!route) return;
        const updated = {
          ...route,
          metadata: {
            ...route.metadata,
            ...patch,
          },
          updatedAt: Date.now(),
        };
        this.store.upsertRoute(updated);
        this.store.setEditDraft(routeId, null);
        this.store.saveUndoState(routeId, { undo: [], redo: [] });
      });
      this.updateActions();
      this.refresh();
    }

    undo() {
      if (!this.selectedRouteId) return;
      const history = this.store.getUndoState(this.selectedRouteId);
      if (!history.undo.length) return;
      const current = this.store.getEditDraft(this.selectedRouteId) || {};
      const previous = history.undo.pop();
      history.redo.push(current);
      this.store.saveUndoState(this.selectedRouteId, history);
      this.store.setEditDraft(this.selectedRouteId, previous);
      this.refresh();
    }

    redo() {
      if (!this.selectedRouteId) return;
      const history = this.store.getUndoState(this.selectedRouteId);
      if (!history.redo.length) return;
      const current = this.store.getEditDraft(this.selectedRouteId) || {};
      const next = history.redo.pop();
      history.undo.push(current);
      this.store.saveUndoState(this.selectedRouteId, history);
      this.store.setEditDraft(this.selectedRouteId, next);
      this.refresh();
    }

    updateActions() {
      const drafts = this.store.editDrafts || {};
      const saveBtn = document.getElementById('historySaveDrafts');
      const undoBtn = document.getElementById('historyUndo');
      const redoBtn = document.getElementById('historyRedo');
      if (saveBtn) saveBtn.disabled = !Object.keys(drafts).length;
      if (undoBtn) {
        const history = this.store.getUndoState(this.selectedRouteId);
        undoBtn.disabled = !history.undo.length;
      }
      if (redoBtn) {
        const history = this.store.getUndoState(this.selectedRouteId);
        redoBtn.disabled = !history.redo.length;
      }
      const deleteSelectedBtn = document.getElementById('historyDeleteSelected');
      if (deleteSelectedBtn) {
        deleteSelectedBtn.disabled = !this.selection.size;
      }
      const detailDeleteBtn = document.getElementById('routeDeleteBtn');
      if (detailDeleteBtn) {
        detailDeleteBtn.disabled = !this.selectedRouteId;
      }
    }

    performDelete(routeId) {
      if (!routeId) return;
      this.store.setEditDraft(routeId, null);
      this.store.saveUndoState(routeId, { undo: [], redo: [] });
      this.store.removeRoute(routeId);
      this.selection.delete(routeId);
      if (this.selectedRouteId === routeId) {
        this.selectedRouteId = null;
        if (this.detailsEl) {
          this.detailsEl.innerHTML = '';
        }
      }
    }

    deleteRoute(routeId) {
      if (!routeId) return;
      const route = this.store.getRoutes().find((item) => item.id === routeId);
      const label = (route?.metadata?.name || '').trim() || formatDateTime(route?.startAt) || 'このルート';
      if (!window.confirm(`${label} を削除しますか？`)) return;
      this.performDelete(routeId);
      this.refresh();
    }

    deleteSelected() {
      if (!this.selection.size) return;
      const count = this.selection.size;
      if (!window.confirm(`選択した${count}件のルートを削除しますか？`)) return;
      [...this.selection].forEach((routeId) => {
        this.performDelete(routeId);
      });
      this.refresh();
    }

    openNavigation(route) {
      if (!route.track.length) {
        alert('位置データがありません。');
        return;
      }
      const origin = route.track[0];
      const destination = route.track[route.track.length - 1];
      const waypoints = this.buildWaypoints(route);
      const params = new URLSearchParams({
        api: '1',
        origin: `${origin.lat},${origin.lon}`,
        destination: `${destination.lat},${destination.lon}`,
        travelmode: 'driving',
      });
      if (waypoints.length) {
        params.set('waypoints', waypoints.map((wp) => `${wp.lat},${wp.lon}`).join('|'));
      }
      window.open(`https://www.google.com/maps/dir/?${params.toString()}`);
    }

    buildWaypoints(route) {
      const waypoints = [...(route.waypoints || [])];
      if (!waypoints.length) {
        const track = route.track || [];
        if (track.length <= 2) return [];
        const step = Math.max(1, Math.floor(track.length / MAX_NAV_WAYPOINTS));
        for (let i = step; i < track.length - 1; i += step) {
          waypoints.push({ lat: track[i].lat, lon: track[i].lon });
          if (waypoints.length >= MAX_NAV_WAYPOINTS) break;
        }
      }
      return waypoints.slice(0, MAX_NAV_WAYPOINTS);
    }

    startReplay(route) {
      const canvas = document.getElementById('routeReplayCanvas');
      const speedEl = document.getElementById('routeReplaySpeed');
      if (!canvas || !canvas.getContext) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const track = route.track || [];
      if (track.length < 2) {
        ctx.fillStyle = '#64748b';
        ctx.font = '16px sans-serif';
        ctx.fillText('ポイント不足', 20, canvas.height / 2);
        return;
      }
      const bounds = track.reduce((acc, point) => {
        acc.minLat = Math.min(acc.minLat, point.lat);
        acc.maxLat = Math.max(acc.maxLat, point.lat);
        acc.minLon = Math.min(acc.minLon, point.lon);
        acc.maxLon = Math.max(acc.maxLon, point.lon);
        return acc;
      }, { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity });
      const padding = 20;
      const width = canvas.width - padding * 2;
      const height = canvas.height - padding * 2;
      const latSpan = Math.max(0.0001, bounds.maxLat - bounds.minLat);
      const lonSpan = Math.max(0.0001, bounds.maxLon - bounds.minLon);
      const scale = Math.min(width / lonSpan, height / latSpan);
      const points = track.map((point) => ({
        x: padding + (point.lon - bounds.minLon) * scale,
        y: canvas.height - (padding + (point.lat - bounds.minLat) * scale),
      }));
      let progress = 0;
      const speed = speedEl ? Number(speedEl.value) || 1 : 1;
      const totalSegments = points.length - 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#2563eb';
      ctx.lineCap = 'round';
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.forEach((pt) => ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
        const index = Math.floor(progress);
        const partial = progress - index;
        ctx.strokeStyle = '#2563eb';
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i <= index && i < points.length; i += 1) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        if (index + 1 < points.length) {
          const current = points[index];
          const next = points[index + 1];
          ctx.lineTo(
            current.x + (next.x - current.x) * partial,
            current.y + (next.y - current.y) * partial,
          );
        }
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        const head = index + 1 < points.length ? points[index + 1] : points[points.length - 1];
        ctx.beginPath();
        ctx.arc(head.x, head.y, 6, 0, Math.PI * 2);
        ctx.fill();
        progress += 0.02 * speed;
        if (progress < totalSegments) {
          window.requestAnimationFrame(draw);
        }
      };
      window.requestAnimationFrame(draw);
    }

  }

  function setupHistoryButton(historyView) {
    const button = document.getElementById('btnHistory');
    if (button) {
      button.addEventListener('click', () => {
        if (typeof window.navigateToRouteHistory === 'function') {
          window.navigateToRouteHistory();
        } else {
          historyView.show();
        }
      });
    }
  }

  async function requestPersistentStorage() {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
      return;
    }
    try {
      const persisted = await navigator.storage.persisted();
      if (!persisted) {
        await navigator.storage.persist();
      }
    } catch (error) {
      console.warn('Persistent storage request failed', error);
    }
  }

  function bootstrap() {
    appState.crashReporter = new CrashReporter();
    appState.backgroundSync = new BackgroundStateSync();
    appState.store = new RouteStore(appState.backgroundSync);
    appState.store.restoreFromBackground();
    appState.splash = new SplashController();
    appState.recorder = new RouteRecorder(appState.store, appState.crashReporter);
    appState.history = new RouteHistoryView(appState.store);

    appState.splash.attach();
    appState.recorder.init();
    appState.history.init();
    setupHistoryButton(appState.history);

    window.showRouteHistory = () => appState.history.show();
    window.toggleRouteRecording = () => appState.recorder.toggle();

    requestPersistentStorage();

    window.addEventListener('online', () => {
      appState.crashReporter.flush();
      appState.store.markSynced(() => false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();

