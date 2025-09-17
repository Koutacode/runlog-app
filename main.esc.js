// main.js - 運行管理アプリ（日本語UI）

// 走行ログ
let logs = [];
// メンテナンス記録
let maintenance = [];
const maintenanceGuidelines = {
  'オイル交換': {
    months: 12,
    distance: 30000,
    description: '大型トラックは1年または走行2〜4万kmを目安にエンジンオイルを交換すると安心です。'
  },
  'オイルエレメント交換': {
    months: 12,
    distance: 30000,
    description: 'オイルエレメントもエンジンオイル交換と同じタイミング（1年／2〜4万km）で交換すると安心です。'
  },
  'タイヤ交換': {
    months: 36,
    distance: 40000,
    description: 'トラックタイヤは走行3〜5万kmまたは製造から3〜4年、溝が3.2mmを切る前が交換の目安です。'
  },
  'タイヤローテーション': {
    months: 6,
    distance: 10000,
    description: 'タイヤの偏摩耗を抑えるため、半年または走行1万kmを目安にローテーションを実施すると均等な摩耗が期待できます。'
  },
  '点検': {
    months: 3,
    description: '車両総重量8トン以上の大型トラックは3カ月ごとの定期点検と1日1回の日常（運行前）点検が義務付けられています。'
  },
  '車検': {
    months: 12,
    description: '大型トラックの車検有効期間は初回から毎回1年です。'
  },
  'バッテリー交換': {
    months: 36,
    description: 'トラック用バッテリーの平均寿命は使用状況にもよりますが3〜4年程度です。'
  },
  'ワイパー交換': {
    months: 12,
    description: 'ワイパーゴムは1年程度、ブレードは1〜2年を目安に状態を確認して交換しましょう。'
  }
};
const DAY_MS = 24 * 60 * 60 * 1000;

// ワンタップ開始/終了の状態
let currentTripStartTime = null;
let currentTripEvents = [];
let currentTripStartAddress = '';
let currentTripStartLat = null;
let currentTripStartLon = null;
let currentTripStartOdo = '';

const DRIVING_EVENT_TYPE = '走行中';

const eventButtonMap = {
  '積み込み': { id: 'btnLoad', start: '積み込み', code: 'Load' },
  '荷下ろし': { id: 'btnUnload', start: '荷下ろし', code: 'Unload' },
  '乗船': { id: 'btnBoard', start: '乗船', end: '下船', code: 'Board' },
  '休憩': { id: 'btnBreak', start: '休憩', code: 'Break' },
  '休息': { id: 'btnRest', start: '休息', code: 'Rest' }
};

function findLatestOngoingEvent(type) {
  return [...currentTripEvents].reverse().find((ev) => ev && ev.type === type && !ev.endTime);
}

function findOngoingTaskEvent() {
  return [...currentTripEvents].reverse().find((ev) => {
    if (!ev || ev.endTime) return false;
    if (ev.type === DRIVING_EVENT_TYPE) return false;
    if (ev.type === '運行開始' || ev.type === '運行終了') return false;
    return true;
  });
}

function startDrivingSegment(timestamp = Date.now()) {
  if (!currentTripStartTime) return;
  const existing = findLatestOngoingEvent(DRIVING_EVENT_TYPE);
  if (existing) return;
  const activeTask = findOngoingTaskEvent();
  if (activeTask) return;
  const startMs = (typeof timestamp === 'number' && !Number.isNaN(timestamp)) ? timestamp : Date.now();
  const startDate = new Date(startMs);
  const startLabel = Number.isNaN(startDate.getTime()) ? '' : startDate.toTimeString().slice(0, 5);
  currentTripEvents.push({
    type: DRIVING_EVENT_TYPE,
    startTime: startLabel,
    endTime: '',
    location: '',
    lat: null,
    lon: null,
    fuelAmount: '',
    fuelPrice: '',
    cargo: '',
    startTimestamp: startMs,
    endTimestamp: null,
    durationSec: 0
  });
  updateCurrentStatusDisplay();
}

function stopDrivingSegment(timestamp = Date.now()) {
  const ongoing = findLatestOngoingEvent(DRIVING_EVENT_TYPE);
  if (!ongoing) return;
  const endMs = (typeof timestamp === 'number' && !Number.isNaN(timestamp)) ? timestamp : Date.now();
  const endDate = new Date(endMs);
  ongoing.endTime = Number.isNaN(endDate.getTime()) ? '' : endDate.toTimeString().slice(0, 5);
  ongoing.endTimestamp = endMs;
  if (typeof ongoing.startTimestamp !== 'number' || Number.isNaN(ongoing.startTimestamp)) {
    ongoing.startTimestamp = endMs;
    ongoing.durationSec = 0;
  } else {
    const diff = Math.max(0, Math.round((endMs - ongoing.startTimestamp) / 1000));
    ongoing.durationSec = diff;
  }
}

function updateCurrentStatusDisplay() {
  const indicator = document.getElementById('statusIndicator');
  if (!indicator) return;
  let label = '停止中';
  let statusClass = 'status-inactive';
  if (currentTripStartTime) {
    const activeTask = findOngoingTaskEvent();
    if (activeTask) {
      const cargoText = activeTask.type === '積み込み' && typeof activeTask.cargo === 'string'
        ? activeTask.cargo.trim()
        : '';
      label = cargoText ? `${activeTask.type}（${cargoText}）` : activeTask.type;
      statusClass = 'status-task';
    } else {
      label = DRIVING_EVENT_TYPE;
      statusClass = 'status-driving';
    }
  }
  indicator.textContent = label;
  indicator.classList.remove('status-inactive', 'status-driving', 'status-task');
  indicator.classList.add(statusClass);
}

const geoOptions = { enableHighAccuracy: false, maximumAge: 600000, timeout: 5000 };
let deferredInstallPrompt = null;
const CURRENT_TRIP_STORAGE_KEY = 'runlog_currentTrip';

function updateTripButtonUI() {
  const btn = document.getElementById('toggleTripBtn');
  const label = document.getElementById('toggleLabel');
  if (!btn || !label) return;
  if (currentTripStartTime) {
    label.textContent = '運行終了';
    btn.classList.remove('start');
    btn.classList.add('stop');
  } else {
    label.textContent = '運行開始';
    btn.classList.remove('stop');
    btn.classList.add('start');
  }
}

