/* ── Stress Lab · parte 1 de 8 ── */

/*
 * ── Stress Lab · Google Apps Script ──
 *
 * El “servidor” de la página Stress Lab (word stress):
 *   • Guarda los resultados en esta planilla: Resultados (una fila por hoja de
 *     trabajo terminada), Respuestas (una fila por respuesta), Grabaciones
 *     (los audios que mandan los alumnos quedan en tu Drive), Resumen y
 *     Alumno × Ejercicio (se actualizan solos).
 *   • Es el motor de voz: genera el audio con ElevenLabs sin que tu API key
 *     quede a la vista. Cada frase se guarda en tu Drive y no se vuelve a pagar.
 *   • Entrega los audios del libro que están en tus carpetas de Drive
 *     (Chapter 6–7 y Word Stress Practices); nunca otros archivos.
 *
 * Instalación (una vez, unos 5 minutos):
 *   1. Creá una planilla nueva (sheets.new) → Extensiones → Apps Script.
 *   2. Borrá lo que haya, pegá todo este archivo (o las partes, en orden) y guardá.
 *   3. Elegí la función «setup» → ▶ Ejecutar → aceptá los permisos.
 *      (Si dice «Google no verificó esta app»: Configuración avanzada → Ir a … —
 *      es tu propio script.)
 *   4. Volvé a la planilla y recargala: aparece el menú «Stress Lab».
 *      Stress Lab → Guardar API key de ElevenLabs → pegá tu key NUEVA (sk_…).
 *      La key queda solo en este script: no la pegues en ningún otro lado.
 *   5. Implementar → Nueva implementación → ⚙ Aplicación web ·
 *      Ejecutar como: Yo · Quién tiene acceso: Cualquier persona →
 *      Implementar → copiá la URL (termina en /exec).
 *   6. En la página: Settings → pegá la URL → Test connection → Save.
 *      Ahí mismo: «Check the recordings» muestra qué audio usa cada actividad.
 *
 * Si cambiás este código: Implementar → Administrar implementaciones → ✏ →
 * Versión: Nueva versión → Implementar. La URL sigue siendo la misma.
 */

const APP_NAME = 'Stress Lab';
const VERSION = 1;
/* Vacío = la planilla que contiene el script. */
const SPREADSHEET_ID = '';
/* Las carpetas de Drive con los audios de los libros (y sus subcarpetas). */
const BOOK_FOLDERS = [
  '1cXgDywfAPi7-SQblFlSuQC2KphK33eUt', /* Chapter 6 Stress and Chapter 7 Stress (Advanced) */
  '1SmSKUtgjUDvmMc6gW1h8Yh_qwjmABo_C', /* Word Stress Practices */
];
const HEADER_BG = '#3346d3';
const MAX_TEXT = 1000;
const MAX_ITEMS = 400;
const MAX_AUDIO_BASE64 = 14 * 1024 * 1024;
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|aac|wma|mpeg|mp4)$/i;

const SHEETS = {
  results: {
    name: 'Resultados',
    headers: ['Fecha', 'Alumno', 'Curso', 'Hoja', 'Título', 'Correctas', 'Total', '%', 'Duración', 'ID intento'],
    widths: [135, 180, 90, 90, 300, 80, 60, 70, 80, 110],
  },
  answers: {
    name: 'Respuestas',
    headers: ['Fecha', 'Alumno', 'Curso', 'Hoja', 'N°', 'Pregunta', 'Respuesta del alumno', 'Respuesta correcta', '¿Correcta?', 'ID intento'],
    widths: [135, 180, 90, 90, 45, 380, 230, 230, 85, 110],
  },
  recordings: {
    name: 'Grabaciones',
    headers: ['Fecha', 'Alumno', 'Curso', 'Frase', 'Audio', 'Duración (s)', 'ID'],
    widths: [135, 180, 90, 340, 110, 95, 110],
  },
  book: {
    name: 'Audios del libro',
    headers: ['Carpeta', 'Archivo', 'Tipo', 'Tamaño (KB)', 'ID'],
    widths: [300, 380, 110, 95, 300],
  },
};
/* Tiene que coincidir con js/audio-core.js (los tests lo verifican). */
const TTS = {
  api: 'https://api.elevenlabs.io/v1',
  outputFormat: 'mp3_44100_64',
  defaultModel: 'eleven_multilingual_v2',
  models: ['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_v3'],
  speeds: { natural: 1, slow: 0.8, words: 0.95 },
  maxChars: 400,
  dailyLimit: 20000,
  cacheSeconds: 21600,
};
const SUMMARY = 'Resumen';
const MATRIX = 'Alumno × Ejercicio';
const AUDIO_TYPES = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

/* ── fin de la parte 1 de 8 ── */
