const statusBox = document.querySelector('#sync-status');
function status(message) {
  if (!statusBox) return;
  statusBox.textContent = message;
  statusBox.hidden = false;
  setTimeout(() => (statusBox.hidden = true), 4500);
}
function uuid() {
  return crypto.randomUUID();
}
const dbRequest = indexedDB.open('ops-forms', 1);
dbRequest.onupgradeneeded = () => {
  const db = dbRequest.result;
  if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'key' });
  if (!db.objectStoreNames.contains('queue'))
    db.createObjectStore('queue', { keyPath: 'idempotencyKey' });
};
function store(name, mode = 'readonly') {
  return dbRequest.result.transaction(name, mode).objectStore(name);
}
function put(name, value) {
  return new Promise((resolve, reject) => {
    const req = store(name, 'readwrite').put(value);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}
function remove(name, key) {
  return new Promise((resolve, reject) => {
    const req = store(name, 'readwrite').delete(key);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}
function all(name) {
  return new Promise((resolve, reject) => {
    const req = store(name).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function setupSignature(root) {
  const canvas = root.querySelector('canvas'),
    input = root.querySelector('input'),
    ctx = canvas.getContext('2d');
  let active = false;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const point = (e) => {
    const r = canvas.getBoundingClientRect(),
      p = e.touches?.[0] || e;
    return [
      ((p.clientX - r.left) * canvas.width) / r.width,
      ((p.clientY - r.top) * canvas.height) / r.height,
    ];
  };
  canvas.addEventListener('pointerdown', (e) => {
    active = true;
    ctx.beginPath();
    ctx.moveTo(...point(e));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!active) return;
    ctx.lineTo(...point(e));
    ctx.stroke();
  });
  window.addEventListener('pointerup', () => {
    if (active) input.value = canvas.toDataURL('image/webp', 0.75);
    active = false;
  });
  root.querySelector('.clear-signature').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    input.value = '';
  });
}
document.querySelectorAll('.signature').forEach(setupSignature);
const form = document.querySelector('#operations-form');
let gps = null;
if (form) {
  const key = form.dataset.formKey,
    gpsBox = form.querySelector('[data-gps]'),
    reason = gpsBox.querySelector('input');
  if (form.dataset.requiresGps === 'true' && navigator.geolocation)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        gps = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
        };
        gpsBox.querySelector('span').textContent = `Captured (±${Math.round(p.coords.accuracy)} m)`;
      },
      () => {
        gpsBox.querySelector('span').textContent = 'Location unavailable';
        reason.hidden = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  const values = () =>
    Object.fromEntries([...new FormData(form)].filter(([, v]) => typeof v === 'string'));
  const envelope = () => ({
    idempotencyKey: uuid(),
    formVersion: Number(form.dataset.version),
    values: values(),
    gps,
    gpsUnavailableReason: reason.value,
    device: { userAgent: navigator.userAgent, clientTimestamp: new Date().toISOString() },
  });
  form.querySelector('[data-save-draft]').addEventListener('click', async () => {
    await put('drafts', { key, values: values(), savedAt: new Date().toISOString() });
    status('Draft saved on this device');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const payload = envelope();
    try {
      const response = await fetch(`/api/forms/${key}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Submission failed');
      await remove('drafts', key);
      status('Checklist submitted');
      setTimeout(() => location.assign('/forms'), 700);
    } catch (error) {
      if (navigator.onLine) {
        status(error.message);
        return;
      }
      await put('queue', { ...payload, formKey: key });
      status('Offline: submission queued safely');
    }
  });
}
async function sync() {
  if (!navigator.onLine || dbRequest.readyState !== 'done') return;
  for (const item of await all('queue')) {
    try {
      const { formKey, ...payload } = item;
      const response = await fetch(`/api/forms/${formKey}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
        body: JSON.stringify(payload),
      });
      if (response.ok) await remove('queue', item.idempotencyKey);
    } catch {
      break;
    }
  }
}
window.addEventListener('online', () => {
  status('Back online — syncing');
  void sync();
});
dbRequest.onsuccess = () => void sync();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
