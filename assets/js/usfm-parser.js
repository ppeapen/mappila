/**
 * usfm-parser.js
 * ---------------------------------------------------------------------------
 * A small, dependency-free parser that turns a raw USFM (.sfm) file into
 * simple JS objects that reader.html can render.
 *
 * It supports the markers actually found in the Mappila Malayalam files
 * today (id, ide, h, toc1-3, mt1, mt2, imt, ip, iot, io1, c, s, p, q1, q2,
 * li1, m, v, f/fr/fq/ft, xt) and *gracefully degrades* for markers it has
 * never seen: any unrecognised paragraph-style marker is rendered as a
 * plain paragraph, and any unrecognised inline marker (opened with
 * "\tag" and closed with "\tag*") is rendered as a plain <span>. So when
 * Matthew/Mark/John (or any other NT book) arrive with a marker this file
 * doesn't already know about, the text will still display -- just without
 * special styling -- instead of breaking.
 *
 * HOW TO EXTEND:
 *  - New paragraph-style marker (e.g. "\qc" centered poetry)?
 *      -> add it to PARAGRAPH_CLASSES below.
 *  - New inline character marker (e.g. "\wj" words of Jesus)?
 *      -> nothing to do here, it is handled generically (see INLINE
 *         handling in the tokenizer). Just add CSS for ".usfm-wj" in
 *         style.css if you want special styling; otherwise it still
 *         displays as plain text.
 *  - New footnote/cross-reference sub-marker (e.g. "\fv", "\xo")?
 *      -> add it to FOOTNOTE_SUBMARKERS so its text is folded into the
 *         footnote instead of leaking into the verse body.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  // Paragraph/poetry markers -> CSS class suffix (see style.css ".usfm-XXX").
  // Add new ones here as new books introduce them (e.g. "pi1", "qc", "qr").
  const PARAGRAPH_CLASSES = {
    p: 'p', m: 'm', nb: 'nb', pc: 'pc',
    q1: 'q1', q2: 'q2', q3: 'q2', q4: 'q2',
    li1: 'li1', li2: 'li1', li3: 'li1',
  };

  // Markers that open a footnote / cross-reference run.
  const FOOTNOTE_OPEN = new Set(['f', 'fe', 'fx']);
  const FOOTNOTE_CLOSE = new Set(['f*', 'fe*', 'fx*']);
  // Sub-markers that only ever appear *inside* a footnote and whose text
  // should be appended to the footnote body (not the verse text).
  const FOOTNOTE_SUBMARKERS = new Set(['fr', 'fq', 'fqa', 'fk', 'fl', 'fp', 'fv', 'fdc', 'ft']);

  // Markers describing the book title / introduction (front matter).
  const META_MARKERS = new Set(['id', 'ide', 'h', 'toc1', 'toc2', 'toc3', 'mt1', 'mt2', 'mt3']);
  const INTRO_MARKERS = new Set(['imt', 'imt1', 'imt2', 'ip', 'iot', 'io1', 'io2', 'is', 'is1']);

  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Tokenize raw USFM into a flat sequence of { marker, text } pairs.
   * `marker` is null for a (rare) leading chunk of text before the first tag.
   */
  function tokenize(raw) {
    const tokens = [];
    const re = /\\([A-Za-z0-9]+\*?)/g;
    let lastIndex = 0;
    let match;
    let lastMarker = null;

    while ((match = re.exec(raw)) !== null) {
      const chunk = raw.slice(lastIndex, match.index);
      if (lastMarker !== null || chunk.trim() !== '') {
        tokens.push({ marker: lastMarker, text: chunk.replace(/\s+/g, ' ').trim() });
      }
      lastMarker = match[1];
      lastIndex = re.lastIndex;
    }
    // Final trailing chunk after the last marker.
    tokens.push({ marker: lastMarker, text: raw.slice(lastIndex).replace(/\s+/g, ' ').trim() });

    return tokens;
  }

  /**
   * Parse raw USFM text into { meta, introHtml, chapters, chapterCount }.
   * `chapters` is an array indexed 0..n-1 with { number, html }.
   */
  function parseUSFM(raw) {
    raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const tokens = tokenize(raw);

    const meta = {};
    let introHtml = '';
    const chapters = [];

    let mode = 'meta'; // 'meta' -> 'intro' -> 'body'
    let currentChapter = null; // { number, blocks: [html strings] }
    let currentBuf = '';       // text currently being built for the open block
    let currentBlockTag = 'p';

    let insideFootnote = false;
    let footnoteBuf = '';
    let footnoteList = [];     // footnotes for the *current chapter*
    let footnoteCounter = 0;

    const inlineStack = [];    // generic open inline markers, e.g. ['nd']

    function activeBuf(text) {
      // Route plain text to wherever we currently are.
      if (insideFootnote) { footnoteBuf += text; return; }
      if (mode === 'intro') { introHtml += escapeHtml(text); return; }
      currentBuf += escapeHtml(text);
    }

    function flushBlock() {
      if (currentChapter && currentBuf.trim() !== '') {
        currentChapter.blocks.push(`<p class="usfm-${currentBlockTag}">${currentBuf}</p>`);
      }
      currentBuf = '';
    }

    function flushChapter() {
      flushBlock();
      if (currentChapter) {
        let html = currentChapter.blocks.join('\n');
        if (footnoteList.length) {
          html += '\n<ol class="footnotes">' +
            footnoteList.map(f => `<li id="${f.id}">${f.html}</li>`).join('') +
            '</ol>';
        }
        chapters.push({ number: currentChapter.number, html });
      }
      footnoteList = [];
      footnoteCounter = 0;
    }

    for (const { marker, text } of tokens) {
      if (marker === null) {
        activeBuf(text);
        continue;
      }

      // ---- footnote handling -------------------------------------------
      if (FOOTNOTE_OPEN.has(marker)) {
        insideFootnote = true;
        footnoteBuf = '';
        footnoteCounter += 1;
        const fid = `fn-${currentChapter ? currentChapter.number : 0}-${footnoteCounter}`;
        currentBuf += `<sup class="fn-ref" title="കുറിപ്പ് ${footnoteCounter}"><a href="#${fid}">[${footnoteCounter}]</a></sup>`;
        // `text` here is the footnote caller (e.g. "+"), not needed visually.
        continue;
      }
      if (FOOTNOTE_CLOSE.has(marker)) {
        insideFootnote = false;
        const fid = `fn-${currentChapter ? currentChapter.number : 0}-${footnoteCounter}`;
        footnoteList.push({ id: fid, html: footnoteBuf.trim() });
        footnoteBuf = '';
        activeBuf(text); // any text right after \f* still belongs to the verse
        continue;
      }
      if (insideFootnote && FOOTNOTE_SUBMARKERS.has(marker)) {
        // \fq (quoted words) gets a light italic treatment; others are plain.
        if (marker === 'fq' || marker === 'fqa') {
          footnoteBuf += `<i>${escapeHtml(text)}</i> `;
        } else {
          footnoteBuf += escapeHtml(text) + ' ';
        }
        continue;
      }

      // ---- front matter / book metadata ---------------------------------
      if (META_MARKERS.has(marker)) {
        meta[marker] = text;
        mode = 'meta';
        continue;
      }
      if (INTRO_MARKERS.has(marker)) {
        mode = 'intro';
        if (marker === 'ip' || marker === 'imt' || marker === 'imt1' || marker === 'imt2') {
          introHtml += `<p>${escapeHtml(text)}</p>`;
        } else if (marker === 'iot') {
          introHtml += `<h3>${escapeHtml(text)}</h3>`;
        } else if (marker === 'io1' || marker === 'io2') {
          introHtml += `<p class="usfm-li1">${escapeHtml(text)}</p>`;
        } else {
          introHtml += `<p>${escapeHtml(text)}</p>`;
        }
        continue;
      }

      // ---- chapter boundary ----------------------------------------------
      if (marker === 'c') {
        flushChapter();
        mode = 'body';
        currentChapter = { number: parseInt(text, 10) || (chapters.length + 1), blocks: [] };
        currentBuf = '';
        currentBlockTag = 'p';
        continue;
      }

      // ---- section headings ------------------------------------------------
      if (marker === 's' || marker === 's1' || marker === 's2' || marker === 'r') {
        flushBlock();
        if (currentChapter) {
          currentChapter.blocks.push(`<h3 class="section-heading">${escapeHtml(text)}</h3>`);
        }
        continue;
      }

      // ---- paragraph / poetry markers --------------------------------------
      if (Object.prototype.hasOwnProperty.call(PARAGRAPH_CLASSES, marker)) {
        flushBlock();
        currentBlockTag = PARAGRAPH_CLASSES[marker];
        if (text) currentBuf += escapeHtml(text);
        continue;
      }

      // ---- verse marker -----------------------------------------------------
      if (marker === 'v') {
        const spaceIdx = text.indexOf(' ');
        const num = spaceIdx === -1 ? text : text.slice(0, spaceIdx);
        const rest = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1);
        // The tokenizer trims whitespace off every token, so any trailing
        // space typed in the .sfm source at the end of a verse is lost
        // before we ever get here. Re-introduce the gap ourselves: put a
        // real space before every verse number except the first one in a
        // block (where a leading space would look wrong).
        if (currentBuf.trim() !== '') currentBuf += ' ';
        currentBuf += `<sup class="verse-num" id="v${currentChapter ? currentChapter.number : 0}-${num}">${num}</sup>`;
        currentBuf += escapeHtml(rest);
        continue;
      }

      // ---- generic inline formatting (\nd, \wj, \add, \xt, \bk, ...) ------
      if (marker.endsWith('*')) {
        const base = marker.slice(0, -1);
        const idx = inlineStack.lastIndexOf(base);
        if (idx !== -1) {
          inlineStack.splice(idx, 1);
          activeBuf(''); // no-op, keeps symmetry
          if (insideFootnote) footnoteBuf += '</span>'; else if (mode === 'intro') introHtml += '</span>'; else currentBuf += '</span>';
        }
        activeBuf(text);
        continue;
      }
      // Unknown/known inline opening marker: wrap in a span so the marker
      // family gets a stable CSS hook (".usfm-nd", ".usfm-wj", etc.) while
      // anything undocumented still just renders as plain text.
      inlineStack.push(marker);
      const openSpan = `<span class="usfm-${marker}">`;
      if (insideFootnote) footnoteBuf += openSpan; else if (mode === 'intro') introHtml += openSpan; else currentBuf += openSpan;
      activeBuf(text);
    }

    flushChapter();

    return { meta, introHtml, chapters };
  }

  global.USFM = { parse: parseUSFM };
})(window);
