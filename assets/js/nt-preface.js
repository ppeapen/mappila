/**
 * nt-preface.js
 * ---------------------------------------------------------------------------
 * Loads the New-Testament-wide preface (books/40MNTPRE.sfm) and renders it
 * inside the collapsible <details id="ntPreface"> box on index.html, above
 * the book list.
 *
 * Reuses the SAME parser reader.html uses (assets/js/usfm-parser.js), so
 * index.html must load usfm-parser.js before this file. This particular
 * .sfm file has no \c (chapter) markers, so USFM.parse() returns an empty
 * "chapters" array and everything (\iot, \ip, ...) ends up in "introHtml" --
 * exactly what we want to display here.
 *
 * TO CHANGE WHICH FILE THIS BOX SHOWS: edit PREFACE_FILE below.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var PREFACE_FILE = 'books/40MNTPRE.sfm';

  var box = document.getElementById('ntPreface');
  if (!box) return; // box not present on this page -- nothing to do

  var summary = box.querySelector('summary');
  var body = box.querySelector('.intro-box-body');

  fetch(PREFACE_FILE)
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function (raw) {
      var parsed = USFM.parse(raw);
      if (parsed.introTitle) summary.textContent = parsed.introTitle;
      body.innerHTML = parsed.introHtml || '<p class="error-box">ആമുഖം ലഭ്യമല്ല.</p>';
    })
    .catch(function (err) {
      body.innerHTML = '<p class="error-box">ആമുഖം ലോഡ് ചെയ്യാനായില്ല. (' +
        String(err.message || err) + ')</p>';
      console.error('NT preface load failed:', err);
    });
})();
