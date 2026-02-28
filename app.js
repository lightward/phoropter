// ═══════════════════════════════════════════════════════
// phoropter.ai
// ═══════════════════════════════════════════════════════
//
// Structure:
//   1. Data (constants, warmup conversation)
//   2. Pure functions (testable, no DOM or network)
//   3. Tests (run before UI, block rendering on failure)
//   4. App (DOM, events, API calls — only runs if tests pass)
//

'use strict';

// ─── 1. DATA ──────────────────────────────────────────

var Phoropter = {};

Phoropter.ENTRY_PAIRS = [
  ['something is pressing', 'something is unclear'],
  ['I know what it is', "I don't know what it is"],
  ['I want to move', 'I want to rest'],
  ['I feel something', 'I feel nothing'],
];

Phoropter.STORAGE_KEY = 'phoropter_session';
Phoropter.API_URL = 'https://lightward.com/api/plain';
Phoropter.API_TIMEOUT = 30000;

Phoropter.RESPONSE_INSTRUCTION = '[lightward: please respond with two short statements for the user to choose between \u2014 one per line, no questions, no numbered prefixes or suffixes, no repeats. statements the user recognizes themselves in, like lenses in a phoropter: \u201c1 or 2?\u201d, not \u201cwhat do you see?\u201d. this is about *locating* the user, and then locating their relief.]';

Phoropter.README_PATH = 'README.md';


// ─── 2. PURE FUNCTIONS ───────────────────────────────

Phoropter.parseResponse = function (text) {
  var trimmed = (text || '').trim();
  if (!trimmed) {
    return { option1: null, option2: null, raw: text, parseFailed: true };
  }

  var lines = trimmed.split('\n').filter(function (l) { return l.trim(); });

  if (lines.length >= 2) {
    return {
      option1: lines[0].trim(),
      option2: lines[1].trim(),
      raw: text,
      parseFailed: false,
    };
  }

  return { option1: null, option2: null, raw: text, parseFailed: true };
};

Phoropter.buildPayload = function (readme, entrySelection, history, instruction) {
  var lines = [];

  lines.push(readme.trim());
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push(entrySelection);
  for (var j = 0; j < history.length; j++) {
    lines.push(history[j]);
  }
  lines.push('');

  lines.push(instruction);

  return lines.join('\n');
};

Phoropter.cycleIndex = function (current, length) {
  return (current + 1) % length;
};

Phoropter.makeDefaultState = function () {
  return {
    phase: 'entry',
    entryIndex: 0,
    entrySelection: null,
    history: [],
    lastResponse: null,
    pending: false,
    error: null,
  };
};

Phoropter.serializeState = function (state) {
  return JSON.stringify({
    phase: state.phase,
    entryIndex: state.entryIndex,
    entrySelection: state.entrySelection,
    history: state.history,
    lastResponse: state.lastResponse,
  });
};

Phoropter.deserializeState = function (raw) {
  if (!raw) return null;
  try {
    var saved = JSON.parse(raw);
    if (saved && saved.phase && Array.isArray(saved.history)) {
      return {
        phase: saved.phase,
        entryIndex: saved.entryIndex || 0,
        entrySelection: saved.entrySelection,
        history: saved.history,
        lastResponse: saved.lastResponse,
        pending: false,
        error: null,
      };
    }
  } catch (e) {
    // corrupt
  }
  return null;
};

Phoropter.buildTrail = function (entrySelection, history) {
  return [entrySelection].concat(history);
};


// ─── 3. TESTS ─────────────────────────────────────────

