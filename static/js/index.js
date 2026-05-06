window.HELP_IMPROVE_VIDEOJS = false;

var INTERP_BASE = "./static/interpolation/stacked";
var NUM_INTERP_FRAMES = 240;

var interp_images = [];
function preloadInterpolationImages() {
  for (var i = 0; i < NUM_INTERP_FRAMES; i++) {
    var path = INTERP_BASE + '/' + String(i).padStart(6, '0') + '.jpg';
    interp_images[i] = new Image();
    interp_images[i].src = path;
  }
}

function setInterpolationImage(i) {
  var image = interp_images[i];
  image.ondragstart = function() { return false; };
  image.oncontextmenu = function() { return false; };
  $('#interpolation-image-wrapper').empty().append(image);
}

function initVideoCompare() {
  var root = document.querySelector('[data-compare-slider]');
  if (!root) return;

  var range = root.querySelector('input[type="range"]');
  var base = root.querySelector('.hui-compare__video--base');
  var top = root.querySelector('.hui-compare__video--top');
  var stage = root.querySelector('.hui-compare__stage');
  var handle = root.querySelector('.hui-compare__handle');
  if (!range || !base || !top || !stage || !handle) return;

  function setReveal(v) {
    // v in [0..100] where 0 shows only base, 100 shows only annotated (top)
    var pct = Math.max(0, Math.min(100, Number(v)));
    top.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
    handle.style.left = pct + '%';
    range.value = String(pct);
  }

  // Keep the two videos aligned in time.
  function syncFromBase() {
    if (!isFinite(base.currentTime) || !isFinite(top.currentTime)) return;
    if (Math.abs(top.currentTime - base.currentTime) > 0.06) {
      top.currentTime = base.currentTime;
    }
  }

  var rafId = null;
  function startRafSync() {
    if (rafId != null) return;
    var tick = function() {
      syncFromBase();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
  function stopRafSync() {
    if (rafId == null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Wire slider.
  setReveal(range.value);
  range.addEventListener('input', function(e) {
    setReveal(e.target.value);
  });

  function eventToPercent(e) {
    var rect = stage.getBoundingClientRect();
    var clientX = e.clientX;
    if (e.touches && e.touches.length) clientX = e.touches[0].clientX;
    var x = clientX - rect.left;
    var pct = (x / rect.width) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  var dragging = false;
  function startDrag(e) {
    dragging = true;
    if (handle.setPointerCapture && e.pointerId != null) {
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    }
    setReveal(eventToPercent(e));
    e.preventDefault();
  }
  function moveDrag(e) {
    if (!dragging) return;
    setReveal(eventToPercent(e));
    e.preventDefault();
  }
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    if (handle.releasePointerCapture && e.pointerId != null) {
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    e.preventDefault();
  }

  // Drag handle (pointer events), and allow click/drag anywhere on stage.
  handle.addEventListener('pointerdown', startDrag);
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointerdown', function(e) {
    // Don't fight with click-to-toggle playback when user is dragging the handle.
    startDrag(e);
  });

  // Autoplay once both can play; fall back gracefully if blocked.
  function tryAutoplay() {
    syncFromBase();
    var p1 = base.play();
    var p2 = top.play();
    if (p1 && typeof p1.catch === 'function') p1.catch(function() {});
    if (p2 && typeof p2.catch === 'function') p2.catch(function() {});
  }

  base.addEventListener('play', function() { try { top.play(); } catch (e) {} startRafSync(); });
  base.addEventListener('pause', function() { try { top.pause(); } catch (e) {} stopRafSync(); });
  base.addEventListener('seeking', function() { syncFromBase(); });
  base.addEventListener('seeked', function() { syncFromBase(); });
  base.addEventListener('timeupdate', function() { syncFromBase(); });
  base.addEventListener('loadedmetadata', function() {
    // Ensure both start from the same point.
    top.currentTime = base.currentTime || 0;
  });
  top.addEventListener('loadedmetadata', function() {
    syncFromBase();
  });

  // Click on the stage toggles play/pause (useful on desktop).
  // Intentionally no click-to-toggle here: clicks often follow drags and can
  // accidentally pause videos, which feels like a freeze.

  // Kick off.
  tryAutoplay();
  startRafSync();
}

function initVideoCompareMulti() {
  var root = document.querySelector('[data-compare-multi]');
  if (!root) return;

  var stage = root.querySelector('.hui-compare__stage');
  var base = root.querySelector('.hui-compare__video--base');
  var vitpose = root.querySelector('.hui-compare__video--vitpose');
  var sapiens = root.querySelector('.hui-compare__video--sapiens');
  var masks = root.querySelector('.hui-compare__video--masks');
  var handles = Array.prototype.slice.call(root.querySelectorAll('.hui-compare__handle'));
  if (!stage || !base || !vitpose || !sapiens || !masks || handles.length !== 3) return;

  var ranges = Array.prototype.slice.call(root.querySelectorAll('input[type=\"range\"]'));
  // Ranges are hidden but kept for accessibility; tolerate if missing.
  if (ranges.length < 3) ranges = [null, null, null];

  var p = [25, 50, 75]; // boundaries in percent
  var draggingIndex = null; // 0..2

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function sortedClamp() {
    p[0] = clamp(p[0], 0, p[1] - 0.5);
    p[1] = clamp(p[1], p[0] + 0.5, p[2] - 0.5);
    p[2] = clamp(p[2], p[1] + 0.5, 100);
  }

  function apply() {
    sortedClamp();

    // Segment mapping:
    // base:    [0 .. p0]
    // vitpose: [p0 .. p1]
    // sapiens: [p1 .. p2]
    // masks:   [p2 .. 100]
    base.style.clipPath = 'inset(0 ' + (100 - p[0]) + '% 0 0)';
    vitpose.style.clipPath = 'inset(0 ' + (100 - p[1]) + '% 0 ' + p[0] + '%)';
    sapiens.style.clipPath = 'inset(0 ' + (100 - p[2]) + '% 0 ' + p[1] + '%)';
    masks.style.clipPath = 'inset(0 0 0 ' + p[2] + '%)';

    handles[0].style.left = p[0] + '%';
    handles[1].style.left = p[1] + '%';
    handles[2].style.left = p[2] + '%';

    if (ranges[0]) ranges[0].value = String(p[0]);
    if (ranges[1]) ranges[1].value = String(p[1]);
    if (ranges[2]) ranges[2].value = String(p[2]);
  }

  function eventToPercent(e) {
    var rect = stage.getBoundingClientRect();
    var clientX = e.clientX;
    if (e.touches && e.touches.length) clientX = e.touches[0].clientX;
    var x = clientX - rect.left;
    return clamp((x / rect.width) * 100, 0, 100);
  }

  function pickNearestHandle(pct) {
    var best = 0;
    var bestDist = Math.abs(p[0] - pct);
    for (var i = 1; i < 3; i++) {
      var d = Math.abs(p[i] - pct);
      if (d < bestDist) { best = i; bestDist = d; }
    }
    return best;
  }

  function setBoundary(i, pct) {
    p[i] = pct;
    apply();
  }

  // Keep the videos aligned in time.
  function syncFromBase() {
    var t = base.currentTime;
    if (!isFinite(t)) return;
    var vids = [vitpose, sapiens, masks];
    for (var i = 0; i < vids.length; i++) {
      if (!isFinite(vids[i].currentTime)) continue;
      if (Math.abs(vids[i].currentTime - t) > 0.06) vids[i].currentTime = t;
    }
  }

  var rafId = null;
  function startRafSync() {
    if (rafId != null) return;
    var tick = function() {
      syncFromBase();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
  function stopRafSync() {
    if (rafId == null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  function tryAutoplay() {
    syncFromBase();
    var vids = [base, vitpose, sapiens, masks];
    for (var i = 0; i < vids.length; i++) {
      var pr = vids[i].play();
      if (pr && typeof pr.catch === 'function') pr.catch(function() {});
    }
  }

  function startDrag(e, idx) {
    draggingIndex = idx;
    if (handles[idx].setPointerCapture && e.pointerId != null) {
      try { handles[idx].setPointerCapture(e.pointerId); } catch (_) {}
    }
    setBoundary(idx, eventToPercent(e));
    e.preventDefault();
  }
  function moveDrag(e) {
    if (draggingIndex == null) return;
    setBoundary(draggingIndex, eventToPercent(e));
    e.preventDefault();
  }
  function endDrag(e) {
    if (draggingIndex == null) return;
    var idx = draggingIndex;
    draggingIndex = null;
    if (handles[idx].releasePointerCapture && e.pointerId != null) {
      try { handles[idx].releasePointerCapture(e.pointerId); } catch (_) {}
    }
    e.preventDefault();
  }

  // Handle pointer events on each bar.
  handles.forEach(function(h, idx) {
    h.addEventListener('pointerdown', function(e) { startDrag(e, idx); });
  });
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag);

  // Clicking/dragging on the stage moves the nearest handle.
  stage.addEventListener('pointerdown', function(e) {
    var pct = eventToPercent(e);
    var idx = pickNearestHandle(pct);
    startDrag(e, idx);
  });

  // Intentionally no click-to-toggle: a click can be synthesized after drag and
  // would pause videos, which looks like a freeze.

  base.addEventListener('play', function() { tryAutoplay(); startRafSync(); });
  base.addEventListener('pause', function() {
    try { vitpose.pause(); sapiens.pause(); masks.pause(); } catch (_) {}
    stopRafSync();
  });
  base.addEventListener('seeking', syncFromBase);
  base.addEventListener('seeked', syncFromBase);
  base.addEventListener('timeupdate', syncFromBase);
  base.addEventListener('loadedmetadata', function() {
    vitpose.currentTime = base.currentTime || 0;
    sapiens.currentTime = base.currentTime || 0;
    masks.currentTime = base.currentTime || 0;
  });

  // Initialize boundaries from hidden ranges if present.
  for (var i = 0; i < 3; i++) {
    if (ranges[i]) {
      var v = Number(ranges[i].value);
      if (isFinite(v)) p[i] = v;
    }
  }
  apply();
  tryAutoplay();
  startRafSync();
}


$(document).ready(function() {
    // Check for click events on the navbar burger icon
    $(".navbar-burger").click(function() {
      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      $(".navbar-burger").toggleClass("is-active");
      $(".navbar-menu").toggleClass("is-active");

    });

    var options = {
			slidesToScroll: 1,
			slidesToShow: 3,
			loop: true,
			infinite: true,
			autoplay: false,
			autoplaySpeed: 3000,
    }

		// Initialize all div with carousel class
    var carousels = bulmaCarousel.attach('.carousel', options);

    // Loop on each carousel initialized
    for(var i = 0; i < carousels.length; i++) {
    	// Add listener to  event
    	carousels[i].on('before:show', state => {
    		console.log(state);
    	});
    }

    // Access to bulmaCarousel instance of an element
    var element = document.querySelector('#my-element');
    if (element && element.bulmaCarousel) {
    	// bulmaCarousel instance is available as element.bulmaCarousel
    	element.bulmaCarousel.on('before-show', function(state) {
    		console.log(state);
    	});
    }

    /*var player = document.getElementById('interpolation-video');
    player.addEventListener('loadedmetadata', function() {
      $('#interpolation-slider').on('input', function(event) {
        console.log(this.value, player.duration);
        player.currentTime = player.duration / 100 * this.value;
      })
    }, false);*/
    preloadInterpolationImages();

    $('#interpolation-slider').on('input', function(event) {
      setInterpolationImage(this.value);
    });
    setInterpolationImage(0);
    $('#interpolation-slider').prop('max', NUM_INTERP_FRAMES - 1);

    bulmaSlider.attach();

    initVideoCompare();
    initVideoCompareMulti();
})