function clearCurrentTripState() {
  try {
    localStorage.removeItem(CURRENT_TRIP_STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear current trip state', err);
  }
}

function saveCurrentTripState() {
  if (!currentTripStartTime) {
    clearCurrentTripState();
    return;
  }
  try {
    const payload = {
      startTime: currentTripStartTime.getTime(),
      startAddress: currentTripStartAddress || '',
      startLat: currentTripStartLat === undefined ? null : currentTripStartLat,
      startLon: currentTripStartLon === undefined ? null : currentTripStartLon,
      startOdo: currentTripStartOdo || '',
      events: currentTripEvents.map((ev) => ({
        ...ev,
        lat: ev.lat === undefined ? null : ev.lat,
        lon: ev.lon === undefined ? null : ev.lon
      }))
    };
    localStorage.setItem(CURRENT_TRIP_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save current trip state', err);
  }
}

function loadCurrentTripState() {
  try {
    const stored = localStorage.getItem(CURRENT_TRIP_STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return;
    if (typeof parsed.startTime !== 'number' || Number.isNaN(parsed.startTime)) return;
    const startDate = new Date(parsed.startTime);
    if (Number.isNaN(startDate.getTime())) return;
    currentTripStartTime = startDate;
    currentTripStartAddress = parsed.startAddress || '';
    currentTripStartLat = parsed.startLat ?? null;
    currentTripStartLon = parsed.startLon ?? null;
    currentTripStartOdo = parsed.startOdo || '';
    if (Array.isArray(parsed.events)) {
      currentTripEvents = parsed.events.map((ev) => {
        const cargo = typeof ev.cargo === 'string' ? ev.cargo.trim() : '';
        return {
          ...ev,
          lat: ev.lat ?? null,
          lon: ev.lon ?? null,
          cargo
        };
      });
    } else {
      currentTripEvents = [];
    }
  } catch (err) {
    console.warn('Failed to load current trip state', err);
    clearCurrentTripState();
  }
}

function restoreEventButtonStates() {
  resetEventButtons();
  if (!currentTripStartTime) {
    updateCurrentStatusDisplay();
    return;
  }
  Object.keys(eventButtonMap).forEach((jpType) => {
    const ongoing = [...currentTripEvents].reverse().find((ev) => ev.type === jpType && !ev.endTime);
    if (ongoing) {
      updateEventButton(jpType, true);
    }
  });
  updateCurrentStatusDisplay();
}

function normalizeAddress(address) {
  if (!address) return '';
  const raw = String(address).trim();
  if (!raw) return '';
  const sanitized = raw
    .replace(/[\u3000\s]+/g, ' ')
    .replace(/[，、]/g, ',')
    .replace(/[。]/g, '')
    .replace(/[()]/g, '');
  const parts = sanitized.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return sanitized.replace(/\s+/g, '');
  }
  const seen = new Set();
  const unique = [];
  parts.forEach((part) => {
    const trimmed = part.replace(/\s+/g, ' ').trim();
    const key = trimmed.replace(/\s+/g, '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(trimmed);
  });
  if (unique.length === 0) {
    return sanitized.replace(/\s+/g, '');
  }
  const normalized = unique.map((part) => part.replace(/\s+/g, ''));
  const postal = [];
  const others = [];
  normalized.forEach((part) => {
    if (/^〒?\d/.test(part)) {
      postal.push(part.startsWith('〒') ? part : `〒${part}`);
    } else {
      others.push(part);
    }
  });
  return [...postal, ...others].join('');
}

function dateStringToUTC(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map((segment) => Number(segment));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [year, month, day] = parts;
  return Date.UTC(year, month - 1, day);
}

function timestampToDateString(timestamp) {
  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateToLocalDateString(date) {
  if (!(date instanceof Date)) return '';
  return timestampToDateString(date.getTime());
}

function addMonthsToDateString(dateStr, months) {
  if (!dateStr || typeof months !== 'number') return '';
  const parts = dateStr.split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
  let [year, month, day] = parts;
  let totalMonths = month - 1 + months;
  year += Math.floor(totalMonths / 12);
  let monthIndex = totalMonths % 12;
  if (monthIndex < 0) {
    monthIndex += 12;
    year -= 1;
  }
  const newMonth = monthIndex + 1;
  const maxDay = new Date(Date.UTC(year, newMonth, 0)).getUTCDate();
  const newDay = Math.min(day, maxDay);
  const y = year;
  const m = String(newMonth).padStart(2, '0');
  const d = String(newDay).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMaintenanceStatusLabel(nextDate) {
  if (!nextDate) return '';
  const target = dateStringToUTC(nextDate);
  if (target === null) return '';
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (target < today) return '⚠️ 目安を過ぎています';
  const diffDays = Math.floor((target - today) / DAY_MS);
  if (diffDays <= 30) return '⏰ 30日以内に実施を検討してください';
  return '';
}

function calculateNextMaintenance(entry) {
  const preset = maintenanceGuidelines[entry.type];
  if (!preset) {
    return { nextDate: '', nextOdo: null, advice: '' };
  }
  let nextDate = '';
  if (preset.months && entry.date) {
    nextDate = addMonthsToDateString(entry.date, preset.months);
  }
  let nextOdo = null;
  if (preset.distance && entry.odometer !== '') {
    const odoValue = typeof entry.odometer === 'number' ? entry.odometer : Number(entry.odometer);
    if (!Number.isNaN(odoValue)) {
      nextOdo = odoValue + preset.distance;
    }
  }
  const advice = preset.description || '';
  return { nextDate, nextOdo, advice };
}

function enrichMaintenanceEntry(entry) {
  const base = { ...entry };
  const calc = calculateNextMaintenance(base);
  base.nextDate = calc.nextDate;
  base.nextOdo = calc.nextOdo;
  base.advice = calc.advice;
  return base;
}

function maintenanceInfoSegments(entry) {
  if (!entry) return [];
  const segments = [];
  const status = getMaintenanceStatusLabel(entry.nextDate);
  if (status) segments.push(status);
  if (entry.nextDate) segments.push(`次回目安日: ${entry.nextDate}`);
  if (typeof entry.nextOdo === 'number' && !Number.isNaN(entry.nextOdo)) {
    segments.push(`走行距離目安: 約${Math.round(entry.nextOdo).toLocaleString('ja-JP')}km`);
  }
  if (entry.advice) segments.push(entry.advice);
  return segments;
}

function maintenanceInfoHTML(entry) {
  const parts = maintenanceInfoSegments(entry);
  if (parts.length) return parts.join('<br>');
  if (entry && entry.type && !maintenanceGuidelines[entry.type]) {
    return '記録済み（自動目安なし）';
  }
  return 'ー';
}

function maintenanceInfoText(entry) {
  const parts = maintenanceInfoSegments(entry);
  if (parts.length) return parts.join(' / ');
  if (entry && entry.type && !maintenanceGuidelines[entry.type]) {
    return '記録済み（自動目安なし）';
  }
  return 'ー';
}

function isDateWithinLog(log, targetDate) {
  if (!log || !targetDate) return false;
  const target = dateStringToUTC(targetDate);
  if (target === null) return false;
  const start = dateStringToUTC(log.startDate);
  const end = dateStringToUTC(log.endDate || log.startDate);
  const startValue = start === null ? target : start;
  const endValue = end === null ? startValue : end;
  const from = Math.min(startValue, endValue);
  const to = Math.max(startValue, endValue);
  if (Number.isNaN(from) || Number.isNaN(to)) return false;
  return target >= from && target <= to;
}

function eventMatchesDate(event, log, targetDate) {
  if (!event || !log || !targetDate) return false;
  const startDate = timestampToDateString(event.startTimestamp);
  const endDate = timestampToDateString(event.endTimestamp);
  if (startDate === targetDate || endDate === targetDate) return true;
  if (startDate && endDate) {
    const targetUtc = dateStringToUTC(targetDate);
    const startUtc = dateStringToUTC(startDate);
    const endUtc = dateStringToUTC(endDate);
    if (targetUtc !== null && startUtc !== null && endUtc !== null) {
      if (targetUtc >= Math.min(startUtc, endUtc) && targetUtc <= Math.max(startUtc, endUtc)) return true;
    }
  }
  if (startDate && !endDate) {
    const targetUtc = dateStringToUTC(targetDate);
    const startUtc = dateStringToUTC(startDate);
    if (targetUtc !== null && startUtc !== null && targetUtc >= startUtc && isDateWithinLog(log, targetDate)) return true;
  }
  if (!startDate && endDate) {
    const targetUtc = dateStringToUTC(targetDate);
    const endUtc = dateStringToUTC(endDate);
    if (targetUtc !== null && endUtc !== null && targetUtc <= endUtc && isDateWithinLog(log, targetDate)) return true;
  }
  if (!startDate && !endDate) {
    return isDateWithinLog(log, targetDate);
  }
  return false;
}

window.addEventListener('beforeunload', (e) => {
  if (currentTripStartTime || currentTripEvents.length > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function applyDeviceClass() {
  const ua = navigator.userAgent.toLowerCase();
  const isFold = ua.includes('z fold') || ua.includes('sm-f96') || ua.includes('sm-f97') || (ua.includes('samsung') && ua.includes('fold'));
  const body = document.body;
  if (!body) return;
  body.classList.add(isFold ? 'fold' : 'android');
}

function updateEventButton(jpType, ongoing) {
  const map = eventButtonMap[jpType];
  if (!map) return;
  const btn = document.getElementById(map.id);
  if (!btn) return;
  if (ongoing) {
    const endLabel = map.end ?? '終了';
    btn.textContent = endLabel;
    btn.disabled = false;
    btn.onclick = () => finishEvent(jpType);
  } else {
    btn.textContent = map.start;
    btn.disabled = false;
    btn.onclick = () => recordEvent(map.code);
  }
}

function resetEventButtons() {
  Object.values(eventButtonMap).forEach(({ id, start, code }) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.textContent = start;
      btn.disabled = false;
      btn.onclick = () => recordEvent(code);
    }
  });
}

function showOverlay(message = '記録中...') {
  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.textContent = message;
    overlay.classList.remove('hidden');
  }
}

function hideOverlay() {
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.classList.add('hidden');
}

function toggleTrip() {
  const btn = document.getElementById('toggleTripBtn');
  if (!currentTripStartTime) {
    currentTripStartTime = new Date();
    currentTripStartAddress = '';
    currentTripStartOdo = '';
    currentTripEvents = [];
    updateCurrentStatusDisplay();
    const startOdoStr = prompt('開始オドメーター（任意）:');
    currentTripStartOdo = startOdoStr ? startOdoStr.trim() : '';
    currentTripStartLat = null;
    currentTripStartLon = null;
    saveCurrentTripState();
    const startTimeStr = currentTripStartTime.toTimeString().slice(0, 5);
    const label = document.getElementById('toggleLabel');
    if (label) label.textContent = '運行終了';
    if (btn) {
      btn.classList.remove('start');
      btn.classList.add('stop');
    }
    updateTripButtonUI();
    resetEventButtons();
    function finalizeStart(addr, lat, lon) {
      hideOverlay();
      currentTripStartAddress = normalizeAddress(addr || '');
      currentTripStartLat = lat;
      currentTripStartLon = lon;
      currentTripEvents.push({
        type: '運行開始',
        startTime: startTimeStr,
        endTime: '',
        location: currentTripStartAddress,
        lat,
        lon,
        fuelAmount: '',
        fuelPrice: '',
        startTimestamp: currentTripStartTime.getTime(),
        endTimestamp: null,
        durationSec: 0
      });
      startDrivingSegment(currentTripStartTime.getTime());
      saveCurrentTripState();
    }
    showOverlay();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ja&lat=${lat}&lon=${lon}`)
            .then((r) => r.json())
            .then((d) => finalizeStart(d.display_name, lat, lon))
            .catch(() => finalizeStart('', lat, lon));
        },
        () => finalizeStart('', null, null),
        geoOptions
      );
    } else {
      finalizeStart('', null, null);
    }
  } else {
    const endTime = new Date();
    const startDate = currentTripStartTime;
    const startDateStr = dateToLocalDateString(startDate);
    const startTimeStr = startDate.toTimeString().slice(0, 5);
    const endDateStr = dateToLocalDateString(endTime);
    const endTimeStr = endTime.toTimeString().slice(0, 5);
    const finalOdoStr = prompt('最終オドメーター（任意）:');
    const finalOdo = finalOdoStr ? finalOdoStr.trim() : '';
    function finalizeEnd(addr, lat, lon) {
      hideOverlay();
      const endAddr = normalizeAddress(addr || '');
      const eventTimestamp = endTime.getTime();
      stopDrivingSegment(eventTimestamp);
      currentTripEvents.push({
        type: '運行終了',
        startTime: endTimeStr,
        endTime: '',
        location: endAddr,
        lat,
        lon,
        fuelAmount: '',
        fuelPrice: '',
        startTimestamp: eventTimestamp,
        endTimestamp: eventTimestamp,
        durationSec: 0
      });
      const logEntry = {
        startDate: startDateStr,
        startTime: startTimeStr,
        endDate: endDateStr,
        endTime: endTimeStr,
        purpose: '',
        start: currentTripStartAddress,
        startLat: currentTripStartLat,
        startLon: currentTripStartLon,
        end: endAddr,
        endLat: lat,
        endLon: lon,
        distance: '',
        cost: '',
        notes: '',
        events: currentTripEvents.slice(),
        startOdo: currentTripStartOdo,
        finalOdo
      };
      logs.push(logEntry);
      saveLogs();
      currentTripStartTime = null;
      currentTripEvents = [];
      currentTripStartOdo = '';
      currentTripStartLat = null;
      currentTripStartLon = null;
      updateCurrentStatusDisplay();
      clearCurrentTripState();
      const label = document.getElementById('toggleLabel');
      if (label) label.textContent = '運行開始';
      if (btn) {
        btn.classList.remove('stop');
        btn.classList.add('start');
      }
      updateTripButtonUI();
      resetEventButtons();
      showList();
    }
    showOverlay();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ja&lat=${lat}&lon=${lon}`)
            .then((r) => r.json())
            .then((d) => finalizeEnd(d.display_name, lat, lon))
            .catch(() => finalizeEnd('', lat, lon));
        },
        () => finalizeEnd('', null, null),
        geoOptions
      );
    } else {
      finalizeEnd('', null, null);
    }
  }
}

// 走行ログ 保存/読込
function loadLogs() {
  try {
    const data = localStorage.getItem('runlog_logs');
    logs = data ? JSON.parse(data) : [];
    logs = logs.map((l) => {
      const events = (l.events || []).map((e) => {
        const startTimestamp = typeof e.startTimestamp === 'number' && !Number.isNaN(e.startTimestamp)
          ? e.startTimestamp
          : null;
        const endTimestamp = typeof e.endTimestamp === 'number' && !Number.isNaN(e.endTimestamp)
          ? e.endTimestamp
          : null;
        let durationSec = typeof e.durationSec === 'number' && !Number.isNaN(e.durationSec)
          ? e.durationSec
          : '';
        if (durationSec === '' && startTimestamp !== null && endTimestamp !== null) {
          durationSec = Math.round((endTimestamp - startTimestamp) / 1000);
        }
        const cargo = typeof e.cargo === 'string' ? e.cargo.trim() : '';
        return {
          type: e.type || '',
          startTime: e.startTime || e.time || '',
          endTime: e.endTime || '',
          location: normalizeAddress(e.location || ''),
          lat: e.lat !== undefined ? e.lat : null,
          lon: e.lon !== undefined ? e.lon : null,
          fuelAmount: e.fuelAmount || '',
          fuelPrice: e.fuelPrice || '',
          cargo,
          startTimestamp,
          endTimestamp,
          durationSec
        };
      });
      return {
        startDate: l.startDate || l.date || '',
        startTime: l.startTime || '',
        endDate: l.endDate || l.date || '',
        endTime: l.endTime || '',
        purpose: l.purpose || '',
        start: normalizeAddress(l.start || ''),
        startLat: l.startLat !== undefined ? l.startLat : null,
        startLon: l.startLon !== undefined ? l.startLon : null,
        end: normalizeAddress(l.end || ''),
        endLat: l.endLat !== undefined ? l.endLat : null,
        endLon: l.endLon !== undefined ? l.endLon : null,
        distance: l.distance || '',
        cost: l.cost || '',
        notes: l.notes || '',
        startOdo: l.startOdo || '',
        events,
        finalOdo: l.finalOdo || ''
      };
    });
  } catch (e) {
    console.error('Failed to parse stored logs', e);
    logs = [];
  }
}
function saveLogs() {
  localStorage.setItem('runlog_logs', JSON.stringify(logs));
}

// メンテナンス 保存/読込
function loadMaintenance() {
  try {
    const data = localStorage.getItem('runlog_maintenance');
    if (data) {
      const parsed = JSON.parse(data);
      maintenance = Array.isArray(parsed) ? parsed.map(enrichMaintenanceEntry) : [];
    } else {
      maintenance = [];
    }
  } catch (e) {
    console.error('Failed to parse maintenance', e);
    maintenance = [];
  }
}
function saveMaintenance() {
  maintenance = maintenance.map(enrichMaintenanceEntry);
  localStorage.setItem('runlog_maintenance', JSON.stringify(maintenance));
}

function getNextMaintenanceSummaries() {
  const latest = {};
  maintenance.forEach((entry) => {
    if (!entry || !entry.type) return;
    if (!latest[entry.type] || (latest[entry.type].date || '') < (entry.date || '')) {
      latest[entry.type] = entry;
    }
  });
  const summaries = [];
  Object.entries(maintenanceGuidelines).forEach(([type, preset]) => {
    const entry = latest[type];
    if (entry) {
      summaries.push({ type, message: maintenanceInfoText(entry) });
      delete latest[type];
    } else {
      const fallback = preset.description ? `記録がありません。${preset.description}` : '記録がありません。';
      summaries.push({ type, message: fallback });
    }
  });
  Object.entries(latest).forEach(([type, entry]) => {
    summaries.push({ type, message: maintenanceInfoText(entry) });
  });
  return summaries;
}

function maintenanceRecommendationsHTML() {
  const items = getNextMaintenanceSummaries()
    .map(({ type, message }) => {
      const formatted = message.replace(/\s\/\s/g, '<br>');
      return `<li><span class="recommend-label">${type}</span><span class="recommend-date">${formatted}</span></li>`;
    })
    .join('');
  return `<div class="maintenance-summary"><h3>次回メンテナンス目安</h3><ul class="maintenance-next-list">${items}</ul></div>`;
}

// 走行ログ フォーム
function showForm(editIndex = -1) {
  const init = {
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    purpose: '',
    start: '',
    end: '',
    distance: '',
    cost: '',
    startOdo: '',
    finalOdo: '',
    notes: ''
  };
  let log = { ...init };
  if (editIndex >= 0) {
    log = { ...logs[editIndex] };
  } else {
    log.startDate = timestampToDateString(Date.now());
    log.endDate = log.startDate;
  }
  const html = `
    <h2>${editIndex >= 0 ? '記録を編集' : '新規記録'}</h2>
    <form id="logForm">
      <div>
        <label for="startDate">開始日:</label>
        <input type="date" id="startDate" value="${log.startDate}">
      </div>
      <div>
        <label for="startTime">開始時刻:</label>
        <input type="time" id="startTime" value="${log.startTime || ''}">
      </div>
      <div>
        <label for="endDate">終了日:</label>
        <input type="date" id="endDate" value="${log.endDate || ''}">
      </div>
      <div>
        <label for="endTime">終了時刻:</label>
        <input type="time" id="endTime" value="${log.endTime || ''}">
      </div>
      <div>
        <label for="purpose">目的:</label>
        <input type="text" id="purpose" value="${log.purpose || ''}" placeholder="荷物・用途など">
      </div>
      <div>
        <label for="start">出発地:</label>
        <input type="text" id="start" value="${log.start || ''}">
      </div>
      <div>
        <label for="end">到着地:</label>
        <input type="text" id="end" value="${log.end || ''}">
      </div>
      <div>
        <label for="distance">距離 (km):</label>
        <input type="number" step="0.1" id="distance" value="${log.distance || ''}">
      </div>
      <div>
        <label for="cost">費用 (円):</label>
        <input type="number" step="0.1" id="cost" value="${log.cost || ''}">
      </div>
      <div>
        <label for="startOdo">開始オドメーター:</label>
        <input type="number" id="startOdo" value="${log.startOdo || ''}">
      </div>
      <div>
        <label for="finalOdo">終了オドメーター:</label>
        <input type="number" id="finalOdo" value="${log.finalOdo || ''}">
      </div>
      <div>
        <label for="notes">メモ:</label>
        <textarea id="notes" rows="3">${log.notes || ''}</textarea>
      </div>
      <div>
        <button type="submit">${editIndex >= 0 ? '保存' : '追加'}</button>
        <button type="button" onclick="showList()">キャンセル</button>
      </div>
      <div id="formError" class="error"></div>
    </form>
  `;
  document.getElementById('content').innerHTML = html;
  document.getElementById('logForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitLog(editIndex);
  });
}

