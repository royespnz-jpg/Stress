// Talks to the Google Apps Script web app (google-apps-script/Code.gs).
// A text/plain POST avoids a CORS preflight; Apps Script answers with a
// redirect to a JSON response that any origin can read.

const URL_RE = /^https:\/\/script\.google\.com\/(?:a\/[^/\s]+\/)?macros\/s\/[\w-]+\/(?:exec|dev)$/;

export function isScriptUrl(url) {
  return URL_RE.test(String(url || '').trim());
}

async function readJson(res) {
  if (!res.ok) throw new Error(`Google Script error ${res.status}`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('The Google Script did not answer with data. Is it deployed for “Anyone”?');
  }
  // fromScript: the script answered, with an error of its own.
  if (!data.ok) throw Object.assign(new Error(data.error || 'The Google Script rejected the request.'), { fromScript: true });
  return data;
}

export async function scriptPost(url, payload) {
  const res = await fetch(url.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  return readJson(res);
}

export async function scriptGet(url) {
  const res = await fetch(url.trim(), { redirect: 'follow' });
  return readJson(res);
}
