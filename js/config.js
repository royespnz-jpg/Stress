// Site-wide defaults. The Stress Lab Google Apps Script web app
// (google-apps-script/Code.gs) collects results, plays the book recordings from
// the teacher's Drive and generates ElevenLabs audio without exposing the API
// key. Visitors can change it in Settings; a student link (?sheet=…) also sets it.
export const DEFAULT_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzcG7NcKxMGTD_C0T1zOaT-gpzzh-6scqPz8oj4-zN3ArYR4-zsVHf-z2iCINpXo7RXVw/exec';

// Earlier defaults: browsers that saved one of these move to the current URL.
export const OLD_SCRIPT_URLS = [];
