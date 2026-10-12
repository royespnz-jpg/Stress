import { MODELS } from '../audio-core.js?v=202610122032';
import { getSettings, scriptStatus, voiceName } from '../tts.js?v=202610122032';
import { esc, playButton } from '../ui.js?v=202610122032';
import { isSheetUrl, pendingCount, studentLink } from '../sheets.js?v=202610122032';
import { BOOKS, sheetById } from '../worksheets.js?v=202610122032';
import { audioSlots, matchFiles } from '../book.js?v=202610122032';

export function renderSettings() {
  const s = getSettings();
  const st = scriptStatus();
  const engineText =
    s.engine === 'browser'
      ? 'Browser voice (ElevenLabs is off).'
      : s.apiKey
        ? 'ElevenLabs with your personal key.'
        : st.status === 'ok'
          ? `ElevenLabs through the Google Script${st.sheet ? ` of “${esc(st.sheet)}”` : ''}. The key stays in the script.`
          : st.status === 'other'
            ? 'The Google Script at this URL is not the Stress Lab script (maybe the Connected Speech one). Use the URL of the Stress Lab script.'
            : st.status === 'no-tts'
              ? 'The Google Script is connected but has no ElevenLabs key yet (in the sheet: Stress Lab → Guardar API key de ElevenLabs).'
              : st.status === 'offline'
                ? isSheetUrl(s.sheetUrl)
                  ? `Can't reach the Google Script: ${esc(st.error || 'offline')}.`
                  : 'No Google Script is connected yet: the browser voice is used. Paste the script URL below.'
                : 'Checking the Google Script…';
  return `<header class="topic-head">
      <div class="eyebrow">Settings</div>
      <h1>Voice, recordings &amp; <em>results</em></h1>
      <p class="lede">Connect the teacher's Google Script (voices, book recordings and results), pick the ElevenLabs voices, and check that every activity finds its recording.</p>
    </header>

    <div class="settings-stack">
      ${sheetForm(s)}

      <section class="card form">
        <h2>Voice engine</h2>
        <p class="muted" style="margin:0">${engineText}</p>
        <div class="row">
          <div class="field" style="flex:1 1 180px"><label>Main voice</label><div class="vp-tab" aria-hidden="true" style="pointer-events:none"><span>${esc(voiceName('A'))}</span></div></div>
          <div class="field" style="flex:1 1 180px"><label>Second speaker</label><div class="vp-tab" aria-hidden="true" style="pointer-events:none"><span>${esc(voiceName('B'))}</span></div></div>
        </div>
        <div class="row">
          <button type="button" class="btn primary" data-open-voices>Choose voices</button>
          ${playButton('photograph, photography, photographic', { label: 'Main voice' })}
          ${playButton('Are you a graduate student?', { voice: 'B', label: 'Second speaker' })}
        </div>
        <div class="field">
          <label for="model">ElevenLabs model</label>
          <select id="model" data-model>${MODELS.map((o) => `<option value="${o.id}"${o.id === s.model ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
          <div class="hint">Multilingual v2 sounds best. Flash and Turbo cost half the credits.</div>
        </div>
      </section>

      <section class="card form" id="book-audio">
        <h2>Book recordings</h2>
        <p class="muted" style="margin:0">The recordings stay in the teacher's Google Drive (the session's folders
          <i>Chapter 6 Stress and Chapter 7 Stress (Advanced)</i> and <i>Word Stress Practices</i>). The Google Script lists them,
          and each activity finds its file by the page and the activity in the file name (“table 6-1 … page 63”, “B42”).</p>
        <p class="muted" style="margin:0">${bookStatus(st)}</p>
        <div class="row"><button type="button" class="btn" data-book-check${st.status === 'ok' || st.status === 'no-tts' ? '' : ' disabled'}>Check the recordings</button></div>
        <div id="book-out"></div>
      </section>

      <details class="card">
        <summary>Your own ElevenLabs key <span class="muted" style="font-size:1rem">(optional)</span></summary>
        <form class="form" id="settings-form" autocomplete="off">
          <p class="muted" style="margin:0">Normally the Google Script generates the voices and keeps the key private. Add a key
            here only to use your own ElevenLabs account from this browser.</p>
          <div class="field">
            <label for="api-key">ElevenLabs API key</label>
            <div class="row">
              <input id="api-key" name="apiKey" type="password" value="${esc(s.apiKey)}" placeholder="sk_…" style="flex:1 1 240px" spellcheck="false" autocomplete="off">
              <button type="button" class="btn" data-toggle-key>Show</button>
            </div>
            <div class="hint">Saved only in this browser and sent only to api.elevenlabs.io. Don't use it on a shared computer.</div>
          </div>
          <div class="row">
            <button type="submit" class="btn primary">Save</button>
            <button type="button" class="btn" data-check-credits>Check credits</button>
            <button type="button" class="btn" data-clear-cache>Clear audio cache</button>
          </div>
          <div id="credits-out"></div>
        </form>
      </details>
    </div>`;
}

function bookStatus(st) {
  if (st.status === 'ok' || st.status === 'no-tts') return st.book ? '✓ The Google Script can send the book recordings.' : 'The Google Script doesn’t send book recordings: is it the Stress Lab script?';
  if (st.status === 'checking' || st.status === 'unknown') return 'Checking the Google Script…';
  return 'Connect the Google Script first (above): the book recordings come through it.';
}

// The match of every activity with its file, for the teacher to verify.
export function bookTableHtml(files) {
  const slots = audioSlots();
  const matches = matchFiles(files, slots);
  const used = new Set([...matches.values()].map((f) => f.id));
  const missing = slots.filter((s) => !matches.has(s.key)).length;
  const audio = files.filter((f) => !f.mime || /^audio\//.test(f.mime) || /\.(mp3|m4a|wav|ogg|aac|wma)$/i.test(f.name));
  const unused = audio.filter((f) => !used.has(f.id));
  const rows = slots
    .map((s) => {
      const sheet = sheetById(s.sheet);
      const file = matches.get(s.key);
      const where = s.audio.code ? `Track ${s.audio.code}` : s.audio.label;
      return `<tr class="${file ? '' : 'miss'}">
        <td>${esc(BOOKS[s.book].short)} ${esc(sheet.short)}</td>
        <td>${esc(s.n)} <span class="muted">(${esc(where)}, p. ${s.audio.page})</span></td>
        <td>${file ? `${esc(file.name)}${file.folder ? `<br><small class="muted">${esc(file.folder)}</small>` : ''}` : '<b>not found</b>'}</td>
      </tr>`;
    })
    .join('');
  return `<p class="${missing ? 'warn-text' : 'sent'}">${files.length} files in the folders · ${slots.length - missing} of ${slots.length} activities have their recording${missing ? ` · ${missing} not found` : ' ✓'}.</p>
    <div class="table-wrap book-table"><table>
      <thead><tr><th scope="col">Worksheet</th><th scope="col">Activity</th><th scope="col">File</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${
      unused.length
        ? `<details class="unused"><summary>${unused.length} audio files not used by any activity</summary>
        <ul>${unused.map((f) => `<li>${esc(f.name)}${f.folder ? ` <small class="muted">(${esc(f.folder)})</small>` : ''}</li>`).join('')}</ul></details>`
        : ''
    }`;
}

export function renderCredits(sub) {
  const out = document.getElementById('credits-out');
  if (!out) return;
  const used = sub.character_count ?? 0;
  const limit = sub.character_limit ?? 0;
  const pct = limit ? Math.min(100, (100 * used) / limit) : 0;
  const reset = sub.next_character_count_reset_unix ? new Date(sub.next_character_count_reset_unix * 1000).toLocaleDateString() : '—';
  out.innerHTML = `<div style="margin-top:6px"><b>${esc(sub.tier || 'plan')}</b>: ${used.toLocaleString()} of ${limit.toLocaleString()} credits used
    <div class="meter"><span style="width:${pct}%"></span></div>
    <small class="muted">${(limit - used).toLocaleString()} left · resets ${esc(reset)}</small></div>`;
}

function sheetForm(s) {
  const connected = isSheetUrl(s.sheetUrl);
  const pending = pendingCount();
  return `<form class="card form" id="sheet-form" autocomplete="off">
      <h2>Google Script → results</h2>
      <p class="muted" style="margin:0">Finished worksheets (and recordings you choose to send) go to your teacher's Google
        Sheet. Teachers: set up the sheet with <code>google-apps-script/Code.gs</code> from the repository.</p>
      <div class="row">
        <div class="field" style="flex:1 1 200px"><label for="student">Your name</label>
          <input id="student" name="student" type="text" maxlength="80" value="${esc(s.student)}"></div>
        <div class="field" style="flex:0 1 160px"><label for="group">Class / group</label>
          <input id="group" name="group" type="text" maxlength="40" value="${esc(s.group)}"></div>
      </div>
      <div class="field">
        <label for="sheet-url">Google Script URL (results, voices and book recordings)</label>
        <input id="sheet-url" name="sheetUrl" type="text" spellcheck="false" value="${esc(s.sheetUrl)}"
          placeholder="https://script.google.com/macros/s/…/exec">
        <div class="hint">${connected ? '✓ Saved. ' : ''}Students: your teacher gives you this (or a link that fills it in).</div>
      </div>
      <div class="row">
        <button type="submit" class="btn primary">Save</button>
        <button type="button" class="btn" data-test-sheet>Test connection</button>
        ${pending ? `<button type="button" class="btn" data-flush-sheet>Send pending (${pending})</button>` : ''}
      </div>
      ${
        connected
          ? `<div class="field"><label for="student-link">Student link</label>
          <div class="row"><input id="student-link" type="text" readonly value="${esc(studentLink(s.sheetUrl))}" style="flex:1 1 240px">
            <button type="button" class="btn" data-copy-link>Copy</button></div>
          <div class="hint">Share it with your students: it opens the worksheets already connected to your sheet.</div></div>`
          : ''
      }
    </form>`;
}
