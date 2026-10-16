"use strict";

function readTrustedProxyHops(
  value = process.env.TRUST_PROXY_HOPS,
  production = process.env.NODE_ENV === "production",
) {
  const configured = typeof value === "string" ? value.trim() : "";
  const normalized = configured || "0";
  if (!/^(0|[1-5])$/.test(normalized)) {
    throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 5");
  }
  const hops = Number(normalized);
  if (production && hops === 0) {
    throw new Error("TRUST_PROXY_HOPS must be greater than 0 in production behind a proxy");
  }
  return hops;
}

module.exports = { readTrustedProxyHops };
