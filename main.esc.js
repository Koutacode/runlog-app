\ufeff// main.js - \u904b\u884c\u7ba1\u7406\u30a2\u30d7\u30ea\uff08\u65e5\u672c\u8a9eUI\uff09

// \u8d70\u884c\u30ed\u30b0
let logs = [];
// \u30e1\u30f3\u30c6\u30ca\u30f3\u30b9\u8a18\u9332
let maintenance = [];

// \u30ef\u30f3\u30bf\u30c3\u30d7\u958b\u59cb/\u7d42\u4e86\u306e\u72b6\u614b
let currentTripStartTime = null;
let currentTripEvents = [];

function toggleTrip() {
  const btn = document.getElementById('toggleTripBtn');
  if (!currentTripStartTime) {
    currentTripStartTime = new Date();
    const label = document.getElementById('toggleLabel');
    if (label) label.textContent = '\u904b\u884c\u7d42\u4e86';
    if (btn) {
      btn.classList.remove('start');
      btn.classList.add('stop');
    }
  } else {
    const endTime = new Date();
    const startDate = currentTripStartTime;
    const date = startDate.toISOString().slice(0, 10);
    const startTimeStr = startDate.toTimeString().slice(0, 5);
    const endTimeStr = endTime.toTimeString().slice(0, 5);
    const finalOdoStr = prompt('\u6700\u7d42\u30aa\u30c9\u30e1\u30fc\u30bf\u30fc\uff08\u4efb\u610f\uff09:');
    const finalOdo = finalOdoStr ? finalOdoStr.trim() : '';
    const logEntry = {
      date,
      startTime: startTimeStr,
      endTime: endTimeStr,
      purpose: '',
      start: '',
      end: '',
      distance: '',
      cost: '',
      notes: '',
      events: currentTripEvents.slice(),
      finalOdo
    };
    logs.push(logEntry);
    saveLogs();
    currentTripStartTime = null;
    currentTripEvents = [];
    const label = document.getElementById('toggleLabel');
    if (label) label.textContent = '\u904b\u884c\u958b\u59cb';
    if (btn) {
      btn.classList.remove('stop');
      btn.classList.add('start');
    }
    showList();
  }
}

// \u8d70\u884c\u30ed\u30b0 \u4fdd\u5b58/\u8aad\u8fbc
function loadLogs() {
  try {
    const data = localStorage.getItem('runlog_logs');
    logs = data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to parse stored logs', e);
    logs = [];
  }
}
function saveLogs() {
  localStorage.setItem('runlog_logs', JSON.stringify(logs));
}

// \u30e1\u30f3\u30c6\u30ca\u30f3\u30b9 \u4fdd\u5b58/\u8aad\u8fbc
function loadMaintenance() {
  try {
    const data = localStorage.getItem('runlog_maintenance');
    maintenance = data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to parse maintenance', e);
    maintenance = [];
  }
}
function saveMaintenance() {
  localStorage.setItem('runlog_maintenance', JSON.stringify(maintenance));
}