function submitLog(editIndex) {
  const startDate = document.getElementById('startDate').value;
  const startTime = document.getElementById('startTime').value;
  const endDate = document.getElementById('endDate').value;
  const endTime = document.getElementById('endTime').value;
  const purpose = document.getElementById('purpose').value.trim();
  const startInput = document.getElementById('start').value.trim();
  const endInput = document.getElementById('end').value.trim();
  const start = normalizeAddress(startInput);
  const end = normalizeAddress(endInput);
  const distance = parseFloat(document.getElementById('distance').value);
  const cost = parseFloat(document.getElementById('cost').value);
  const startOdoVal = document.getElementById('startOdo').value;
  const finalOdoVal = document.getElementById('finalOdo').value;
  const startOdo = startOdoVal === '' ? '' : Number(startOdoVal);
  const finalOdo = finalOdoVal === '' ? '' : Number(finalOdoVal);
  const notes = document.getElementById('notes').value.trim();
  const errors = [];
  if (!startDate) errors.push('開始日を入力してください。');
  if (!startTime) errors.push('開始時刻を入力してください。');
  if (!endDate) errors.push('終了日を入力してください。');
  if (!endTime) errors.push('終了時刻を入力してください。');
  if (!isNaN(distance) && distance < 0) errors.push('距離は0以上で入力してください。');
  if (!isNaN(cost) && cost < 0) errors.push('費用は0以上で入力してください。');
  if (startOdo !== '' && (isNaN(startOdo) || startOdo < 0)) errors.push('開始オドメーターは0以上で入力してください。');
  if (finalOdo !== '' && (isNaN(finalOdo) || finalOdo < 0)) errors.push('終了オドメーターは0以上で入力してください。');
  const startDateTime = new Date(`${startDate}T${startTime}`);
  const endDateTime = new Date(`${endDate}T${endTime}`);
  if (startDateTime > endDateTime) errors.push('開始日時は終了日時より前でなければなりません。');
  if (errors.length > 0) {
    document.getElementById('formError').innerText = errors.join('\n');
    return;
  }
  const existing = editIndex >= 0 ? logs[editIndex] : {};
  const logEntry = {
    startDate,
    startTime,
    endDate,
    endTime,
    purpose,
    start,
    startLat: existing.startLat || null,
    startLon: existing.startLon || null,
    end,
    endLat: existing.endLat || null,
    endLon: existing.endLon || null,
    distance: isNaN(distance) ? '' : distance,
    cost: isNaN(cost) ? '' : cost,
    startOdo: startOdo === '' ? '' : startOdo,
    finalOdo: finalOdo === '' ? '' : finalOdo,
    notes,
    events: existing.events || []
  };
  if (editIndex >= 0) logs[editIndex] = logEntry; else logs.push(logEntry);
  saveLogs();
  showList();
}