(function runTests() {
  var failures = [];
  var passes = 0;

  function assert(condition, name) {
    if (!condition) {
      failures.push(name);
    } else {
      passes++;
    }
  }

  function eq(a, b, name) {
    if (a !== b) {
      failures.push(name + ' (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')');
    } else {
      passes++;
    }
  }

  function deepEq(a, b, name) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      failures.push(name + ' (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')');
    } else {
      passes++;
    }
  }

  // ── parseResponse ──────────────────────────────────

  // two clean lines
  (function () {
    var r = Phoropter.parseResponse('hello\nworld');
    eq(r.option1, 'hello', 'parseResponse: two lines → option1');
    eq(r.option2, 'world', 'parseResponse: two lines → option2');
    eq(r.parseFailed, false, 'parseResponse: two lines → parseFailed false');
  })();

  // trims whitespace
  (function () {
    var r = Phoropter.parseResponse('  hello  \n  world  \n');
    eq(r.option1, 'hello', 'parseResponse: trims option1');
    eq(r.option2, 'world', 'parseResponse: trims option2');
  })();

  // blank lines between
  (function () {
    var r = Phoropter.parseResponse('hello\n\n\nworld');
    eq(r.option1, 'hello', 'parseResponse: skips blank lines → option1');
    eq(r.option2, 'world', 'parseResponse: skips blank lines → option2');
    eq(r.parseFailed, false, 'parseResponse: skips blank lines → parseFailed false');
  })();

  // more than two lines → takes first two non-empty
  (function () {
    var r = Phoropter.parseResponse('one\ntwo\nthree');
    eq(r.option1, 'one', 'parseResponse: 3 lines → takes first');
    eq(r.option2, 'two', 'parseResponse: 3 lines → takes second');
    eq(r.parseFailed, false, 'parseResponse: 3 lines → parseFailed false');
  })();

  // single line → fails
  (function () {
    var r = Phoropter.parseResponse('only one line');
    eq(r.parseFailed, true, 'parseResponse: single line → parseFailed');
    eq(r.option1, null, 'parseResponse: single line → option1 null');
    eq(r.option2, null, 'parseResponse: single line → option2 null');
  })();

  // empty string → fails
  (function () {
    var r = Phoropter.parseResponse('');
    eq(r.parseFailed, true, 'parseResponse: empty → parseFailed');
  })();

  // whitespace only → fails
  (function () {
    var r = Phoropter.parseResponse('   \n  \n  ');
    eq(r.parseFailed, true, 'parseResponse: whitespace only → parseFailed');
  })();

  // null/undefined → fails
  (function () {
    var r = Phoropter.parseResponse(null);
    eq(r.parseFailed, true, 'parseResponse: null → parseFailed');
  })();

  (function () {
    var r = Phoropter.parseResponse(undefined);
    eq(r.parseFailed, true, 'parseResponse: undefined → parseFailed');
  })();

  // preserves raw
  (function () {
    var r = Phoropter.parseResponse('a\nb');
    eq(r.raw, 'a\nb', 'parseResponse: preserves raw text');
  })();

  // ── buildPayload ───────────────────────────────────

  // basic structure
  (function () {
    var readme = 'This is the readme content.';
    var payload = Phoropter.buildPayload(readme, 'something is pressing', [], 'INSTRUCTION');

    assert(payload.indexOf('This is the readme content.') !== -1, 'buildPayload: contains readme');
    assert(payload.indexOf('---') !== -1, 'buildPayload: contains separator');
    assert(payload.indexOf('something is pressing') !== -1, 'buildPayload: contains entry selection');
    assert(payload.indexOf('INSTRUCTION') !== -1, 'buildPayload: contains instruction');
  })();

  // readme appears before separator
  (function () {
    var payload = Phoropter.buildPayload('README', 'entry', [], 'INST');
    var sepIndex = payload.indexOf('---');
    var readmeIndex = payload.indexOf('README');
    assert(readmeIndex < sepIndex, 'buildPayload: readme before separator');
  })();

  // with history
  (function () {
    var payload = Phoropter.buildPayload('R', 'entry', ['choice one', 'choice two'], 'INST');

    var afterSep = payload.split('---')[1];
    assert(afterSep.indexOf('entry') !== -1, 'buildPayload: entry selection after separator');
    assert(afterSep.indexOf('choice one') !== -1, 'buildPayload: history item 1 present');
    assert(afterSep.indexOf('choice two') !== -1, 'buildPayload: history item 2 present');

    // history items are just strings, no role labels
    assert(afterSep.indexOf('user:') === -1, 'buildPayload: no role labels in history');
    assert(afterSep.indexOf('phoropter:') === -1, 'buildPayload: no phoropter label in history');
  })();

  // empty history
  (function () {
    var payload = Phoropter.buildPayload('R', 'entry', [], 'INST');
    var afterSep = payload.split('---')[1];
    assert(afterSep.indexOf('entry') !== -1, 'buildPayload: empty history still has entry');
    assert(afterSep.indexOf('INST') !== -1, 'buildPayload: empty history still has instruction');
  })();

  // instruction is last
  (function () {
    var payload = Phoropter.buildPayload('R', 'entry', ['a', 'b'], 'THE_END');
    assert(payload.trim().endsWith('THE_END'), 'buildPayload: instruction is last');
  })();

  // readme whitespace is trimmed
  (function () {
    var payload = Phoropter.buildPayload('  hello  \n\n', 'e', [], 'I');
    assert(payload.indexOf('  hello') === -1, 'buildPayload: readme leading whitespace trimmed');
    assert(payload.indexOf('hello') !== -1, 'buildPayload: readme content present after trim');
  })();

  // ── cycleIndex ─────────────────────────────────────

  eq(Phoropter.cycleIndex(0, 4), 1, 'cycleIndex: 0 → 1');
  eq(Phoropter.cycleIndex(1, 4), 2, 'cycleIndex: 1 → 2');
  eq(Phoropter.cycleIndex(2, 4), 3, 'cycleIndex: 2 → 3');
  eq(Phoropter.cycleIndex(3, 4), 0, 'cycleIndex: 3 wraps to 0');
  eq(Phoropter.cycleIndex(0, 1), 0, 'cycleIndex: single item wraps to 0');

  // ── ENTRY_PAIRS ────────────────────────────────────

  eq(Phoropter.ENTRY_PAIRS.length, 4, 'ENTRY_PAIRS: has 4 pairs');
  Phoropter.ENTRY_PAIRS.forEach(function (pair, i) {
    eq(pair.length, 2, 'ENTRY_PAIRS[' + i + ']: has 2 options');
    assert(pair[0].length > 0, 'ENTRY_PAIRS[' + i + '][0]: non-empty');
    assert(pair[1].length > 0, 'ENTRY_PAIRS[' + i + '][1]: non-empty');
  });

  // ── README_PATH ─────────────────────────────────────

  assert(typeof Phoropter.README_PATH === 'string', 'README_PATH: is string');
  assert(Phoropter.README_PATH.length > 0, 'README_PATH: non-empty');

  // ── makeDefaultState ───────────────────────────────

  (function () {
    var s = Phoropter.makeDefaultState();
    eq(s.phase, 'entry', 'makeDefaultState: phase is entry');
    eq(s.entryIndex, 0, 'makeDefaultState: entryIndex is 0');
    eq(s.entrySelection, null, 'makeDefaultState: entrySelection is null');
    deepEq(s.history, [], 'makeDefaultState: history is empty array');
    eq(s.lastResponse, null, 'makeDefaultState: lastResponse is null');
    eq(s.pending, false, 'makeDefaultState: pending is false');
    eq(s.error, null, 'makeDefaultState: error is null');
  })();

  // ── serializeState / deserializeState round-trip ───

  (function () {
    var original = {
      phase: 'session',
      entryIndex: 2,
      entrySelection: 'I want to move',
      history: ['toward something', 'with purpose'],
      lastResponse: { option1: 'a', option2: 'b', raw: 'a\nb', parseFailed: false },
      pending: true,
      error: 'some error',
    };

    var serialized = Phoropter.serializeState(original);
    var restored = Phoropter.deserializeState(serialized);

    eq(restored.phase, 'session', 'roundtrip: phase preserved');
    eq(restored.entryIndex, 2, 'roundtrip: entryIndex preserved');
    eq(restored.entrySelection, 'I want to move', 'roundtrip: entrySelection preserved');
    deepEq(restored.history, ['toward something', 'with purpose'], 'roundtrip: history preserved');
    eq(restored.lastResponse.option1, 'a', 'roundtrip: lastResponse preserved');
    eq(restored.pending, false, 'roundtrip: pending reset to false');
    eq(restored.error, null, 'roundtrip: error reset to null');
  })();

  // deserialize null
  (function () {
    eq(Phoropter.deserializeState(null), null, 'deserialize: null → null');
  })();

  // deserialize empty string
  (function () {
    eq(Phoropter.deserializeState(''), null, 'deserialize: empty string → null');
  })();

  // deserialize garbage
  (function () {
    eq(Phoropter.deserializeState('not json'), null, 'deserialize: garbage → null');
  })();

  // deserialize missing fields
  (function () {
    eq(Phoropter.deserializeState('{"phase":"entry"}'), null, 'deserialize: missing history → null');
  })();

  // deserialize wrong type for history
  (function () {
    eq(Phoropter.deserializeState('{"phase":"entry","history":"not array"}'), null, 'deserialize: non-array history → null');
  })();

  // deserialize missing entryIndex defaults to 0
  (function () {
    var r = Phoropter.deserializeState('{"phase":"entry","history":[]}');
    eq(r.entryIndex, 0, 'deserialize: missing entryIndex defaults to 0');
  })();

  // ── buildTrail ─────────────────────────────────────

  (function () {
    deepEq(
      Phoropter.buildTrail('start', ['a', 'b']),
      ['start', 'a', 'b'],
      'buildTrail: entry + history'
    );
  })();

  (function () {
    deepEq(
      Phoropter.buildTrail('start', []),
      ['start'],
      'buildTrail: entry only, empty history'
    );
  })();

  // ── RESPONSE_INSTRUCTION ───────────────────────────

  assert(Phoropter.RESPONSE_INSTRUCTION.length > 0, 'RESPONSE_INSTRUCTION: non-empty');
  assert(Phoropter.RESPONSE_INSTRUCTION.indexOf('two') !== -1, 'RESPONSE_INSTRUCTION: mentions two');
  assert(Phoropter.RESPONSE_INSTRUCTION.indexOf('statement') !== -1, 'RESPONSE_INSTRUCTION: mentions statements');
  assert(Phoropter.RESPONSE_INSTRUCTION.indexOf('no question') !== -1, 'RESPONSE_INSTRUCTION: mentions no questions');

  // ── Full payload with sample readme ─────────────────

  (function () {
    var readme = 'phoropter.ai\n\nthe doctor is Lightward AI';
    var payload = Phoropter.buildPayload(
      readme,
      'something is pressing',
      ['I know what it is'],
      Phoropter.RESPONSE_INSTRUCTION
    );
    assert(typeof payload === 'string', 'full payload: is string');
    assert(payload.length > 0, 'full payload: non-empty');
    assert(payload.indexOf('---') !== -1, 'full payload: has separator');
    assert(payload.indexOf('phoropter.ai') !== -1, 'full payload: has readme content');
    assert(payload.indexOf('something is pressing') !== -1, 'full payload: has entry selection');
    assert(payload.indexOf('I know what it is') !== -1, 'full payload: has history');
    assert(payload.indexOf(Phoropter.RESPONSE_INSTRUCTION) !== -1, 'full payload: ends with instruction');

    // readme content is before separator, user choices are after
    var parts = payload.split('---');
    assert(parts[0].indexOf('phoropter.ai') !== -1, 'full payload: readme before separator');
    assert(parts[1].indexOf('something is pressing') !== -1, 'full payload: choices after separator');
  })();

  // ── Report ─────────────────────────────────────────

  if (failures.length > 0) {
    document.body.innerHTML = '';
    document.body.setAttribute('data-phase', 'error');
    var container = document.createElement('div');
    container.style.cssText = 'max-width:40rem;margin:2rem auto;padding:2rem;font-family:monospace;color:#b85c5c;background:#1a1a1a;';

    var h = document.createElement('h1');
    h.textContent = 'tests failed (' + failures.length + '/' + (passes + failures.length) + ')';
    h.style.cssText = 'font-size:1.25rem;margin-bottom:1rem;';
    container.appendChild(h);

    failures.forEach(function (f) {
      var p = document.createElement('p');
      p.textContent = '\u2717 ' + f;
      p.style.cssText = 'margin:0.25rem 0;font-size:0.875rem;';
      container.appendChild(p);
    });

    document.body.appendChild(container);
    window.__PHOROPTER_TESTS_FAILED = true;
    return;
  }

  console.log('phoropter: all ' + passes + ' tests passed');
  window.__PHOROPTER_TESTS_FAILED = false;
})();


