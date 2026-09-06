import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);

// runtime/src/logging/redaction.ts
var sensitiveKey = /(?:password|passwd|secret|token|api[_-]?key|authorization|credential|cookie|private[_-]?key)/iu;
function redactText(text, environment = process.env) {
  let result = text;
  const values = Object.entries(environment).filter(([key, value]) => sensitiveKey.test(key) && value && value.length >= 4).map(([, value]) => value).sort((a, b) => b.length - a.length);
  for (const value of values) result = result.split(value).join("[REDACTED]");
  return result.replace(/\b(?:sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu, "[REDACTED]").replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_.=-]+/giu, "$1 [REDACTED]").replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu, "[REDACTED PRIVATE KEY]").replace(/((?:["']?[\w.-]*(?:password|passwd|secret|token|api[_-]?key|authorization|credential|cookie|private[_-]?key)[\w.-]*["']?)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s,;}]+)/giu, '$1"[REDACTED]"').replace(/([?&](?:token|api_key|password|secret)=)[^\s&#"']+/giu, "$1[REDACTED]").replace(/(https?:\/\/)[^\s/:]+:[^\s/@]+@/giu, "$1[REDACTED]@");
}
function redactValue(value, environment = process.env) {
  if (typeof value === "string") return redactText(value, environment);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, environment));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    sensitiveKey.test(key) ? redactSensitiveValue(item) : redactValue(item, environment)
  ]));
  return value;
}
function redactSensitiveValue(value) {
  if (typeof value === "string") return "[REDACTED]";
  if (Array.isArray(value)) return value.map(redactSensitiveValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSensitiveValue(item)]));
  return value;
}
function redactArtifact(text) {
  try {
    return JSON.stringify(redactValue(JSON.parse(text)), null, 2);
  } catch {
    return redactText(text);
  }
}

export {
  redactText,
  redactValue,
  redactArtifact
};
//# sourceMappingURL=chunk-5CGYLQMM.js.map