function formatEvents(events) {
  if (!events || events.length === 0) return '<span class="muted">-</span>';
  const items = events.map((ev) => {
    const time = ev.endTime ? `${ev.startTime || ''}～${ev.endTime}` : (ev.startTime || '');
    const durationLabel = ev.durationSec ? `${Math.floor(ev.durationSec / 60)}分${ev.durationSec % 60}秒` : '';
    const fuel = ev.type === '給油' && ev.fuelAmount !== '' ? `${ev.fuelAmount}L` : '';
    const meta = [];
    if (fuel) meta.push(`<span class="event-meta">${fuel}</span>`);
    if (ev.type === '積み込み') {
      const cargoText = typeof ev.cargo === 'string' ? ev.cargo.trim() : '';
      if (cargoText) meta.push(`<span class="event-meta">荷物: ${cargoText}</span>`);
    }
    if (time) meta.push(`<span class="event-time">${time}</span>`);
    if (durationLabel) meta.push(`<span class="event-duration">${durationLabel}</span>`);
    const locationText = ev.location ? normalizeAddress(ev.location) : '';
    if (locationText) {
      meta.push(`<span class="event-meta">${locationText}${mapButton(locationText, ev.lat, ev.lon)}</span>`);
    }
    return `<li><span class="event-label">${ev.type}</span>${meta.join('')}</li>`;
  }).join('');
  return `<ul class="event-list">${items}</ul>`;
}

function openMap(address, lat, lon) {
  if (!address && (lat === undefined || lon === undefined)) return;
  const dest = (lat !== undefined && lon !== undefined && lat !== null && lon !== null)
    ? `${lat},${lon}`
    : address;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  window.open(url, '_blank');
}

