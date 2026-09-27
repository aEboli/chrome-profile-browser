const MAX_TRAFFIC_BYTES = Number.MAX_SAFE_INTEGER;

function normalizeTrafficNumber(value) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return 0;
  return Math.min(number, MAX_TRAFFIC_BYTES);
}

function normalizeTraffic(value) {
  const source = value && typeof value === 'object' ? value : {};
  const uploadedBytes = normalizeTrafficNumber(source.uploadedBytes ?? source.uploadBytes);
  const downloadedBytes = normalizeTrafficNumber(source.downloadedBytes ?? source.downloadBytes);
  return {
    uploadedBytes,
    downloadedBytes,
    totalBytes: Math.min(MAX_TRAFFIC_BYTES, uploadedBytes + downloadedBytes),
    requestCount: normalizeTrafficNumber(source.requestCount),
    lastUpdatedAt: typeof source.lastUpdatedAt === 'string' ? source.lastUpdatedAt : '',
  };
}

function addTraffic(traffic, uploadedBytes = 0, downloadedBytes = 0) {
  const current = normalizeTraffic(traffic);
  const uploaded = Math.min(MAX_TRAFFIC_BYTES, current.uploadedBytes + normalizeTrafficNumber(uploadedBytes));
  const downloaded = Math.min(MAX_TRAFFIC_BYTES, current.downloadedBytes + normalizeTrafficNumber(downloadedBytes));
  return {
    ...current,
    uploadedBytes: uploaded,
    downloadedBytes: downloaded,
    totalBytes: Math.min(MAX_TRAFFIC_BYTES, uploaded + downloaded),
    requestCount: Math.min(MAX_TRAFFIC_BYTES, current.requestCount + 1),
    lastUpdatedAt: new Date().toISOString(),
  };
}

function headerBytes(headers) {
  if (!headers || typeof headers !== 'object') return 0;
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-length');
  if (!entry) return 0;
  const value = Array.isArray(entry[1]) ? entry[1][0] : entry[1];
  return normalizeTrafficNumber(value);
}

function uploadBytes(uploadData) {
  if (!Array.isArray(uploadData)) return 0;
  return uploadData.reduce((total, item) => {
    if (!item || typeof item !== 'object') return total;
    const bytes = item.bytes;
    const length = Buffer.isBuffer(bytes)
      ? bytes.length
      : typeof bytes === 'string'
        ? Buffer.byteLength(bytes)
        : 0;
    return Math.min(MAX_TRAFFIC_BYTES, total + length);
  }, 0);
}

module.exports = {
  MAX_TRAFFIC_BYTES,
  addTraffic,
  headerBytes,
  normalizeTraffic,
  normalizeTrafficNumber,
  uploadBytes,
};