// \u8d70\u884c\u30ed\u30b0 \u30d5\u30a9\u30fc\u30e0
function showForm(editIndex = -1) {
  const init = {
    date: '',
    startTime: '',
    endTime: '',
    purpose: '',
    start: '',
    end: '',
    distance: '',
    cost: '',
    notes: ''
  };
  let log = { ...init };
  if (editIndex >= 0) {
    log = { ...logs[editIndex] };
  } else {
    log.date = new Date().toISOString().slice(0, 10);
  }
  const html = `
    <h2>${editIndex >= 0 ? '\u8a18\u9332\u3092\u7de8\u96c6' : '\u65b0\u898f\u8a18\u9332'}</h2>
    <form id="logForm">
      <div>
        <label for="date">\u65e5\u4ed8:</label>
        <input type="date" id="date" name="date" value="${log.date}">
      </div>
      <div>
        <label for="startTime">\u958b\u59cb\u6642\u523b:</label>
        <input type="time" id="startTime" name="startTime" value="${log.startTime || ''}">
      </div>
      <div>
        <label for="endTime">\u7d42\u4e86\u6642\u523b:</label>
        <input type="time" id="endTime" name="endTime" value="${log.endTime || ''}">
      </div>
      <div>
        <label for="purpose">\u76ee\u7684:</label>
        <input type="text" id="purpose" name="purpose" value="${log.purpose || ''}" placeholder="\u8377\u7269\u30fb\u7528\u9014\u306a\u3069">
      </div>
      <div>
        <label for="start">\u51fa\u767a\u5730:</label>
        <input type="text" id="start" name="start" value="${log.start || ''}">
      </div>
      <div>
        <label for="end">\u5230\u7740\u5730:</label>
        <input type="text" id="end" name="end" value="${log.end || ''}">
      </div>
      <div>
        <label for="distance">\u8ddd\u96e2 (km):</label>
        <input type="number" step="0.1" id="distance" name="distance" value="${log.distance || ''}">
      </div>
      <div>
        <label for="cost">\u8cbb\u7528 (\u5186):</label>
        <input type="number" step="0.1" id="cost" name="cost" value="${log.cost || ''}">
      </div>
      <div>
        <label for="notes">\u30e1\u30e2:</label>
        <textarea id="notes" name="notes" rows="3">${log.notes || ''}</textarea>
      </div>
      <div>
        <button type="submit">${editIndex >= 0 ? '\u4fdd\u5b58' : '\u8ffd\u52a0'}</button>
        <button type="button" onclick="showList()">\u30ad\u30e3\u30f3\u30bb\u30eb</button>
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
  const date = document.getElementById('date').value;
  const startTime = document.getElementById('startTime').value;
  const endTime = document.getElementById('endTime').value;
  const purpose = document.getElementById('purpose').value.trim();
  const start = document.getElementById('start').value.trim();
  const end = document.getElementById('end').value.trim();
  const distance = parseFloat(document.getElementById('distance').value);
  const cost = parseFloat(document.getElementById('cost').value);
  const notes = document.getElementById('notes').value.trim();
  const errors = [];
  if (!date) errors.push('\u65e5\u4ed8\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
  if (!startTime) errors.push('\u958b\u59cb\u6642\u523b\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
  if (!endTime) errors.push('\u7d42\u4e86\u6642\u523b\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
  if (!isNaN(distance) && distance < 0) errors.push('\u8ddd\u96e2\u306f0\u4ee5\u4e0a\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
  if (!isNaN(cost) && cost < 0) errors.push('\u8cbb\u7528\u306f0\u4ee5\u4e0a\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
  if (startTime && endTime && startTime > endTime) errors.push('\u958b\u59cb\u6642\u523b\u306f\u7d42\u4e86\u6642\u523b\u3088\u308a\u524d\u3067\u306a\u3051\u308c\u3070\u306a\u308a\u307e\u305b\u3093\u3002');
  if (errors.length > 0) {
    document.getElementById('formError').innerText = errors.join('\n');
    return;
  }
  const existing = editIndex >= 0 ? logs[editIndex] : {};
  const logEntry = {
    date,
    startTime,
    endTime,
    purpose,
    start,
    end,
    distance: isNaN(distance) ? '' : distance,
    cost: isNaN(cost) ? '' : cost,
    notes,
    events: existing.events || [],
    finalOdo: existing.finalOdo || ''
  };
  if (editIndex >= 0) logs[editIndex] = logEntry; else logs.push(logEntry);
  saveLogs();
  showList();
}

function showList() {
  if (logs.length === 0) {
    document.getElementById('content').innerHTML = '<p>\u8a18\u9332\u304c\u3042\u308a\u307e\u305b\u3093\u3002\u300c\u65b0\u898f\u8a18\u9332\u300d\u30dc\u30bf\u30f3\u304b\u3089\u8ffd\u52a0\u3057\u3066\u304f\u3060\u3055\u3044\u3002</p>';
    return;
  }
  const tableRows = logs
    .map((log, index) => `
      <tr>
        <td>${log.date}</td>
        <td>${log.startTime}</td>
        <td>${log.endTime}</td>
        <td>${log.purpose}</td>
        <td>${log.start}</td>
        <td>${log.end}</td>
        <td>${log.distance}</td>
        <td>${log.cost}</td>
        <td>
          <button onclick=\"showForm(${index})\">\u7de8\u96c6</button>
          <button onclick=\"deleteLog(${index})\">\u524a\u9664</button>
        </td>
      </tr>
    `)
    .join('');
  const html = `
    <h2>\u8a18\u9332\u4e00\u89a7</h2>
    <table>
      <thead>
        <tr>
          <th>\u65e5\u4ed8</th>
          <th>\u958b\u59cb</th>
          <th>\u7d42\u4e86</th>
          <th>\u76ee\u7684</th>
          <th>\u51fa\u767a\u5730</th>
          <th>\u5230\u7740\u5730</th>
          <th>\u8ddd\u96e2(km)</th>
          <th>\u8cbb\u7528(\u5186)</th>
          <th>\u64cd\u4f5c</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;
  document.getElementById('content').innerHTML = html;
}