function mapButton(address, lat, lon) {
  if (!address) return '';
  const safeAddr = address.replace(/'/g, "\\'");
  const latStr = lat === null || lat === undefined ? 'null' : lat;
  const lonStr = lon === null || lon === undefined ? 'null' : lon;
  return ` <button type="button" class="inline-button" onclick="openMap('${safeAddr}', ${latStr}, ${lonStr})">地図</button>`;
}

function formatText(value, fallback = '未入力') {
  if (value === null || value === undefined) return `<span class="muted">${fallback}</span>`;
  const str = String(value).trim();
  return str ? str : `<span class="muted">${fallback}</span>`;
}

function formatMetric(value, unit = '') {
  if (value === null || value === undefined || value === '') return '<span class="muted">-</span>';
  return `${value}${unit}`;
}

function formatLocation(address, lat, lon) {
  if (!address) return '<span class="muted">未入力</span>';
  const normalized = normalizeAddress(address);
  if (!normalized) return '<span class="muted">未入力</span>';
  return `${normalized}${mapButton(normalized, lat, lon)}`;
}

function renderEventList(events, emptyMessage) {
  if (!Array.isArray(events) || events.length === 0) {
    return `<p class="muted">${emptyMessage || 'イベントは記録されていません。'}</p>`;
  }
  return `
    <ul class="event-list">
      ${events
        .map((ev) => {
          const parts = [];
          parts.push(`<span class="event-label">${ev.type || ''}</span>`);
          const timeRange = ev.startTime
            ? (ev.endTime ? `${ev.startTime}～${ev.endTime}` : ev.startTime)
            : (ev.endTime || '');
          if (timeRange) parts.push(`<span class="event-time">${timeRange}</span>`);
          if (typeof ev.durationSec === 'number' && !Number.isNaN(ev.durationSec) && ev.durationSec > 0) {
            const mins = Math.floor(ev.durationSec / 60);
            const secs = ev.durationSec % 60;
            parts.push(`<span class="event-duration">${mins}分${secs}秒</span>`);
          }
          if (ev.type === '給油') {
            if (ev.fuelAmount !== '' && ev.fuelAmount !== undefined && ev.fuelAmount !== null) {
              parts.push(`<span class="event-meta">${ev.fuelAmount}L</span>`);
            }
            if (ev.fuelPrice !== '' && ev.fuelPrice !== undefined && ev.fuelPrice !== null) {
              parts.push(`<span class="event-meta">${ev.fuelPrice}円/L</span>`);
            }
          }
          if (ev.type === '積み込み') {
            const cargoText = typeof ev.cargo === 'string' ? ev.cargo.trim() : '';
            if (cargoText) {
              parts.push(`<span class="event-meta">荷物: ${cargoText}</span>`);
            }
          }
          const locationText = ev.location ? normalizeAddress(ev.location) : '';
          if (locationText) {
            parts.push(`<span class="event-meta">${locationText}</span>`);
          }
          const mapBtn = locationText ? mapButton(locationText, ev.lat, ev.lon) : '';
          return `<li>${parts.join(' ')}${mapBtn}</li>`;
        })
        .join('')}
    </ul>
  `;
}

function renderLogReportCard(log, options = {}) {
  if (!log) return '';
  const {
    index = -1,
    showActions = false,
    isCurrent = false,
    contextLabel = '',
    events: overrideEvents = null,
    eventEmptyMessage = null,
    eventCountSuffix = ''
  } = options;
  const events = Array.isArray(overrideEvents) ? overrideEvents : (log.events || []);
  const startParts = [];
  if (log.startDate) startParts.push(log.startDate);
  if (log.startTime) startParts.push(log.startTime);
  const startLabel = startParts.join(' ');
  const endParts = [];
  if (log.endDate) endParts.push(log.endDate);
  if (log.endTime) endParts.push(log.endTime);
  const endLabel = endParts.join(' ');
  let title = '日時未設定';
  if (startLabel && endLabel) title = `${startLabel} ～ ${endLabel}`;
  else if (startLabel) title = startLabel;
  else if (endLabel) title = endLabel;
  const headerMetaItems = [];
  if (isCurrent) headerMetaItems.push('<span class="report-badge report-badge--active">運行中</span>');
  if (contextLabel) headerMetaItems.push(`<span class="report-context">${contextLabel}</span>`);
  const headerMeta = headerMetaItems.length ? `<div class="report-header-meta">${headerMetaItems.join(' ')}</div>` : '';
  const notesBlock = log.notes ? `<p class="report-note"><strong>メモ</strong>${log.notes}</p>` : '';
  const eventsList = renderEventList(events, eventEmptyMessage || 'イベントは記録されていません。');
  const countBase = events.length ? `${events.length}件` : '記録なし';
  const eventCountLabel = `${countBase}${eventCountSuffix}`;
  const actions = showActions && index >= 0
    ? `
      <div class="report-footer">
        <div class="report-actions">
          <button class="table-action" onclick="showForm(${index})">編集</button>
          <button class="table-action subtle" onclick="deleteLog(${index})">削除</button>
        </div>
      </div>
    `
    : '';
  return `
    <section class="section-card report-card${isCurrent ? ' report-card--current' : ''}">
      <div class="report-header">
        <h3>${title}</h3>
        ${headerMeta}
      </div>
      <dl class="report-details">
        <div>
          <dt>目的</dt>
          <dd>${formatText(log.purpose)}</dd>
        </div>
        <div>
          <dt>出発地</dt>
          <dd>${formatLocation(log.start, log.startLat, log.startLon)}</dd>
        </div>
        <div>
          <dt>到着地</dt>
          <dd>${formatLocation(log.end, log.endLat, log.endLon)}</dd>
        </div>
        <div>
          <dt>距離</dt>
          <dd>${formatMetric(log.distance, 'km')}</dd>
        </div>
        <div>
          <dt>費用</dt>
          <dd>${formatMetric(log.cost, '円')}</dd>
        </div>
        <div>
          <dt>開始オド</dt>
          <dd>${formatMetric(log.startOdo, 'km')}</dd>
        </div>
        <div>
          <dt>終了オド</dt>
          <dd>${formatMetric(log.finalOdo, 'km')}</dd>
        </div>
      </dl>
      ${notesBlock}
      <div class="report-body">
        <div class="report-body-header">
          <h4 class="report-subheading">作業・イベント</h4>
          <span class="report-body-meta">${eventCountLabel}</span>
        </div>
        ${eventsList}
      </div>
      ${actions}
    </section>
  `;
}

function renderCurrentTripCard() {
  if (!currentTripStartTime) return '';
  const pseudoLog = {
    startDate: dateToLocalDateString(currentTripStartTime),
    startTime: currentTripStartTime.toTimeString().slice(0, 5),
    endDate: '',
    endTime: '',
    start: currentTripStartAddress || '',
    startLat: currentTripStartLat,
    startLon: currentTripStartLon,
    end: '',
    endLat: null,
    endLon: null,
    distance: '',
    cost: '',
    startOdo: currentTripStartOdo || '',
    finalOdo: '',
    purpose: '',
    notes: '',
    events: currentTripEvents.slice()
  };
  return renderLogReportCard(pseudoLog, {
    isCurrent: true,
    eventEmptyMessage: 'まだイベントは記録されていません。'
  });
}

function showList() {
  const content = document.getElementById('content');
  if (!content) return;
  if (logs.length === 0 && !currentTripStartTime) {
    content.innerHTML = `
      <div class="view-header">
        <h2>記録一覧</h2>
        <p class="view-description">まだ記録がありません。「新規記録」ボタンから追加してください。</p>
      </div>
      <section class="section-card">
        <p class="muted empty-state">記録がありません。「新規記録」ボタンから追加してください。</p>
      </section>
    `;
    return;
  }
  const cardsHtml = logs
    .map((log, index) => renderLogReportCard(log, { index, showActions: true }))
    .join('');
  const currentCard = currentTripStartTime ? renderCurrentTripCard() : '';
  const activeNotice = currentTripStartTime
    ? '<div class="notice">運行中の記録が1件あります。終了すると一覧に反映されます。</div>'
    : '';
  content.innerHTML = `
    <div class="view-header">
      <h2>記録一覧</h2>
      <p class="view-description">保存した運行を日報形式で確認できます。</p>
    </div>
    ${activeNotice}
    <div class="report-grid">
      ${currentCard}${cardsHtml}
    </div>
  `;
}

function deleteLog(index) {
  if (confirm('この記録を削除しますか？')) {
    logs.splice(index, 1);
    saveLogs();
    showList();
  }
}

function showSummary() {
  if (logs.length === 0) {
    document.getElementById('content').innerHTML = '<p>記録がありません。</p>';
    return;
  }
  let totalDistance = 0;
  let totalCost = 0;
  logs.forEach((log) => {
    if (log.distance !== '' && !isNaN(Number(log.distance))) totalDistance += Number(log.distance);
    if (log.cost !== '' && !isNaN(Number(log.cost))) totalCost += Number(log.cost);
  });
  const html = `
    <h2>集計</h2>
    <p>記録件数: ${logs.length}</p>
    <p>総距離: ${totalDistance.toFixed(1)} km</p>
    <p>総費用: ${totalCost.toFixed(0)} 円</p>
  `;
  document.getElementById('content').innerHTML = html;
}

function showDailyReport() {
  const content = document.getElementById('content');
  if (!content) return;
  if (logs.length === 0) {
    content.innerHTML = `
      <div class="view-header">
        <h2>日報</h2>
        <p class="view-description">まだ記録がありません。</p>
      </div>
      <section class="section-card">
        <p class="muted empty-state">記録がありません。</p>
      </section>
    `;
    return;
  }
  const formatNumber = (value, suffix = '') => {
    if (value === '' || value === undefined || value === null) return '<span class="muted">-</span>';
    const num = Number(value);
    const text = Number.isNaN(num) ? value : num.toLocaleString('ja-JP');
    return suffix ? `${text}${suffix}` : text;
  };
  const sections = logs
    .map((log) => {
      const eventRows = log.events || [];
      const rows = eventRows.length
        ? eventRows
            .map((ev) => {
              const startTime = ev.startTime || '<span class="muted">-</span>';
              const endTime = ev.endTime || '<span class="muted">-</span>';
              const eventAddress = ev.location ? normalizeAddress(ev.location) : '';
              const locationCell = eventAddress
                ? `${eventAddress}${mapButton(eventAddress, ev.lat, ev.lon)}`
                : '<span class="muted">-</span>';
              const fuelCell = ev.type === '給油' && ev.fuelAmount !== ''
                ? `${ev.fuelAmount}L`
                : '<span class="muted">-</span>';
              return `
                <tr>
                  <td>${startTime}</td>
                  <td>${endTime}</td>
                  <td>${ev.type}</td>
                  <td>${locationCell}</td>
                  <td>${fuelCell}</td>
                </tr>
              `;
            })
            .join('')
        : '<tr><td colspan="5"><span class="muted">イベントは記録されていません。</span></td></tr>';
      const startAddress = log.start ? normalizeAddress(log.start) : '';
      const startDetail = startAddress
        ? `${startAddress}${mapButton(startAddress, log.startLat, log.startLon)}`
        : '<span class="muted">未入力</span>';
      const endAddress = log.end ? normalizeAddress(log.end) : '';
      const endDetail = endAddress
        ? `${endAddress}${mapButton(endAddress, log.endLat, log.endLon)}`
        : '<span class="muted">未入力</span>';
      const purposeDetail = log.purpose ? log.purpose : '<span class="muted">未入力</span>';
      const notesBlock = log.notes
        ? `<div><dt>メモ</dt><dd>${log.notes.replace(/\n/g, '<br>')}</dd></div>`
        : '';
      return `
        <article class="report section-card">
          <div class="report-header">
            <h3>${log.startDate} ${log.startTime} ～ ${log.endDate} ${log.endTime}</h3>
          </div>
          <dl class="report-details">
            <div>
              <dt>出発地</dt>
              <dd>${startDetail}</dd>
            </div>
            <div>
              <dt>到着地</dt>
              <dd>${endDetail}</dd>
            </div>
            <div>
              <dt>目的</dt>
              <dd>${purposeDetail}</dd>
            </div>
            <div>
              <dt>距離</dt>
              <dd>${formatNumber(log.distance, 'km')}</dd>
            </div>
            <div>
              <dt>費用</dt>
              <dd>${formatNumber(log.cost, '円')}</dd>
            </div>
            ${notesBlock}
          </dl>
          <div class="table-container compact">
            <table class="data-table data-table--compact">
              <thead>
                <tr><th>開始</th><th>終了</th><th>内容</th><th>場所</th><th>給油量(L)</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </article>
      `;
    })
    .join('');
  content.innerHTML = `
    <div class="view-header">
      <h2>日報</h2>
      <p class="view-description">記録した運行ごとの詳細です。</p>
    </div>
    <div class="report-grid">
      ${sections}
    </div>
  `;
}

function showRecordsByDate() {
  const content = document.getElementById('content');
  if (!content) return;
  if (logs.length === 0) {
    content.innerHTML = `
      <div class="view-header">
        <h2>日付別記録</h2>
        <p class="view-description">まだ記録がありません。</p>
      </div>
      <section class="section-card">
        <p class="muted empty-state">記録がありません。</p>
      </section>
    `;
    return;
  }
  const dateSet = new Set();
  logs.forEach((log) => {
    const startUtc = dateStringToUTC(log.startDate);
    const endUtc = dateStringToUTC(log.endDate || log.startDate);
    if (startUtc === null && endUtc === null) return;
    let from = startUtc !== null ? startUtc : endUtc;
    let to = endUtc !== null ? endUtc : from;
    if (Number.isNaN(from) || Number.isNaN(to)) return;
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    for (let ts = from; ts <= to; ts += DAY_MS) {
      const dateStr = timestampToDateString(ts);
      dateSet.add(dateStr);
    }
  });
  const dates = Array.from(dateSet).sort();
  if (dates.length === 0) {
    content.innerHTML = `
      <div class="view-header">
        <h2>日付別記録</h2>
        <p class="view-description">表示できる日付がありません。</p>
      </div>
      <section class="section-card">
        <p class="muted empty-state">記録がありません。</p>
      </section>
    `;
    return;
  }
  const options = dates.map((d) => `<option value="${d}">${d}</option>`).join('');
  content.innerHTML = `
    <div class="view-header">
      <h2>日付別記録</h2>
      <p class="view-description">日付を選択するとその日の運行内容を確認できます。</p>
    </div>
    <section class="section-card filter-card">
      <div class="filter-group">
        <label for="recordDate">日付</label>
        <select id="recordDate">${options}</select>
      </div>
    </section>
    <div id="recordsByDate"></div>
  `;
  const selectEl = document.getElementById('recordDate');
  const listEl = document.getElementById('recordsByDate');
  if (!selectEl || !listEl) return;
  function getLogStartValue(log) {
    const startDate = log.startDate || log.endDate || '';
    const startTime = log.startTime || '00:00';
    const candidate = startDate ? new Date(`${startDate}T${startTime}`) : null;
    if (candidate && !Number.isNaN(candidate.getTime())) return candidate.getTime();
    const fallback = dateStringToUTC(log.startDate);
    return fallback !== null ? fallback : 0;
  }
  selectEl.addEventListener('change', update);
  update();
  function update() {
    const date = selectEl.value;
    if (!date) {
      listEl.innerHTML = '<p class="muted empty-state">該当する記録がありません。</p>';
      return;
    }
    const filtered = logs
      .filter((log) => isDateWithinLog(log, date))
      .sort((a, b) => getLogStartValue(a) - getLogStartValue(b));
    if (filtered.length === 0) {
      listEl.innerHTML = '<p class="muted empty-state">該当する記録がありません。</p>';
      return;
    }
    const cards = filtered
      .map((log) => {
        const eventsForDate = (log.events || []).filter((ev) => eventMatchesDate(ev, log, date));
        return renderLogReportCard(log, {
          events: eventsForDate,
          eventEmptyMessage: '該当するイベントはありません。',
          eventCountSuffix: '（対象日）'
        });
      })
      .join('');
    listEl.innerHTML = `
      <div class="report-grid">
        ${cards}
      </div>
    `;
  }
}

function recordEvent(type) {
  if (!currentTripStartTime) {
    alert('運行を開始してからイベントを記録してください。');
    return;
  }
  const eventTime = new Date();
  const timeStr = eventTime.toTimeString().slice(0, 5);
  const map = { 'Load': '積み込み', 'Unload': '荷下ろし', 'Board': '乗船', 'Break': '休憩', 'Rest': '休息' };
  const jpType = map[type] || type;
  const ongoing = [...currentTripEvents].reverse().find((ev) => ev.type === jpType && !ev.endTime);
  if (ongoing) {
    alert(`${jpType} は既に記録中です。`);
    return;
  }
  let cargoDescription = '';
  if (type === 'Load') {
    const cargoInput = prompt('積み込んだ内容を入力してください（キャンセルで中止）:');
    if (cargoInput === null) return;
    cargoDescription = cargoInput.trim();
  }
  showOverlay();
  function finalize(addr, lat, lon) {
    hideOverlay();
    const location = normalizeAddress(addr || '');
    stopDrivingSegment(eventTime.getTime());
    const eventObj = {
      type: jpType,
      startTime: timeStr,
      endTime: '',
      location,
      lat: lat !== undefined ? lat : null,
      lon: lon !== undefined ? lon : null,
      fuelAmount: '',
      fuelPrice: '',
      cargo: cargoDescription,
      startTimestamp: eventTime.getTime(),
      endTimestamp: null,
      durationSec: 0
    };
    currentTripEvents.push(eventObj);
    updateEventButton(jpType, true);
    updateCurrentStatusDisplay();
    saveCurrentTripState();
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ja&lat=${lat}&lon=${lon}`)
          .then((response) => response.json())
          .then((data) => finalize(data && data.display_name, lat, lon))
          .catch(() => finalize('', lat, lon));
      },
      () => finalize('', null, null),
      geoOptions
    );
  } else {
    finalize('', null, null);
  }
}

function finishEvent(jpType) {
  const ongoing = [...currentTripEvents].reverse().find((ev) => ev.type === jpType && !ev.endTime);
  if (!ongoing) return;
  const eventTime = new Date();
  const timeStr = eventTime.toTimeString().slice(0, 5);
  showOverlay();
  function finalize(addr, lat, lon) {
    hideOverlay();
    ongoing.endTime = timeStr;
    const location = normalizeAddress(addr || '');
    ongoing.location = normalizeAddress(ongoing.location || location);
    if (lat !== null && lat !== undefined) ongoing.lat = lat;
    if (lon !== null && lon !== undefined) ongoing.lon = lon;
    ongoing.endTimestamp = eventTime.getTime();
    if (typeof ongoing.startTimestamp !== 'number' || Number.isNaN(ongoing.startTimestamp)) {
      ongoing.startTimestamp = ongoing.endTimestamp;
      ongoing.durationSec = '';
    } else {
      ongoing.durationSec = Math.round((ongoing.endTimestamp - ongoing.startTimestamp) / 1000);
    }
    updateEventButton(jpType, false);
    startDrivingSegment(eventTime.getTime());
    saveCurrentTripState();
    updateCurrentStatusDisplay();
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ja&lat=${lat}&lon=${lon}`)
          .then((response) => response.json())
          .then((data) => finalize(data && data.display_name, lat, lon))
          .catch(() => finalize('', lat, lon));
      },
      () => finalize('', null, null),
      geoOptions
    );
  } else {
    finalize('', null, null);
  }
}

