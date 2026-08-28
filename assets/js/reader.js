/**
 * reader.js
 * ---------------------------------------------------------------------------
 * Drives reader.html. Reads two query-string params:
 *   ?book=books/43LUKMMC.sfm   (path from books.json, required)
 *   &c=1                        (chapter number, optional, defaults to 1)
 *
 * index.html links here as, e.g.:
 *   reader.html?book=books/43LUKMMC.sfm&name=ലൂക്കൊസ്
 *
 * Nothing here is book-specific — the same page + script works for every
 * NT book once its .sfm file and a books.json entry exist.
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const bookPath = params.get('book');
  const bookLabel = params.get('name') || '';
  let chapterNum = parseInt(params.get('c'), 10) || 1;

  const contentEl = document.getElementById('content');
  const subtitleEl = document.getElementById('bookSubtitle');
  const chapterSelect = document.getElementById('chapterSelect');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  if (bookLabel) subtitleEl.textContent = bookLabel;

  if (!bookPath) {
    contentEl.innerHTML = '<p class="error-box">പുസ്തകം കണ്ടെത്താനായില്ല. ദയവായി പുസ്തകങ്ങളുടെ പട്ടികയിലേക്ക് മടങ്ങുക.</p>';
  } else {
    fetch(bookPath)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(raw => {
        const parsed = USFM.parse(raw);
        render(parsed);
      })
      .catch(err => {
        contentEl.innerHTML =
          '<p class="error-box">ഫയൽ ലഭ്യമല്ല (' + escapeHtml(String(err.message)) + ').<br>' +
          'പാത പരിശോധിക്കുക: <code>' + escapeHtml(bookPath) + '</code></p>';
      });
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render(parsed) {
    const { meta, introHtml, chapters } = parsed;
    const bookTitle = meta.h || meta.toc2 || meta.mt1 || bookLabel || '';
    subtitleEl.textContent = bookTitle;

    // Populate the chapter dropdown once.
    chapterSelect.innerHTML = chapters
      .map(ch => `<option value="${ch.number}">അധ്യായം ${ch.number}</option>`)
      .join('');

    if (chapterNum < 1 || chapterNum > chapters.length) chapterNum = 1;
    chapterSelect.value = String(chapterNum);

    chapterSelect.addEventListener('change', () => {
      goToChapter(parseInt(chapterSelect.value, 10));
    });
    prevBtn.addEventListener('click', () => goToChapter(chapterNum - 1));
    nextBtn.addEventListener('click', () => goToChapter(chapterNum + 1));

    function goToChapter(n) {
      if (n < 1 || n > chapters.length) return;
      chapterNum = n;
      chapterSelect.value = String(n);
      const url = new URL(window.location.href);
      url.searchParams.set('c', String(n));
      history.replaceState(null, '', url);
      drawChapter();
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    }

    function drawChapter() {
      const ch = chapters[chapterNum - 1];
      let html = '';

      // Show book intro / front matter only above chapter 1.
      if (chapterNum === 1 && introHtml) {
        html += `<details class="intro-box"><summary>ആമുഖം</summary>${introHtml}</details>`;
      }

      html += `<h2 class="book-title">${bookTitle}</h2>`;
      html += `<p class="chapter-number">അധ്യായം ${ch.number}</p>`;
      html += ch.html;

      contentEl.innerHTML = html;
      prevBtn.disabled = chapterNum <= 1;
      nextBtn.disabled = chapterNum >= chapters.length;
    }

    drawChapter();
  }
})();