function deleteLog(index) {
  if (confirm('\u3053\u306e\u8a18\u9332\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f')) {
    logs.splice(index, 1);
    saveLogs();
    showList();
  }
}

function showSummary() {
  if (logs.length === 0) {
    document.getElementById('content').innerHTML = '<p>\u8a18\u9332\u304c\u3042\u308a\u307e\u305b\u3093\u3002</p>';
    return;
  }
  let totalDistance = 0;
  let totalCost = 0;
  logs.forEach((log) => {
    if (log.distance !== '' && !isNaN(Number(log.distance))) totalDistance += Number(log.distance);
    if (log.cost !== '' && !isNaN(Number(log.cost))) totalCost += Number(log.cost);
  });
  const html = `
    <h2>\u96c6\u8a08</h2>
    <p>\u8a18\u9332\u4ef6\u6570: ${logs.length}</p>
    <p>\u7dcf\u8ddd\u96e2: ${totalDistance.toFixed(1)} km</p>
    <p>\u7dcf\u8cbb\u7528: ${totalCost.toFixed(0)} \u5186</p>
  `;
  document.getElementById('content').innerHTML = html;
}

function recordEvent(type) {
  if (!currentTripStartTime) {
    alert('\u904b\u884c\u3092\u958b\u59cb\u3057\u3066\u304b\u3089\u30a4\u30d9\u30f3\u30c8\u3092\u8a18\u9332\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
    return;
  }
  const eventTime = new Date();
  const eventObj = {
    type,
    time: eventTime.toTimeString().slice(0, 5),
    location: '',
    fuelAmount: '',
    fuelPrice: ''
  };
  function finalize() {
    // UI\u30dc\u30bf\u30f3\u306f\u82f1\u8a9e\uff08Load/Unload/Break\uff09\u304b\u3089\u547c\u3070\u308c\u308b\u53ef\u80fd\u6027\u304c\u3042\u308b\u306e\u3067\u65e5\u672c\u8a9e\u30e9\u30d9\u30eb\u306b\u5909\u63db
    const map = { 'Load': '\u8377\u7a4d\u307f', 'Unload': '\u8377\u5378\u3057', 'Break': '\u4f11\u61a9' };
    eventObj.type = map[type] || type;
    currentTripEvents.push(eventObj);
    alert(`${eventObj.type} \u3092\u8a18\u9332\u3057\u307e\u3057\u305f\u3002`);
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`)
          .then((response) => response.json())
          .then((data) => {
            if (data && data.display_name) {
              eventObj.location = data.display_name;
            }
            finalize();
          })
          .catch(() => finalize());
      },
      () => finalize()
    );
  } else {
    finalize();
  }
}

function recordFuelEvent() {
  if (!currentTripStartTime) {
    alert('\u904b\u884c\u3092\u958b\u59cb\u3057\u3066\u304b\u3089\u30a4\u30d9\u30f3\u30c8\u3092\u8a18\u9332\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
    return;
  }
  const amountStr = prompt('\u7d66\u6cb9\u91cf\uff08L\uff09:');
  let fuelAmount = '';
  if (amountStr) {
    const amtNum = parseFloat(amountStr);
    fuelAmount = isNaN(amtNum) ? '' : amtNum;
  }
  const priceStr = prompt('1\u30ea\u30c3\u30c8\u30eb\u3042\u305f\u308a\u306e\u5358\u4fa1\uff08\u5186\u30fb\u4efb\u610f\uff09:');
  let fuelPrice = '';
  if (priceStr) {
    const priceNum = parseFloat(priceStr);
    fuelPrice = isNaN(priceNum) ? '' : priceNum;
  }
  const type = '\u7d66\u6cb9';
  const eventTime = new Date();
  const eventObj = {
    type,
    time: eventTime.toTimeString().slice(0, 5),
    location: '',
    fuelAmount,
    fuelPrice
  };
  function finalize() {
    currentTripEvents.push(eventObj);
    alert(`${type} \u3092\u8a18\u9332\u3057\u307e\u3057\u305f\u3002`);
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`)
          .then((response) => response.json())
          .then((data) => {
            if (data && data.display_name) eventObj.location = data.display_name;
            finalize();
          })
          .catch(() => finalize());
      },
      () => finalize()
    );
  } else {
    finalize();
  }
}