function recordFuelEvent() {
  if (!currentTripStartTime) {
    alert('運行を開始してからイベントを記録してください。');
    return;
  }
  const amountStr = prompt('給油量（L）:');
  let fuelAmount = '';
  if (amountStr) {
    const amtNum = parseFloat(amountStr);
    fuelAmount = isNaN(amtNum) ? '' : amtNum;
  }
  const priceStr = prompt('1リットルあたりの単価（円・任意）:');
  let fuelPrice = '';
  if (priceStr) {
    const priceNum = parseFloat(priceStr);
    fuelPrice = isNaN(priceNum) ? '' : priceNum;
  }
  const type = '給油';
  const eventTime = new Date();
  const timeStr = eventTime.toTimeString().slice(0, 5);
  const eventObj = {
    type,
    startTime: timeStr,
    endTime: timeStr,
    location: '',
    lat: null,
    lon: null,
    fuelAmount,
    fuelPrice,
    startTimestamp: eventTime.getTime(),
    endTimestamp: eventTime.getTime(),
    durationSec: 0
  };
  showOverlay();
  function finalize(addr, lat, lon) {
    hideOverlay();
    const location = normalizeAddress(addr || '');
    if (location) eventObj.location = location;
    if (lat !== null && lat !== undefined) eventObj.lat = lat;
    if (lon !== null && lon !== undefined) eventObj.lon = lon;
    stopDrivingSegment(eventTime.getTime());
    currentTripEvents.push(eventObj);
    startDrivingSegment(eventTime.getTime());
    saveCurrentTripState();
    updateCurrentStatusDisplay();
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ja&lat=${lat}&lon=${lon}`)
          .then((response) => response.json())
          .then((data) => finalize(data && data.display_name, lat, lon))
          .catch(() => finalize('', lat, lon));
      },
      () => finalize('', null, null),
      geoOptions
    );
  } else {
    finalize('', null, null);
  }
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const FILE_HANDLE_DB_NAME = 'runlog-file-handles';
const FILE_HANDLE_STORE_NAME = 'handles';
let fileHandleDbPromise = null;

function supportsFileSystemAccess() {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'indexedDB' in window;
}

function openHandleDB() {
  if (!supportsFileSystemAccess()) return Promise.resolve(null);
  if (!fileHandleDbPromise) {
    fileHandleDbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(FILE_HANDLE_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(FILE_HANDLE_STORE_NAME)) {
            db.createObjectStore(FILE_HANDLE_STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch (err) {
        console.warn('Failed to open handle DB', err);
        resolve(null);
      }
    });
  }
  return fileHandleDbPromise;
}

async function getStoredHandle(key) {
  const db = await openHandleDB();
  if (!db) return null;
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_HANDLE_STORE_NAME, 'readonly');
      const req = tx.objectStore(FILE_HANDLE_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to read stored handle', err);
    return null;
  }
}

async function storeHandle(key, handle) {
  const db = await openHandleDB();
  if (!db) return;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_HANDLE_STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(FILE_HANDLE_STORE_NAME).put(handle, key);
    });
  } catch (err) {
    console.warn('Failed to store file handle', err);
  }
}

async function verifyFilePermission(handle, mode = 'readwrite') {
  if (!handle || !handle.queryPermission || !handle.requestPermission) return !!handle;
  try {
    const state = await handle.queryPermission({ mode });
    if (state === 'granted') return true;
    if (state === 'denied') return false;
    const request = await handle.requestPermission({ mode });
    return request === 'granted';
  } catch (err) {
    console.warn('Failed to verify file permission', err);
    return false;
  }
}

async function getOrCreateFileHandle(key, suggestedName, options = {}) {
  if (!supportsFileSystemAccess()) return null;
  const {
    description = 'CSVファイル',
    mimeType = 'text/csv',
    extensions = ['.csv']
  } = options;
  let handle = await getStoredHandle(key);
  if (handle) {
    const ok = await verifyFilePermission(handle, 'readwrite');
    if (ok) return handle;
  }
  try {
    const pickerOpts = {
      suggestedName,
      types: [
        {
          description,
          accept: { [mimeType]: extensions }
        }
      ]
    };
    const newHandle = await window.showSaveFilePicker(pickerOpts);
    await storeHandle(key, newHandle);
    return newHandle;
  } catch (err) {
    if (err && err.name === 'AbortError') return null;
    throw err;
  }
}

async function writeFile(handle, content) {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

function downloadTextFile(fileName, content, mimeType = 'text/plain;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseYearFromDate(dateStr) {
  if (!dateStr) return null;
  const match = /^(\d{4})/.exec(dateStr);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isNaN(year) ? null : year;
}

function determineYearFromDates(dates) {
  const years = dates.map(parseYearFromDate).filter((y) => y !== null);
  if (years.length === 0) return new Date().getFullYear();
  const unique = Array.from(new Set(years));
  if (unique.length === 1) return unique[0];
  const current = new Date().getFullYear();
  if (unique.includes(current)) return current;
  return Math.max(...unique);
}

function determineLogExportYear() {
  const dates = [];
  logs.forEach((log) => {
    if (log.startDate) dates.push(log.startDate);
    if (log.endDate) dates.push(log.endDate);
  });
  return determineYearFromDates(dates);
}

function determineMaintenanceExportYear() {
  const dates = maintenance.map((m) => m.date).filter(Boolean);
  return determineYearFromDates(dates);
}

async function saveTextFile(handleKey, suggestedName, content, options = {}) {
  const {
    description = 'テキストファイル',
    mimeType = 'text/plain',
    extensions = ['.txt'],
    successMessage = 'ファイルを更新しました。',
    fallbackMessage = 'ブラウザがファイルの上書き保存に対応していないため、ダウンロードで保存しました。',
    cancelMessage = 'ファイルの保存先が選択されなかったため、ダウンロードで保存しました。',
    errorMessage = 'ファイルの更新に失敗したため、ダウンロードで保存しました。',
    errorLogLabel = 'Failed to save file',
    downloadMimeType = `${mimeType};charset=utf-8;`
  } = options;
  if (!supportsFileSystemAccess()) {
    downloadTextFile(suggestedName, content, downloadMimeType);
    if (fallbackMessage) alert(fallbackMessage);
    return 'downloaded';
  }
  try {
    const handle = await getOrCreateFileHandle(handleKey, suggestedName, { description, mimeType, extensions });
    if (!handle) {
      downloadTextFile(suggestedName, content, downloadMimeType);
      if (cancelMessage) alert(cancelMessage);
      return 'downloaded';
    }
    await writeFile(handle, content);
    if (successMessage) alert(successMessage);
    return 'saved';
  } catch (error) {
    console.error(errorLogLabel, error);
    downloadTextFile(suggestedName, content, downloadMimeType);
    if (errorMessage) alert(errorMessage);
    return 'downloaded';
  }
}

function sanitizeTableValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r?\n/g, ' / ').replace(/\t/g, ' ').trim();
}

function buildTableContent(headers, rows) {
  const sanitizedHeaders = headers.map(sanitizeTableValue);
  const columnCount = sanitizedHeaders.length;
  const sanitizedRows = rows.map((row) => {
    const cells = [];
    for (let i = 0; i < columnCount; i += 1) {
      const cell = i < row.length ? row[i] : '';
      cells.push(sanitizeTableValue(cell));
    }
    return cells;
  });
  const widths = sanitizedHeaders.map((cell) => cell.length);
  sanitizedRows.forEach((row) => {
    row.forEach((cell, index) => {
      if (cell.length > widths[index]) widths[index] = cell.length;
    });
  });
  const buildBorder = (char) => `+${widths.map((width) => char.repeat(width + 2)).join('+')}+`;
  const formatRow = (row) => `|${row.map((cell, index) => ` ${cell.padEnd(widths[index])} `).join('|')}|`;
  const lines = [];
  const headerBorder = buildBorder('-');
  const headerSeparator = buildBorder('=');
  lines.push(headerBorder);
  lines.push(formatRow(sanitizedHeaders));
  lines.push(headerSeparator);
  if (sanitizedRows.length === 0) {
    lines.push(headerBorder);
  } else {
    sanitizedRows.forEach((row) => {
      lines.push(formatRow(row));
      lines.push(headerBorder);
    });
  }
  return lines.join('\n');
}

function buildCsvContent(headers, rows) {
  const headerLine = headers.map((value) => csvEscape(value)).join(',');
  const dataLines = rows.map((row) => row.map((cell) => csvEscape(cell)).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

const EXPORT_FORMATS = {
  CSV: 'csv',
  TABLE: 'table',
  BOTH: 'both'
};

function describeExportFormat(format) {
  switch (format) {
    case EXPORT_FORMATS.CSV:
      return 'CSV（Excel等向け）';
    case EXPORT_FORMATS.TABLE:
      return '罫線付きテキスト（表形式）';
    case EXPORT_FORMATS.BOTH:
      return 'CSVと罫線付きテキスト';
    default:
      return '';
  }
}

function readExportFormatPreference(key) {
  try {
    const value = localStorage.getItem(key);
    if (value === EXPORT_FORMATS.CSV || value === EXPORT_FORMATS.TABLE || value === EXPORT_FORMATS.BOTH) {
      return value;
    }
  } catch (error) {
    console.warn('Failed to read export format preference', error);
  }
  return null;
}

function storeExportFormatPreference(key, value) {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn('Failed to store export format preference', error);
  }
}

function promptExportFormat(storageKey, title) {
  const saved = readExportFormatPreference(storageKey);
  if (saved) {
    const change = window.confirm(`${title}\n現在の出力形式は${describeExportFormat(saved)}です。変更しますか？\nOK: 変更する / キャンセル: このまま`);
    if (!change) return saved;
    storeExportFormatPreference(storageKey, null);
  }
  while (true) {
    const input = window.prompt(
      `${title}\n1: CSV（Excel等向け）\n2: 罫線付きテキスト（表形式）\n3: CSVと罫線付きテキストを両方保存\nキャンセル: 中止`,
      '1'
    );
    if (input === null) return null;
    const trimmed = input.trim();
    let format = null;
    if (trimmed === '1') format = EXPORT_FORMATS.CSV;
    else if (trimmed === '2') format = EXPORT_FORMATS.TABLE;
    else if (trimmed === '3') format = EXPORT_FORMATS.BOTH;
    if (format) {
      const remember = window.confirm('次回からもこの形式を使用しますか？\nOK: 記憶する / キャンセル: 毎回選択');
      if (remember) storeExportFormatPreference(storageKey, format);
      else storeExportFormatPreference(storageKey, null);
      return format;
    }
    alert('1〜3の番号を入力してください。');
  }
}

function summarizeExportResults(results, contextLabel = '') {
  if (!results || results.length === 0) return;
  const prefix = contextLabel ? `${contextLabel}の` : '';
  const messages = results.map((result) => {
    const label = result.label || '';
    if (result.outcome === 'saved') {
      return `${prefix}${label}ファイルを更新しました。`;
    }
    return `${prefix}${label}ファイルはダウンロードで保存しました。`;
  });
  alert(messages.join('\n'));
}

function buildLogExportMatrix() {
  const headers = ['開始日','開始時刻','終了日','終了時刻','開始オドメーター','最終オドメーター','目的','出発地','到着地','距離(km)','費用(円)','メモ','イベント'];
  const rows = logs.map((log) => {
    let eventsStr = '';
    if (log.events && log.events.length) {
      eventsStr = log.events
        .map((ev) => {
          let s = `${ev.startTime || ''}`;
          if (ev.endTime) s += `～${ev.endTime}`;
          s += ` ${ev.type || ''}`;
          if (ev.type === '積み込み') {
            const cargoText = typeof ev.cargo === 'string' ? ev.cargo.trim() : '';
            if (cargoText) s += ` [荷物: ${cargoText}]`;
          }
          const location = normalizeAddress(ev.location || '');
          if (location) s += `(${location})`;
          if (ev.type === '給油') {
            const amount = ev.fuelAmount !== '' && ev.fuelAmount !== undefined ? `${ev.fuelAmount}L` : '';
            const price = ev.fuelPrice !== '' && ev.fuelPrice !== undefined ? `${ev.fuelPrice}円/L` : '';
            const details = [amount, price].filter(Boolean).join(', ');
            if (details) s += `:${details}`;
          }
          return s.trim();
        })
        .join('; ');
    }
    const startAddress = normalizeAddress(log.start || '');
    const endAddress = normalizeAddress(log.end || '');
    const distance = log.distance === undefined || log.distance === null ? '' : log.distance;
    const cost = log.cost === undefined || log.cost === null ? '' : log.cost;
    return [
      log.startDate || '',
      log.startTime || '',
      log.endDate || '',
      log.endTime || '',
      log.startOdo || '',
      log.finalOdo || '',
      log.purpose || '',
      startAddress,
      endAddress,
      distance,
      cost,
      log.notes || '',
      eventsStr
    ];
  });
  return { headers, rows };
}

function buildMaintenanceExportMatrix() {
  const headers = ['日付','内容','オドメーター','費用(円)','メモ','次回目安日','次回目安走行距離(km)','次回サマリー'];
  const rows = maintenance.map((m) => {
    const odometer = m.odometer === undefined || m.odometer === null ? '' : m.odometer;
    const cost = m.cost === undefined || m.cost === null ? '' : m.cost;
    const nextOdo = typeof m.nextOdo === 'number' && !Number.isNaN(m.nextOdo) ? Math.round(m.nextOdo) : '';
    return [
      m.date || '',
      m.type || '',
      odometer,
      cost,
      m.notes || '',
      m.nextDate || '',
      nextOdo,
      maintenanceInfoText(m)
    ];
  });
  return { headers, rows };
}

async function exportCSV() {
  if (logs.length === 0) {
    alert('エクスポートする記録がありません。');
    return;
  }
  const { headers, rows } = buildLogExportMatrix();
  const format = promptExportFormat('runlog_export_format', '走行記録の出力形式を選択してください。');
  if (!format) return;
  const csvContent = buildCsvContent(headers, rows);
  const tableContent = buildTableContent(headers, rows);
  const year = determineLogExportYear();
  const baseName = `runlog-${year}`;
  const results = [];
  if (format === EXPORT_FORMATS.CSV || format === EXPORT_FORMATS.BOTH) {
    const outcome = await saveTextFile(
      `runlog_csv_${year}`,
      `${baseName}.csv`,
      csvContent,
      {
        description: 'CSVファイル',
        mimeType: 'text/csv',
        extensions: ['.csv'],
        successMessage: null,
        fallbackMessage: null,
        cancelMessage: null,
        errorMessage: null,
        errorLogLabel: 'Failed to save CSV',
        downloadMimeType: 'text/csv;charset=utf-8;'
      }
    );
    results.push({ label: 'CSV', outcome });
  }
  if (format === EXPORT_FORMATS.TABLE || format === EXPORT_FORMATS.BOTH) {
    const outcome = await saveTextFile(
      `runlog_table_${year}`,
      `${baseName}-table.txt`,
      tableContent,
      {
        description: '罫線付きテキスト',
        mimeType: 'text/plain',
        extensions: ['.txt'],
        successMessage: null,
        fallbackMessage: null,
        cancelMessage: null,
        errorMessage: null,
        errorLogLabel: 'Failed to save table text',
        downloadMimeType: 'text/plain;charset=utf-8;'
      }
    );
    results.push({ label: '罫線付きテキスト', outcome });
  }
  summarizeExportResults(results, '走行記録');
}

// メンテナンス
function showMaintenanceList() {
  const content = document.getElementById('content');
  if (!content) return;
  if (maintenance.length === 0) {
    content.innerHTML = `
      <div class="view-header">
        <h2>メンテナンス</h2>
        <p class="view-description">まだメンテナンス記録がありません。</p>
      </div>
      <section class="section-card">
        <p class="muted empty-state">記録がありません。「新規メンテナンス」から追加してください。</p>
        <div class="table-toolbar">
          <button class="table-action" onclick="showMaintenanceForm()">新規メンテナンス</button>
        </div>
      </section>
      <section class="section-card">
        ${maintenanceRecommendationsHTML()}
      </section>
    `;
    return;
  }
  const formatNumeric = (value) => {
    if (value === '' || value === undefined || value === null) return '<span class="muted">-</span>';
    const num = Number(value);
    return Number.isNaN(num) ? value : num.toLocaleString('ja-JP');
  };
  const rows = maintenance
    .map((m, i) => {
      const odometer = formatNumeric(m.odometer);
      const cost = formatNumeric(m.cost);
      const notes = m.notes ? m.notes.replace(/\n/g, '<br>') : '<span class="muted">-</span>';
      const dateCell = m.date || '<span class="muted">-</span>';
      const info = maintenanceInfoHTML(m);
      return `
        <tr>
          <td>${dateCell}</td>
          <td>${m.type}</td>
          <td>${odometer}</td>
          <td>${cost}</td>
          <td>${notes}</td>
          <td>${info}</td>
          <td class="actions">
            <button class="table-action" onclick="showMaintenanceForm(${i})">編集</button>
            <button class="table-action" onclick="deleteMaintenance(${i})">削除</button>
          </td>
        </tr>
      `;
    })
    .join('');
  const html = `
    <div class="view-header">
      <h2>メンテナンス</h2>
      <p class="view-description">整備履歴の一覧です。</p>
    </div>
    <section class="section-card table-card">
      <div class="table-toolbar">
        <button class="table-action" onclick="showMaintenanceForm()">新規メンテナンス</button>
        <button class="table-action" onclick="exportMaintenanceCSV()">CSV出力</button>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>日付</th>
              <th>内容</th>
              <th>オドメーター</th>
              <th>費用(円)</th>
              <th>メモ</th>
              <th>次回目安</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
    <section class="section-card">
      ${maintenanceRecommendationsHTML()}
    </section>
  `;
  content.innerHTML = html;
}

function showMaintenanceForm(editIndex = -1) {
  const init = { date: timestampToDateString(Date.now()), type: 'オイル交換', odometer: '', cost: '', notes: '' };
  const m = editIndex >= 0 ? { ...maintenance[editIndex] } : init;
  const html = `
    <h2>${editIndex >= 0 ? 'メンテナンス編集' : '新規メンテナンス'}</h2>
    <form id=\"mntForm\">
      <div>
        <label for=\"mDate\">日付:</label>
        <input type=\"date\" id=\"mDate\" value=\"${m.date}\">
      </div>
      <div>
        <label for=\"mType\">内容:</label>
        <select id=\"mType\">
          <option${m.type === 'オイル交換' ? ' selected' : ''}>オイル交換</option>
          <option${m.type === 'オイルエレメント交換' ? ' selected' : ''}>オイルエレメント交換</option>
          <option${m.type === 'タイヤ交換' ? ' selected' : ''}>タイヤ交換</option>
          <option${m.type === 'タイヤローテーション' ? ' selected' : ''}>タイヤローテーション</option>
          <option${m.type === '点検' ? ' selected' : ''}>点検</option>
          <option${m.type === '車検' ? ' selected' : ''}>車検</option>
          <option${m.type === 'バッテリー交換' ? ' selected' : ''}>バッテリー交換</option>
          <option${m.type === 'ワイパー交換' ? ' selected' : ''}>ワイパー交換</option>
          <option${m.type && !['オイル交換','オイルエレメント交換','タイヤ交換','タイヤローテーション','点検','車検','バッテリー交換','ワイパー交換'].includes(m.type) ? ' selected' : ''}>その他</option>
        </select>
      </div>
      <div>
        <label for=\"mOdo\">オドメーター:</label>
        <input type=\"number\" id=\"mOdo\" value=\"${m.odometer}\">
      </div>
      <div>
        <label for=\"mCost\">費用(円):</label>
        <input type=\"number\" id=\"mCost\" value=\"${m.cost}\">
      </div>
      <div>
        <label for=\"mNotes\">メモ:</label>
        <textarea id=\"mNotes\" rows=\"3\">${m.notes || ''}</textarea>
      </div>
      <div id=\"mntNextInfo\" class=\"maintenance-next-info\" aria-live=\"polite\">記録後に次回目安が表示されます。</div>
      <div>
        <button type=\"submit\">${editIndex >= 0 ? '保存' : '追加'}</button>
        <button type=\"button\" onclick=\"showMaintenanceList()\">キャンセル</button>
      </div>
      <div id=\"mntError\" class=\"error\"></div>
    </form>
  `;
  document.getElementById('content').innerHTML = html;
  document.getElementById('mntForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitMaintenance(editIndex);
  });
  const updatePreview = () => {
    const dateVal = document.getElementById('mDate').value;
    const typeVal = document.getElementById('mType').value;
    const odoStr = document.getElementById('mOdo').value;
    const odo = odoStr === '' ? '' : Number(odoStr);
    const base = {
      date: dateVal,
      type: typeVal,
      odometer: odoStr === '' || Number.isNaN(odo) ? '' : odo,
      cost: '',
      notes: ''
    };
    const preview = enrichMaintenanceEntry(base);
    const el = document.getElementById('mntNextInfo');
    if (el) {
      el.innerHTML = maintenanceInfoHTML(preview);
    }
  };
  ['mDate', 'mType', 'mOdo'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', updatePreview);
      input.addEventListener('change', updatePreview);
    }
  });
  updatePreview();
}

function submitMaintenance(editIndex) {
  const date = document.getElementById('mDate').value;
  const type = document.getElementById('mType').value;
  const odometerVal = document.getElementById('mOdo').value;
  const costVal = document.getElementById('mCost').value;
  const notes = document.getElementById('mNotes').value.trim();
  const errors = [];
  if (!date) errors.push('日付を入力してください。');
  const odometer = odometerVal === '' ? '' : Number(odometerVal);
  const cost = costVal === '' ? '' : Number(costVal);
  if (odometer !== '' && (isNaN(odometer) || odometer < 0)) errors.push('オドメーターは0以上で入力してください。');
  if (cost !== '' && (isNaN(cost) || cost < 0)) errors.push('費用は0以上で入力してください。');
  if (errors.length) {
    document.getElementById('mntError').innerText = errors.join('\n');
    return;
  }
  const entry = { date, type, odometer: odometer === '' ? '' : odometer, cost: cost === '' ? '' : cost, notes };
  if (editIndex >= 0) maintenance[editIndex] = entry; else maintenance.push(entry);
  saveMaintenance();
  showMaintenanceList();
}

function deleteMaintenance(index) {
  if (confirm('このメンテナンス記録を削除しますか？')) {
    maintenance.splice(index, 1);
    saveMaintenance();
    showMaintenanceList();
  }
}

async function exportMaintenanceCSV() {
  if (maintenance.length === 0) {
    alert('エクスポートするメンテナンス記録がありません。');
    return;
  }
  const { headers, rows } = buildMaintenanceExportMatrix();
  const format = promptExportFormat('maintenance_export_format', 'メンテナンス記録の出力形式を選択してください。');
  if (!format) return;
  const csvContent = buildCsvContent(headers, rows);
  const tableContent = buildTableContent(headers, rows);
  const year = determineMaintenanceExportYear();
  const baseName = `maintenance-${year}`;
  const results = [];
  if (format === EXPORT_FORMATS.CSV || format === EXPORT_FORMATS.BOTH) {
    const outcome = await saveTextFile(
      `maintenance_csv_${year}`,
      `${baseName}.csv`,
      csvContent,
      {
        description: 'CSVファイル',
        mimeType: 'text/csv',
        extensions: ['.csv'],
        successMessage: null,
        fallbackMessage: null,
        cancelMessage: null,
        errorMessage: null,
        errorLogLabel: 'Failed to save maintenance CSV',
        downloadMimeType: 'text/csv;charset=utf-8;'
      }
    );
    results.push({ label: 'CSV', outcome });
  }
  if (format === EXPORT_FORMATS.TABLE || format === EXPORT_FORMATS.BOTH) {
    const outcome = await saveTextFile(
      `maintenance_table_${year}`,
      `${baseName}-table.txt`,
      tableContent,
      {
        description: '罫線付きテキスト',
        mimeType: 'text/plain',
        extensions: ['.txt'],
        successMessage: null,
        fallbackMessage: null,
        cancelMessage: null,
        errorMessage: null,
        errorLogLabel: 'Failed to save maintenance table',
        downloadMimeType: 'text/plain;charset=utf-8;'
      }
    );
    results.push({ label: '罫線付きテキスト', outcome });
  }
  summarizeExportResults(results, 'メンテナンス記録');
}

// Service Worker 登録
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('btnInstall');
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('hidden');
  }
});

function setupInstallButton() {
  const btn = document.getElementById('btnInstall');
  if (!btn) return;
  btn.disabled = true;
  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      alert('インストールは現在利用できません。ブラウザのメニューから追加してください。');
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    btn.disabled = true;
    btn.classList.add('hidden');
  });
}

window.addEventListener('appinstalled', () => {
  const btn = document.getElementById('btnInstall');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('hidden');
  }
});

// 起動時処理
window.addEventListener('load', () => {
  loadLogs();
  loadMaintenance();
  loadCurrentTripState();
  applyJapaneseLabels();
  applyDeviceClass();
  updateTripButtonUI();
  restoreEventButtonStates();
  showList();
  registerServiceWorker();
  setupInstallButton();
});

// 画面の固定ラベル（ナビ等）を日本語に
function applyJapaneseLabels() {
  document.title = '運行管理(K)';
  const h1 = document.querySelector('header h1');
  if (h1) h1.textContent = '運行管理(K)';
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  setText('toggleLabel', '運行開始');
  setText('btnList', '一覧');
  setText('btnSummary', '集計');
  setText('btnByDate', '日付別');
  setText('btnDaily', '日報');
  setText('btnExport', 'CSV出力');
  setText('btnMaintenance', '整備記録');
  setText('btnLoad', '積み込み');
  setText('btnUnload', '荷下ろし');
  setText('btnBoard', '乗船');
  setText('btnFuel', '給油');
  setText('btnBreak', '休憩');
  setText('btnRest', '休息');
  setText('statusIndicator', '停止中');
}
