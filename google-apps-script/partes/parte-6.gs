/* ── Stress Lab · parte 6 de 8 ── */

/* ─── Resultados y grabaciones ─── */

function saveResult_(d) {
  const ss = getSpreadsheet_();
  const results = sheet_(ss, SHEETS.results);
  const id = cleanId_(d.id);
  if (exists_(results, 10, id)) return { ok: true, duplicate: true };

  const when = date_(d.finishedAt);
  const student = clean_(d.student, 80) || '(sin nombre)';
  const group = clean_(d.group, 40);
  const setId = clean_(d.setId, 60);
  const total = num_(d.total);
  const correct = num_(d.correct);

  results.appendRow([
    when,
    student,
    group,
    setId,
    clean_(d.setTitle, 160),
    correct,
    total,
    total ? correct / total : 0,
    num_(d.durationSec) / 86400,
    id,
  ]);

  const items = Array.isArray(d.items) ? d.items.slice(0, MAX_ITEMS) : [];
  if (items.length) {
    const answers = sheet_(ss, SHEETS.answers);
    const rows = items.map(function (it, i) {
      it = it || {};
      return [when, student, group, setId, num_(it.n) || i + 1, clean_(it.prompt), clean_(it.answer), clean_(it.expected), it.correct === true, id];
    });
    const start = lastRowWithId_(answers) + 1;
    answers.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
    answers.getRange(start, 9, rows.length, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  }
  return { ok: true, saved: items.length };
}

function saveRecording_(d) {
  const ss = getSpreadsheet_();
  const sheet = sheet_(ss, SHEETS.recordings);
  const id = cleanId_(d.id);
  if (exists_(sheet, 7, id)) return { ok: true, duplicate: true };

  const mime = String(d.mimeType || '').split(';')[0].trim().toLowerCase();
  const ext = AUDIO_TYPES[mime];
  if (!ext) throw new Error('Formato de audio no admitido: ' + mime);
  const audio = String(d.audio || '');
  if (!audio) throw new Error('Falta el audio.');
  if (audio.length > MAX_AUDIO_BASE64) throw new Error('La grabación es demasiado larga.');

  const when = date_(d.recordedAt);
  const student = clean_(d.student, 80) || '(sin nombre)';
  const group = clean_(d.group, 40);
  const phrase = clean_(d.text, 300);
  const stamp = Utilities.formatDate(when, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH.mm');
  const fileName = stamp + ' · ' + student.replace(/^'/, '') + ' · ' + phrase.replace(/^'/, '').slice(0, 40) + '.' + ext;
  const blob = Utilities.newBlob(Utilities.base64Decode(audio), mime, fileName);
  const file = recordingsFolder_().createFile(blob);

  sheet.appendRow([when, student, group, phrase, '=HYPERLINK("' + file.getUrl() + '","▶ Escuchar")', num_(d.durationSec), id]);
  return { ok: true };
}

/* ── fin de la parte 6 de 8 ── */
