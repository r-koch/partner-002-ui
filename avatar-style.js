/* Avatar style shared JS (draft demo) — global default + per-card page-scoped swap.
Global: key 'avatarStyleGlobal' = 'pixar' | 'line' (set on the avatar page).
Per-card: viewer taps the avatar image -> that card flips for the life of the
PAGE only; reload/navigate resets every card to the global default (owner 2026-09-15).
The avatar itself is the switch (owner 2026-09-15) — no button.
Carousel-style dots under the avatar show current style (owner 2026-09-16).
On matches/stage pages the card navigates on click — the avatar swap calls
stopPropagation so it does NOT bubble to that navigation (owner 2026-09-16).
Usage:
  - <img class="cav" data-avatar-pixar="..png" data-avatar-line="..png"
        onclick="toggleCardAvatar(this, event)">
  - on page load, applyAvatarStyleGlobal() sets every card to the global default
*/
function avatarStyleGlobal() {
  try { return localStorage.getItem('avatarStyleGlobal') || 'pixar'; } catch (e) { return 'pixar'; }
}
function setAvatarStyleGlobal(style) {
  try { localStorage.setItem('avatarStyleGlobal', style); } catch (e) {}
}
function currentStyle(img) {
  return (img.getAttribute('data-avatar-line') &&
          img.getAttribute('src') === img.getAttribute('data-avatar-line'))
    ? 'line' : 'pixar';
}
function syncStyleDots(img) {
  var wrap = img.closest('.cavwrap');
  if (!wrap) return;
  var dots = wrap.querySelectorAll('.avatar-style-dot');
  if (dots.length === 0) {
    var d = document.createElement('div');
    d.className = 'avatar-style-dots';
    d.innerHTML = '<span class="avatar-style-dot" data-dot="pixar"></span>' +
                  '<span class="avatar-style-dot" data-dot="line"></span>';
    wrap.appendChild(d);
    dots = d.querySelectorAll('.avatar-style-dot');
  }
  var cur = currentStyle(img);
  dots.forEach(function (dot) {
    dot.classList.toggle('on', dot.getAttribute('data-dot') === cur);
  });
}
function applyAvatarStyleGlobal() {
  var style = avatarStyleGlobal();
  document.querySelectorAll('[data-avatar-pixar]').forEach(function (img) {
    img.src = (style === 'line') ? img.getAttribute('data-avatar-line')
                                 : img.getAttribute('data-avatar-pixar');
    img._style = style;
    syncStyleDots(img);
  });
  // keep any segmented control on this page in sync
  document.querySelectorAll('.avatar-style-seg [data-style]').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-style') === style);
  });
}
function toggleCardAvatar(img, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  if (!img || !img.getAttribute || !img.getAttribute('data-avatar-pixar')) return;
  var next = (currentStyle(img) === 'line') ? 'pixar' : 'line';
  img.src = (next === 'line') ? img.getAttribute('data-avatar-line')
                              : img.getAttribute('data-avatar-pixar');
  img._style = next;
  img.classList.add('card-style-changed');
  syncStyleDots(img);
}
/* init on DOMContentLoaded if the page has avatar cards */
document.addEventListener('DOMContentLoaded', function () {
  if (document.querySelector('[data-avatar-pixar]')) applyAvatarStyleGlobal();
});