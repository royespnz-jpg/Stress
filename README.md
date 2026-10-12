# Stress Lab — word stress

Página para practicar el acento de las palabras (word stress) con **todas las actividades** de:

- **Accurate English** (Rebecca M. Dauer), cap. 6 «Stress» y cap. 7 «Stress (Advanced)», pp. 60–82.
- **English Pronunciation in Use** (Mark Hancock), unidades 22 y 28–31, pp. 52–53 y 64–71.

Cada actividad respeta la página del libro y sus instrucciones. Donde el libro pide marcar, contar,
encerrar, escribir u ordenar, el ejercicio es interactivo y se corrige con **Check**. Las actividades
con grabación del libro la reproducen desde las carpetas de Drive de la clase. Cada palabra y oración
tiene además voz de ElevenLabs y grabadora para compararse.

Además: el **Stress Lab** (escribís cualquier palabra u oración y ves su patrón, ●○○) y un **drill**
de 10 palabras al azar de las hojas de trabajo.

Los resultados de cada hoja terminada llegan a la planilla de Google del docente.

## Puesta en marcha (docente)

### 1. El Google Apps Script (una vez)

Es un script **nuevo**, distinto del de Connected Speech, con su **propia API key de ElevenLabs**.

1. Creá una planilla nueva (sheets.new) → **Extensiones → Apps Script**.
2. Borrá lo que haya, pegá todo [`google-apps-script/Code.gs`](google-apps-script/Code.gs) y guardá.
   Si el editor no te deja pegar todo junto, pegá las partes de
   [`google-apps-script/partes/`](google-apps-script/partes/) en orden, cada una en su archivo.
3. Elegí la función **setup** → **▶ Ejecutar** → aceptá los permisos.
4. Recargá la planilla → menú **Stress Lab → Guardar API key de ElevenLabs** → pegá la key.
   **La key se pega solo ahí.** Queda guardada en el script; nunca en la página ni en el repositorio.
5. **Implementar → Nueva implementación → Aplicación web** · Ejecutar como: **Yo** ·
   Quién tiene acceso: **Cualquier persona** → copiá la URL que termina en `/exec`.
6. En la página: **Settings** → pegá la URL → **Test connection** → **Save**.
   El **Student link** que aparece ahí abre la página ya conectada para los alumnos.

Si cambiás el código: Implementar → Administrar implementaciones → ✏ → **Nueva versión**. La URL no cambia.

Menú **Stress Lab** de la planilla:

- **Estado de ElevenLabs**: caracteres usados hoy y créditos del plan. El límite diario de caracteres
  nuevos es 20 000; se cambia con la propiedad del script `ELEVENLABS_DAILY_LIMIT`.
- **Listar los audios del libro**: escribe en la hoja «Audios del libro» los audios de las carpetas.

### 2. Los audios del libro

El script lista y entrega **solo** los audios de estas carpetas de Drive (y sus subcarpetas):

- Chapter 6 Stress and Chapter 7 Stress (Advanced): `1cXgDywfAPi7-SQblFlSuQC2KphK33eUt`
- Word Stress Practices: `1SmSKUtgjUDvmMc6gW1h8Yh_qwjmABo_C`

Cada actividad encuentra su archivo por el nombre:

- **Accurate English**: la página y la actividad, por ejemplo `15_chapter 6_Stress_table 6-1_page 63.mp3`.
- **Pronunciation in Use**: el código del track, por ejemplo `B42`.

Si dos audios de una misma página no dicen cuál es cuál, se toman en el orden de sus números.

Para comprobarlo: **Settings → Book recordings → Check the recordings** muestra el archivo de cada
actividad y los que faltan. Para usar otras carpetas, agregá la propiedad del script
`BOOK_FOLDER_IDS` con los IDs separados por comas.

### 3. GitHub Pages

En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
No hace falta compilar nada.

## Desarrollo

```bash
npm start          # http://localhost:8080
npm test           # pruebas: datos, corrección, audios del libro y Apps Script
node scripts/split-gs.mjs   # después de cambiar Code.gs (regenera partes/)
```

- `js/worksheets.js` — todas las actividades, en el orden y con las páginas de los libros.
- `js/words.js` y `lexicon.json` — sílabas y acento (CMU Pronouncing Dictionary, inglés americano),
  generados con `npm run words` (requiere `npm install --no-save cmu-pronouncing-dictionary@3 wordlist-english@1`).
  Las correcciones van en `scripts/syllables.json`. Ahí está el acento que da el libro cuando el diccionario
  difiere (thirteen, refugee, overcome…).
- `js/views/sheet.js` — cómo se muestra y se corrige cada tipo de actividad.
- `js/book.js` — qué audio del libro corresponde a cada actividad.
- `google-apps-script/Code.gs` — resultados, voces de ElevenLabs y audios del libro.

La página comparte el dominio github.io con Connected Speech Lab, pero guarda su configuración aparte
(claves `st.*`), así que cada una usa su propio script.
