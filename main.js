// main.js - 運行管理アプリ（日本語UI）

// 走行ログ
let logs = [];
// メンテナンス記録
let maintenance = [];
const DAY_MS = 24 * 60 * 60 * 1000;
const maintenanceGuidelines = {
  'オイル交換': {
    months: 6,
    distance: 5000,
    description: '寒冷地ではエンジンオイルの劣化が早いため、半年または5,000kmごとに交換すると安心です。'
  },
  'タイヤ交換': {
    months: 6,
    description: '北海道では春（4〜5月）と初冬（10〜11月）に夏冬タイヤを履き替えるのが一般的です。'
  },
  '点検': {
    months: 6,
    description: '法定12カ月点検に合わせて、冬前の点検も行うとトラブル防止につながります。'
  },
  '車検': {
    months: 24,
    description: '自家用車は2年ごとに車検。初回のみ3年後ですが、その後は24カ月ごとが基本です。'
  },
  'バッテリー交換': {
    months: 36,
    description: '寒冷地では寿命が短くなりがちなので、3年程度での交換計画が推奨されています。'
  },
  'ワイパー交換': {
    months: 12,
    description: '凍結や雪でゴムが傷みやすいので年1回の交換が目安です。'
  }
};

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

function dateStringToUTC(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [year, month, day] = parts;
  return Date.UTC(year, month - 1, day);
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

function timestampToDateString(timestamp) {
  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

// ワンタップ開始/終了の状態
let currentTripStartTime = null;
let currentTripEvents = [];
let currentTripStartAddress = '';
let currentTripStartLat = null;
let currentTripStartLon = null;
let currentTripStartOdo = '';

const eventButtonMap = {
  '積み込み': { id: 'btnLoad', start: '積み込み', code: 'Load' },
  '荷下ろし': { id: 'btnUnload', start: '荷下ろし', code: 'Unload' },
  '休憩': { id: 'btnBreak', start: '休憩', code: 'Break' },
  '休息': { id: 'btnRest', start: '休息', code: 'Rest' }
};

const geoOptions = { enableHighAccuracy: false, maximumAge: 600000, timeout: 5000 };
let deferredInstallPrompt = null;

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
    btn.textContent = '終了';
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
    const startOdoStr = prompt('開始オドメーター（任意）:');
    currentTripStartOdo = startOdoStr ? startOdoStr.trim() : '';
    currentTripStartLat = null;
    currentTripStartLon = null;
    const startTimeStr = currentTripStartTime.toTimeString().slice(0, 5);
    const label = document.getElementById('toggleLabel');
    if (label) label.textContent = '運行終了';
    if (btn) {
      btn.classList.remove('start');
      btn.classList.add('stop');
    }
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
    const startDateStr = startDate.toISOString().slice(0, 10);
    const startTimeStr = startDate.toTimeString().slice(0, 5);
    const endDateStr = endTime.toISOString().slice(0, 10);
    const endTimeStr = endTime.toTimeString().slice(0, 5);
    const finalOdoStr = prompt('最終オドメーター（任意）:');
    const finalOdo = finalOdoStr ? finalOdoStr.trim() : '';
    function finalizeEnd(addr, lat, lon) {
      hideOverlay();
      const endAddr = normalizeAddress(addr || '');
      const eventTimestamp = endTime.getTime();
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
      const label = document.getElementById('toggleLabel');
      if (label) label.textContent = '運行開始';
      if (btn) {
        btn.classList.remove('stop');
        btn.classList.add('start');
      }
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
        return {
          type: e.type || '',
          startTime: e.startTime || e.time || '',
          endTime: e.endTime || '',
          location: normalizeAddress(e.location || ''),
          lat: e.lat !== undefined ? e.lat : null,
          lon: e.lon !== undefined ? e.lon : null,
          fuelAmount: e.fuelAmount || '',
          fuelPrice: e.fuelPrice || '',
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
      return `
        <li>
          <span class="recommend-label">${type}</span>
          <span class="recommend-date">${formatted}</span>
        </li>
      `;
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
    log.startDate = new Date().toISOString().slice(0, 10);
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
    startLat: existing.startLat !== undefined ? existing.startLat : null,
    startLon: existing.startLon !== undefined ? existing.startLon : null,
    end,
    endLat: existing.endLat !== undefined ? existing.endLat : null,
    endLon: existing.endLon !== undefined ? existing.endLon : null,
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
  return (events || []).map((ev) => {
    const time = ev.endTime ? `${ev.startTime}～${ev.endTime}` : ev.startTime;
    const duration = ev.durationSec ? ` (${Math.floor(ev.durationSec / 60)}分${ev.durationSec % 60}秒)` : '';
    const fuel = ev.type === '給油' && ev.fuelAmount !== '' ? ` ${ev.fuelAmount}L` : '';
    const location = ev.location ? ` @${normalizeAddress(ev.location)}` : '';
    return `${ev.type}${fuel}(${time})${duration}${location}`;
  }).join('<br>');
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
  return ` <button type="button" onclick="openMap('${safeAddr}', ${latStr}, ${lonStr})">地図</button>`;
}

function showList() {
  if (logs.length === 0 && !currentTripStartTime) {
    document.getElementById('content').innerHTML = '<p>記録がありません。「新規記録」ボタンから追加してください。</p>';
    return;
  }
  const tableRows = logs
    .map((log, index) => {
      const startAddress = log.start ? normalizeAddress(log.start) : '';
      const endAddress = log.end ? normalizeAddress(log.end) : '';
      return `
      <tr>
        <td>${log.startDate}</td>
        <td>${log.startTime}</td>
        <td>${log.endDate}</td>
        <td>${log.endTime}</td>
        <td>${log.startOdo || ''}</td>
        <td>${log.finalOdo || ''}</td>
        <td>${log.purpose}</td>
        <td>${startAddress}</td>
        <td>${endAddress}</td>
        <td>${log.distance}</td>
        <td>${log.cost}</td>
        <td>${formatEvents(log.events)}</td>
        <td>
          <button onclick=\"showForm(${index})\">編集</button>
          <button onclick=\"deleteLog(${index})\">削除</button>
        </td>
      </tr>
    `;
    })
    .join('');
  const currentRow = currentTripStartTime
    ? `
      <tr>
        <td>${currentTripStartTime.toISOString().slice(0, 10)}</td>
        <td>${currentTripStartTime.toTimeString().slice(0, 5)}</td>
        <td>-</td>
        <td>-</td>
        <td>${currentTripStartOdo || ''}</td>
        <td>-</td>
        <td></td>
        <td>${currentTripStartAddress ? normalizeAddress(currentTripStartAddress) : ''}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${formatEvents(currentTripEvents)}</td>
        <td></td>
      </tr>
    `
    : '';
  const html = `
    <h2>記録一覧</h2>
    <table>
      <thead>
        <tr>
          <th>開始日</th>
          <th>開始時刻</th>
          <th>終了日</th>
          <th>終了時刻</th>
          <th>開始オド</th>
          <th>終了オド</th>
          <th>目的</th>
          <th>出発地</th>
          <th>到着地</th>
          <th>距離(km)</th>
          <th>費用(円)</th>
          <th>イベント</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${currentRow}${tableRows}
      </tbody>
    </table>
  `;
  document.getElementById('content').innerHTML = html;
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
  if (logs.length === 0) {
    document.getElementById('content').innerHTML = '<p>記録がありません。</p>';
    return;
  }
  const sections = logs
    .map((log) => {
      const events = (log.events || [])
        .map((ev) => {
          const eventAddress = ev.location ? normalizeAddress(ev.location) : '';
          return `
          <tr>
            <td>${ev.startTime || ''}</td>
            <td>${ev.endTime || ''}</td>
            <td>${ev.type}</td>
            <td>${eventAddress}${mapButton(eventAddress, ev.lat, ev.lon)}</td>
            <td>${ev.type === '給油' && ev.fuelAmount !== '' ? ev.fuelAmount : ''}</td>
          </tr>
        `;
        })
        .join('');
      const startAddress = log.start ? normalizeAddress(log.start) : '';
      const endAddress = log.end ? normalizeAddress(log.end) : '';
      return `
        <section class="report">
          <h3>${log.startDate} ${log.startTime} ～ ${log.endDate} ${log.endTime}</h3>
          <p>出発地: ${startAddress}${mapButton(startAddress, log.startLat, log.startLon)}</p>
          <p>到着地: ${endAddress}${mapButton(endAddress, log.endLat, log.endLon)}</p>
          <p>目的: ${log.purpose || ''}</p>
          <table>
            <thead>
              <tr><th>開始</th><th>終了</th><th>内容</th><th>場所</th><th>給油量(L)</th></tr>
            </thead>
            <tbody>${events}</tbody>
          </table>
        </section>
      `;
    })
    .join('');
  document.getElementById('content').innerHTML = `<h2>日報</h2>${sections}`;
}

function showRecordsByDate() {
  if (logs.length === 0) {
    document.getElementById('content').innerHTML = '<p>記録がありません。</p>';
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
      const dateStr = new Date(ts).toISOString().slice(0, 10);
      dateSet.add(dateStr);
    }
  });
  const dates = Array.from(dateSet).sort();
  if (dates.length === 0) {
    document.getElementById('content').innerHTML = '<p>表示できる日付がありません。</p>';
    return;
  }
  const options = dates.map((d) => `<option value="${d}">${d}</option>`).join('');
  const html = `
    <h2>日付別記録</h2>
    <label for="recordDate">日付:</label>
    <select id="recordDate">${options}</select>
    <div id="recordsByDate"></div>
  `;
  document.getElementById('content').innerHTML = html;
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
  function formatEventForDate(ev) {
    const parts = [];
    parts.push(`<strong>${ev.type || ''}</strong>`);
    const timeRange = ev.startTime
      ? (ev.endTime ? `${ev.startTime}～${ev.endTime}` : ev.startTime)
      : (ev.endTime || '');
    if (timeRange) parts.push(timeRange);
    const durationText = typeof ev.durationSec === 'number' && !Number.isNaN(ev.durationSec) && ev.durationSec > 0
      ? `(${Math.floor(ev.durationSec / 60)}分${ev.durationSec % 60}秒)`
      : '';
    if (durationText) parts.push(durationText);
    const extras = [];
    if (ev.type === '給油') {
      if (ev.fuelAmount !== '' && ev.fuelAmount !== undefined && ev.fuelAmount !== null) extras.push(`${ev.fuelAmount}L`);
      if (ev.fuelPrice !== '' && ev.fuelPrice !== undefined && ev.fuelPrice !== null) extras.push(`${ev.fuelPrice}円/L`);
    }
    const locationText = ev.location ? normalizeAddress(ev.location) : '';
    if (locationText) extras.push(`${locationText}${mapButton(locationText, ev.lat, ev.lon)}`);
    if (extras.length) parts.push(extras.join(' / '));
    return `<li>${parts.join(' ')}</li>`;
  }
  selectEl.addEventListener('change', update);
  update();
  function update() {
    const date = selectEl.value;
    const filtered = logs
      .filter((log) => isDateWithinLog(log, date))
      .sort((a, b) => getLogStartValue(a) - getLogStartValue(b));
    if (filtered.length === 0) {
      listEl.innerHTML = '<p>該当する記録がありません。</p>';
      return;
    }
    const rows = filtered
      .map((log) => {
        const startDateTime = [log.startDate, log.startTime].filter(Boolean).join(' ');
        const endDateTime = [log.endDate, log.endTime].filter(Boolean).join(' ');
        const startAddress = log.start ? normalizeAddress(log.start) : '';
        const endAddress = log.end ? normalizeAddress(log.end) : '';
        const eventsForDate = (log.events || []).filter((ev) => eventMatchesDate(ev, log, date));
        const eventsCell = eventsForDate.length
          ? `<ul>${eventsForDate.map((ev) => formatEventForDate(ev)).join('')}</ul>`
          : '<span>該当するイベントはありません。</span>';
        return `
        <tr>
          <td>${startDateTime || ''}</td>
          <td>${endDateTime || ''}</td>
          <td>${log.purpose || ''}</td>
          <td>${startAddress}${mapButton(startAddress, log.startLat, log.startLon)}</td>
          <td>${endAddress}${mapButton(endAddress, log.endLat, log.endLon)}</td>
          <td>${log.distance}</td>
          <td>${log.cost}</td>
          <td>${eventsCell}</td>
        </tr>
      `;
      })
      .join('');
    listEl.innerHTML = `
      <table>
        <thead>
          <tr><th>開始</th><th>終了</th><th>目的</th><th>出発地</th><th>到着地</th><th>距離(km)</th><th>費用(円)</th><th>作業・イベント</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
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
  const map = { 'Load': '積み込み', 'Unload': '荷下ろし', 'Break': '休憩', 'Rest': '休息' };
  const jpType = map[type] || type;
  const ongoing = [...currentTripEvents].reverse().find((ev) => ev.type === jpType && !ev.endTime);
  if (ongoing) {
    alert(`${jpType} は既に記録中です。`);
    return;
  }
  showOverlay();
  function finalize(addr, lat, lon) {
    hideOverlay();
    const location = normalizeAddress(addr || '');
    const eventObj = {
      type: jpType,
      startTime: timeStr,
      endTime: '',
      location,
      lat: lat !== undefined ? lat : null,
      lon: lon !== undefined ? lon : null,
      fuelAmount: '',
      fuelPrice: '',
      startTimestamp: eventTime.getTime(),
      endTimestamp: null,
      durationSec: 0
    };
    currentTripEvents.push(eventObj);
    updateEventButton(jpType, true);
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
    currentTripEvents.push(eventObj);
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

function exportCSV() {
  if (logs.length === 0) {
    alert('エクスポートする記録がありません。');
    return;
  }
  const headers = ['開始日','開始時刻','終了日','終了時刻','開始オドメーター','最終オドメーター','目的','出発地','到着地','距離(km)','費用(円)','メモ','イベント'];
  const rows = logs.map((log) => {
    let eventsStr = '';
    if (log.events && log.events.length) {
      eventsStr = log.events
        .map((ev) => {
          let s = `${ev.startTime}`;
          if (ev.endTime) s += `～${ev.endTime}`;
          s += ` ${ev.type}`;
          const location = normalizeAddress(ev.location || '');
          if (location) s += `(${location})`;
          if (ev.type === '給油') {
            const amount = ev.fuelAmount !== '' ? `${ev.fuelAmount}L` : '';
            const price = ev.fuelPrice !== '' ? `${ev.fuelPrice}円/L` : '';
            const details = [amount, price].filter(Boolean).join(', ');
            if (details) s += `:${details}`;
          }
          return s;
        })
        .join('; ');
    }
    const startAddress = normalizeAddress(log.start || '');
    const endAddress = normalizeAddress(log.end || '');
    return [
      csvEscape(log.startDate),
      csvEscape(log.startTime),
      csvEscape(log.endDate),
      csvEscape(log.endTime),
      csvEscape(log.startOdo || ''),
      csvEscape(log.finalOdo || ''),
      csvEscape(log.purpose),
      csvEscape(startAddress),
      csvEscape(endAddress),
      csvEscape(log.distance),
      csvEscape(log.cost),
      csvEscape(log.notes || ''),
      csvEscape(eventsStr)
    ].join(',');
  });
  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'runlog.csv';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// メンテナンス
function showMaintenanceList() {
  if (maintenance.length === 0) {
    document.getElementById('content').innerHTML = `
      <h2>メンテナンス</h2>
      <p>記録がありません。「新規メンテナンス」から追加してください。</p>
      <button onclick=\"showMaintenanceForm()\">新規メンテナンス</button>
      ${maintenanceRecommendationsHTML()}
    `;
    return;
  }
  const rows = maintenance
    .map((m, i) => `
      <tr>
        <td>${m.date}</td>
        <td>${m.type}</td>
        <td>${m.odometer}</td>
        <td>${m.cost}</td>
        <td>${m.notes || ''}</td>
        <td>${maintenanceInfoHTML(m)}</td>
        <td>
          <button onclick=\"showMaintenanceForm(${i})\">編集</button>
          <button onclick=\"deleteMaintenance(${i})\">削除</button>
        </td>
      </tr>
    `)
    .join('');
  const html = `
    <h2>メンテナンス</h2>
    <div style="margin: 0 0 0.5rem 0;">
      <button onclick=\"showMaintenanceForm()\">新規メンテナンス</button>
      <button onclick=\"exportMaintenanceCSV()\">CSV出力</button>
    </div>
    <table>
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
    ${maintenanceRecommendationsHTML()}
  `;
  document.getElementById('content').innerHTML = html;
}

function showMaintenanceForm(editIndex = -1) {
  const init = { date: new Date().toISOString().slice(0, 10), type: 'オイル交換', odometer: '', cost: '', notes: '' };
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
          <option${m.type === 'タイヤ交換' ? ' selected' : ''}>タイヤ交換</option>
          <option${m.type === '点検' ? ' selected' : ''}>点検</option>
          <option${m.type === '車検' ? ' selected' : ''}>車検</option>
          <option${m.type === 'バッテリー交換' ? ' selected' : ''}>バッテリー交換</option>
          <option${m.type === 'ワイパー交換' ? ' selected' : ''}>ワイパー交換</option>
          <option${m.type && !['オイル交換','タイヤ交換','点検','車検','バッテリー交換','ワイパー交換'].includes(m.type) ? ' selected' : ''}>その他</option>
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
      const segments = maintenanceInfoSegments(preview);
      if (segments.length) {
        el.innerHTML = segments.join('<br>');
      } else {
        const preset = maintenanceGuidelines[typeVal];
        el.textContent = preset && preset.description
          ? preset.description
          : '記録後に次回目安が表示されます。';
      }
    }
  };
  ['mDate', 'mOdo'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updatePreview);
  });
  const typeEl = document.getElementById('mType');
  if (typeEl) typeEl.addEventListener('change', updatePreview);
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
  const baseEntry = { date, type, odometer: odometer === '' ? '' : odometer, cost: cost === '' ? '' : cost, notes };
  const entry = enrichMaintenanceEntry(baseEntry);
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

function exportMaintenanceCSV() {
  if (maintenance.length === 0) {
    alert('エクスポートするメンテナンス記録がありません。');
    return;
  }
  const headers = ['日付','内容','オドメーター','費用(円)','メモ','次回目安日','次回目安走行距離(km)','次回サマリー'];
  const rows = maintenance.map((m) => [
    csvEscape(m.date),
    csvEscape(m.type),
    csvEscape(m.odometer),
    csvEscape(m.cost),
    csvEscape(m.notes || ''),
    csvEscape(m.nextDate || ''),
    csvEscape(typeof m.nextOdo === 'number' && !Number.isNaN(m.nextOdo) ? Math.round(m.nextOdo) : ''),
    csvEscape(maintenanceInfoText(m))
  ].join(','));
  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'maintenance.csv';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  applyJapaneseLabels();
  applyDeviceClass();
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
  setText('btnNewLog', '新規記録');
  setText('btnList', '一覧');
  setText('btnSummary', '集計');
  setText('btnByDate', '日付別');
  setText('btnDaily', '日報');
  setText('btnExport', 'CSV出力');
  setText('btnMaintenance', '整備記録');
  setText('btnLoad', '積み込み');
  setText('btnUnload', '荷下ろし');
  setText('btnFuel', '給油');
  setText('btnBreak', '休憩');
  setText('btnRest', '休息');
}
