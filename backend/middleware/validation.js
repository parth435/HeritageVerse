function readPositiveId(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const id = Number(value.trim());
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  return null;
}

function readText(value, { required = false, maximum = 2000 } = {}) {
  if (value === undefined || value === null) return required ? null : "";
  if (typeof value !== "string") return null;
  const text = value.trim();
  if ((required && !text) || text.length > maximum) return null;
  return text;
}

function readCoordinate(value, { minimum, maximum }) {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: null };
  }

  const text = typeof value === "string" ? value.trim() : value;
  if (text === "") return { valid: true, value: null };
  if (typeof text !== "number" && (typeof text !== "string" || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(text))) {
    return { valid: false, value: null };
  }

  const coordinate = Number(text);
  if (!Number.isFinite(coordinate) || coordinate < minimum || coordinate > maximum) {
    return { valid: false, value: null };
  }

  return { valid: true, value: coordinate };
}

module.exports = { readPositiveId, readText, readCoordinate };