function exportCSV() {
  if (logs.length === 0) {
    alert('\u30a8\u30af\u30b9\u30dd\u30fc\u30c8\u3059\u308b\u8a18\u9332\u304c\u3042\u308a\u307e\u305b\u3093\u3002');
    return;
  }
  const headers = ['\u65e5\u4ed8','\u958b\u59cb','\u7d42\u4e86','\u76ee\u7684','\u51fa\u767a\u5730','\u5230\u7740\u5730','\u8ddd\u96e2(km)','\u8cbb\u7528(\u5186)','\u30e1\u30e2','\u30a4\u30d9\u30f3\u30c8','\u6700\u7d42\u30aa\u30c9\u30e1\u30fc\u30bf\u30fc'];
  const rows = logs.map((log) => {
    let eventsStr = '';
    if (log.events && log.events.length) {
      eventsStr = log.events
        .map((ev) => {
          let s = `${ev.time} ${ev.type}`;
          if (ev.location) s += `(${ev.location})`;
          if (ev.type === '\u7d66\u6cb9') {
            const amount = ev.fuelAmount !== '' ? `${ev.fuelAmount}L` : '';
            const price = ev.fuelPrice !== '' ? `${ev.fuelPrice}\u5186/L` : '';
            const details = [amount, price].filter(Boolean).join(', ');
            if (details) s += `:${details}`;
          }
          return s;
        })
        .join('; ');
    }
    return [
      log.date,
      log.startTime,
      log.endTime,
      log.purpose,
      log.start,
      log.end,
      log.distance,
      log.cost,
      String(log.notes || '').replace(/\n/g, '\\n'),
      eventsStr,
      log.finalOdo || ''
    ].join(',');
  });
  const csvContent = [headers.join(','), ...rows].join('\n');
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

// \u30e1\u30f3\u30c6\u30ca\u30f3\u30b9
function showMaintenanceList() {
  if (maintenance.length === 0) {
    document.getElementById('content').innerHTML = `
      <h2>\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9</h2>
      <p>\u8a18\u9332\u304c\u3042\u308a\u307e\u305b\u3093\u3002\u300c\u65b0\u898f\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9\u300d\u304b\u3089\u8ffd\u52a0\u3057\u3066\u304f\u3060\u3055\u3044\u3002</p>
      <button onclick=\"showMaintenanceForm()\">\u65b0\u898f\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9</button>
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
        <td>
          <button onclick=\"showMaintenanceForm(${i})\">\u7de8\u96c6</button>
          <button onclick=\"deleteMaintenance(${i})\">\u524a\u9664</button>
        </td>
      </tr>
    `)
    .join('');
  const html = `
    <h2>\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9</h2>
    <div style="margin: 0 0 0.5rem 0;">
      <button onclick=\"showMaintenanceForm()\">\u65b0\u898f\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9</button>
      <button onclick=\"exportMaintenanceCSV()\">CSV\u51fa\u529b</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>\u65e5\u4ed8</th>
          <th>\u5185\u5bb9</th>
          <th>\u30aa\u30c9\u30e1\u30fc\u30bf\u30fc</th>
          <th>\u8cbb\u7528(\u5186)</th>
          <th>\u30e1\u30e2</th>
          <th>\u64cd\u4f5c</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  document.getElementById('content').innerHTML = html;
}

function showMaintenanceForm(editIndex = -1) {
  const init = { date: new Date().toISOString().slice(0, 10), type: '\u30aa\u30a4\u30eb\u4ea4\u63db', odometer: '', cost: '', notes: '' };
  const m = editIndex >= 0 ? { ...maintenance[editIndex] } : init;
  const html = `
    <h2>${editIndex >= 0 ? '\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9\u7de8\u96c6' : '\u65b0\u898f\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9'}</h2>
    <form id=\"mntForm\">
      <div>
        <label for=\"mDate\">\u65e5\u4ed8:</label>
        <input type=\"date\" id=\"mDate\" value=\"${m.date}\">
      </div>
      <div>
        <label for=\"mType\">\u5185\u5bb9:</label>
        <select id=\"mType\">
          <option${m.type === '\u30aa\u30a4\u30eb\u4ea4\u63db' ? ' selected' : ''}>\u30aa\u30a4\u30eb\u4ea4\u63db</option>
          <option${m.type === '\u30bf\u30a4\u30e4\u4ea4\u63db' ? ' selected' : ''}>\u30bf\u30a4\u30e4\u4ea4\u63db</option>
          <option${m.type === '\u70b9\u691c' ? ' selected' : ''}>\u70b9\u691c</option>
          <option${m.type === '\u8eca\u691c' ? ' selected' : ''}>\u8eca\u691c</option>
          <option${m.type === '\u30d0\u30c3\u30c6\u30ea\u30fc\u4ea4\u63db' ? ' selected' : ''}>\u30d0\u30c3\u30c6\u30ea\u30fc\u4ea4\u63db</option>
          <option${m.type === '\u30ef\u30a4\u30d1\u30fc\u4ea4\u63db' ? ' selected' : ''}>\u30ef\u30a4\u30d1\u30fc\u4ea4\u63db</option>
          <option${m.type && !['\u30aa\u30a4\u30eb\u4ea4\u63db','\u30bf\u30a4\u30e4\u4ea4\u63db','\u70b9\u691c','\u8eca\u691c','\u30d0\u30c3\u30c6\u30ea\u30fc\u4ea4\u63db','\u30ef\u30a4\u30d1\u30fc\u4ea4\u63db'].includes(m.type) ? ' selected' : ''}>\u305d\u306e\u4ed6</option>
        </select>
      </div>
      <div>
        <label for=\"mOdo\">\u30aa\u30c9\u30e1\u30fc\u30bf\u30fc:</label>
        <input type=\"number\" id=\"mOdo\" value=\"${m.odometer}\">
      </div>
      <div>
        <label for=\"mCost\">\u8cbb\u7528(\u5186):</label>
        <input type=\"number\" id=\"mCost\" value=\"${m.cost}\">
      </div>
      <div>
        <label for=\"mNotes\">\u30e1\u30e2:</label>
        <textarea id=\"mNotes\" rows=\"3\">${m.notes || ''}</textarea>
      </div>
      <div>
        <button type=\"submit\">${editIndex >= 0 ? '\u4fdd\u5b58' : '\u8ffd\u52a0'}</button>
        <button type=\"button\" onclick=\"showMaintenanceList()\">\u30ad\u30e3\u30f3\u30bb\u30eb</button>
      </div>
      <div id=\"mntError\" class=\"error\"></div>
    </form>
  `;
  document.getElementById('content').innerHTML = html;
  document.getElementById('mntForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitMaintenance(editIndex);
  });
}

function submitMaintenance(editIndex) {
  const date = document.getElementById('mDate').value;
  const type = document.getElementById('mType').value;
  const odometerVal = document.getElementById('mOdo').value;
  const costVal = document.getElementById('mCost').value;
  const notes = document.getElementById('mNotes').value.trim();
  const errors = [];
  if (!date) errors.push('\u65e5\u4ed8\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
  const odometer = odometerVal === '' ? '' : Number(odometerVal);
  const cost = costVal === '' ? '' : Number(costVal);
  if (odometer !== '' && (isNaN(odometer) || odometer < 0)) errors.push('\u30aa\u30c9\u30e1\u30fc\u30bf\u30fc\u306f0\u4ee5\u4e0a\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
  if (cost !== '' && (isNaN(cost) || cost < 0)) errors.push('\u8cbb\u7528\u306f0\u4ee5\u4e0a\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
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
  if (confirm('\u3053\u306e\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9\u8a18\u9332\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f')) {
    maintenance.splice(index, 1);
    saveMaintenance();
    showMaintenanceList();
  }
}

function exportMaintenanceCSV() {
  if (maintenance.length === 0) {
    alert('\u30a8\u30af\u30b9\u30dd\u30fc\u30c8\u3059\u308b\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9\u8a18\u9332\u304c\u3042\u308a\u307e\u305b\u3093\u3002');
    return;
  }
  const headers = ['\u65e5\u4ed8','\u5185\u5bb9','\u30aa\u30c9\u30e1\u30fc\u30bf\u30fc','\u8cbb\u7528(\u5186)','\u30e1\u30e2'];
  const rows = maintenance.map((m) => [
    m.date,
    m.type,
    m.odometer,
    m.cost,
    String(m.notes || '').replace(/\n/g, '\\n')
  ].join(','));
  const csvContent = [headers.join(','), ...rows].join('\n');
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

// Service Worker \u767b\u9332
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

// \u8d77\u52d5\u6642\u51e6\u7406
window.addEventListener('load', () => {
  loadLogs();
  loadMaintenance();
  applyJapaneseLabels();
  showList();
  registerServiceWorker();
});

// \u753b\u9762\u306e\u56fa\u5b9a\u30e9\u30d9\u30eb\uff08\u30ca\u30d3\u7b49\uff09\u3092\u65e5\u672c\u8a9e\u306b
function applyJapaneseLabels() {
  document.title = '\u904b\u884c\u7ba1\u7406\u30a2\u30d7\u30ea';
  const h1 = document.querySelector('header h1');
  if (h1) h1.textContent = '\u904b\u884c\u7ba1\u7406\u30a2\u30d7\u30ea';
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  setText('toggleLabel', '\u904b\u884c\u958b\u59cb');
  setText('btnNewLog', '\u65b0\u898f\u8a18\u9332');
  setText('btnList', '\u4e00\u89a7');
  setText('btnSummary', '\u96c6\u8a08');
  setText('btnExport', 'CSV\u51fa\u529b');
  setText('btnMaintenance', '\u30e1\u30f3\u30c6\u30ca\u30f3\u30b9');
  setText('btnLoad', '\u8377\u7a4d\u307f');
  setText('btnUnload', '\u8377\u5378\u3057');
  setText('btnFuel', '\u7d66\u6cb9');
  setText('btnBreak', '\u4f11\u61a9');
}