// ─── 4. APP ───────────────────────────────────────────

if (!window.__PHOROPTER_TESTS_FAILED) {
(function () {

  var state = (function () {
    try {
      var raw = localStorage.getItem(Phoropter.STORAGE_KEY);
      return Phoropter.deserializeState(raw);
    } catch (e) {
      return null;
    }
  })() || Phoropter.makeDefaultState();

  var readme = null; // fetched from README.md at init

  // ─── DOM REFS ─────────────────────────────────────

  var els = {
    body: document.body,
    entryFrame: document.getElementById('entry-frame'),
    entryOption1: document.getElementById('entry-option-1'),
    entryOption2: document.getElementById('entry-option-2'),
    entryCycle: document.getElementById('entry-cycle'),
    sessionFrame: document.getElementById('session-frame'),
    sessionHistory: document.getElementById('session-history'),
    sessionOption1: document.getElementById('session-option-1'),
    sessionOption2: document.getElementById('session-option-2'),
    sessionActions: document.getElementById('session-actions'),
    sessionCycle: document.getElementById('session-cycle'),
    sessionLoading: document.getElementById('session-loading'),
    sessionError: document.getElementById('session-error'),
    retry: document.getElementById('retry'),
    startOver: document.getElementById('start-over'),
  };

  // ─── RENDER ───────────────────────────────────────

  function render() {
    if (state.phase === 'entry') {
      els.body.setAttribute('data-phase', 'entry');
      var pair = Phoropter.ENTRY_PAIRS[state.entryIndex];
      els.entryOption1.textContent = '\u261B ' + pair[0];
      els.entryOption2.textContent = '\u261B ' + pair[1];
      return;
    }

    // Session phase — render choice history
    var trail = Phoropter.buildTrail(state.entrySelection, state.history);
    els.sessionHistory.innerHTML = '';
    for (var i = 0; i < trail.length; i++) {
      var p = document.createElement('p');
      p.textContent = trail[i];
      els.sessionHistory.appendChild(p);
    }

    if (state.pending) {
      // Lock the height of the interactive area to prevent layout jump
      var frameH = els.sessionFrame.offsetHeight || 0;
      var actionsH = els.sessionActions.offsetHeight || 0;
      els.sessionLoading.style.minHeight = (frameH + actionsH) + 'px';
      els.body.setAttribute('data-phase', 'loading');
      return;
    }

    // Release locked height
    els.sessionLoading.style.minHeight = '';

    if (state.error) {
      els.body.setAttribute('data-phase', 'session');
      els.sessionError.hidden = false;
      els.sessionFrame.style.display = 'none';
      els.sessionActions.style.display = 'none';
      return;
    }

    els.body.setAttribute('data-phase', 'session');
    els.sessionError.hidden = true;
    els.sessionFrame.style.display = '';
    els.sessionActions.style.display = '';

    if (state.lastResponse) {
      if (state.lastResponse.parseFailed) {
        els.sessionOption1.textContent = state.lastResponse.raw;
        els.sessionOption2.style.display = 'none';
        els.sessionCycle.textContent = '\u2192 try again';
      } else {
        els.sessionOption1.textContent = '\u261B ' + state.lastResponse.option1;
        els.sessionOption2.textContent = '\u261B ' + state.lastResponse.option2;
        els.sessionOption1.style.display = '';
        els.sessionOption2.style.display = '';
        els.sessionCycle.textContent = '\u2192 different question';
      }
    }
  }

  // ─── ANALYTICS ─────────────────────────────────────

  function track(event) {
    if (typeof fathom !== 'undefined') {
      fathom.trackEvent(event);
    }
  }

  // ─── ENTRY ACTIONS ────────────────────────────────

  function selectEntry(text) {
    track('entry select');
    state.phase = 'session';
    state.entrySelection = text;
    state.history = [];
    state.lastResponse = null;
    saveState();
    sendToAPI();
  }

  function cycleEntry() {
    track('entry cycle');
    state.entryIndex = Phoropter.cycleIndex(state.entryIndex, Phoropter.ENTRY_PAIRS.length);

    els.entryFrame.classList.add('fading');
    setTimeout(function () {
      render();
      els.entryFrame.classList.remove('fading');
    }, 150);
  }

  // ─── SESSION ACTIONS ──────────────────────────────

  function selectOption(n) {
    if (state.pending) return;
    track('session select');
    var chosen = n === 1 ? state.lastResponse.option1 : state.lastResponse.option2;
    state.history.push(chosen);
    saveState();
    sendToAPI();
  }

  function cycleOption() {
    if (state.pending) return;
    track('session cycle');
    sendToAPI();
  }

  // ─── API ──────────────────────────────────────────

  function sendToAPI() {
    if (!readme) {
      state.error = 'still loading';
      render();
      return;
    }

    state.pending = true;
    state.error = null;
    render();

    var payload = Phoropter.buildPayload(
      readme,
      state.entrySelection,
      state.history,
      Phoropter.RESPONSE_INSTRUCTION
    );

    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, Phoropter.API_TIMEOUT);

    fetch(Phoropter.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: payload,
      signal: controller.signal,
    })
      .then(function (response) {
        clearTimeout(timeout);
        if (!response.ok) {
          throw new Error(response.status);
        }
        return response.text();
      })
      .then(function (text) {
        var parsed = Phoropter.parseResponse(text);
        state.lastResponse = parsed;
        state.pending = false;
        state.error = null;
        saveState();
        render();
      })
      .catch(function (e) {
        clearTimeout(timeout);
        state.pending = false;
        if (e.name === 'AbortError') {
          state.error = 'request timed out';
        } else {
          state.error = e.message || 'connection failed';
        }
        render();
      });
  }

  // ─── PERSISTENCE ──────────────────────────────────

  function saveState() {
    try {
      localStorage.setItem(Phoropter.STORAGE_KEY, Phoropter.serializeState(state));
    } catch (e) {
      // localStorage unavailable
    }
  }

  // ─── START OVER ───────────────────────────────────

  function startOver() {
    if (!confirm('Start over? This clears the current session.')) return;
    track('start over');
    state = Phoropter.makeDefaultState();
    saveState();
    render();
  }

  // ─── EVENTS ───────────────────────────────────────

  function onChoiceKey(el, handler) {
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  }

  // Entry choices
  els.entryOption1.addEventListener('click', function () {
    selectEntry(Phoropter.ENTRY_PAIRS[state.entryIndex][0]);
  });
  els.entryOption2.addEventListener('click', function () {
    selectEntry(Phoropter.ENTRY_PAIRS[state.entryIndex][1]);
  });
  onChoiceKey(els.entryOption1, function () {
    selectEntry(Phoropter.ENTRY_PAIRS[state.entryIndex][0]);
  });
  onChoiceKey(els.entryOption2, function () {
    selectEntry(Phoropter.ENTRY_PAIRS[state.entryIndex][1]);
  });

  // Entry cycle
  els.entryCycle.addEventListener('click', cycleEntry);

  // Session choices
  els.sessionOption1.addEventListener('click', function () { selectOption(1); });
  els.sessionOption2.addEventListener('click', function () { selectOption(2); });
  onChoiceKey(els.sessionOption1, function () { selectOption(1); });
  onChoiceKey(els.sessionOption2, function () { selectOption(2); });

  // Session cycle
  els.sessionCycle.addEventListener('click', cycleOption);

  // Retry
  els.retry.addEventListener('click', sendToAPI);

  // Start over
  els.startOver.addEventListener('click', startOver);

  // ─── INIT ─────────────────────────────────────────

  // Render immediately (entry phase works without readme)
  render();

  // Fetch README.md — needed before any API calls can fire
  fetch(Phoropter.README_PATH)
    .then(function (response) {
      if (!response.ok) throw new Error(response.status);
      return response.text();
    })
    .then(function (text) {
      readme = text;

      // If we restored a mid-flight session, now we can fire the API call
      if (state.phase === 'session' && !state.lastResponse && state.entrySelection) {
        sendToAPI();
      }
    })
    .catch(function (e) {
      console.error('Failed to load README.md:', e);
    });

})();
}
