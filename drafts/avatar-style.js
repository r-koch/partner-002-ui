/* Avatar style shared JS (draft demo) — global default + per-card page-scoped swap.
Global: key 'avatarStyleGlobal' = 'pixar' | 'line' (set on the avatar page).
Per-card: viewer taps a card's swap button -> that card flips for the life of the
PAGE only; reload/navigate resets every card to the global default (owner 2026-09-15).
Usage:
  - cards carry data-avatar-pixar + data-avatar-line attributes + a .avatar-swap button
  - on page load, call applyAvatarStyleGlobal() -> sets every card to the global default
  - swap button calls toggleCardAvatar(this) -> flips that one card in-page
*/
function avatarStyleGlobal() {
  try { return localStorage.getItem('avatarStyleGlobal') || 'pixar'; } catch (e) { return 'pixar'; }
}
function setAvatarStyleGlobal(style) {
  try { localStorage.setItem('avatarStyleGlobal', style); } catch (e) {}
}
function applyAvatarStyleGlobal() {
  var style = avatarStyleGlobal();
  document.querySelectorAll('[data-avatar-pixar]').forEach(function (img) {
    var cardImg = img;
    var pixar = img.getAttribute('data-avatar-pixar');
    var line = img.getAttribute('data-avatar-line');
    img.src = (style === 'line') ? line : pixar;
    img._style = style;
  });
  // keep any segmented control on this page in sync
  document.querySelectorAll('.avatar-style-seg [data-style]').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-style') === style);
  });
}
function toggleCardAvatar(img) {
  // img IS the avatar image (owner: the avatar itself is the switch, no button)
  if (!img || !img.getAttribute || !img.getAttribute('data-avatar-pixar')) return;
  var cur = img.getAttribute('src') === img.getAttribute('data-avatar-line') ? 'line' : 'pixar';
  var next = (cur === 'line') ? 'pixar' : 'line';
  img.src = (next === 'line') ? img.getAttribute('data-avatar-line') : img.getAttribute('data-avatar-pixar');
  img._style = next;
  img.classList.add('card-style-changed');
}
/* init on DOMContentLoaded if the page has avatar cards */
document.addEventListener('DOMContentLoaded', function () {
  if (document.querySelector('[data-avatar-pixar]')) applyAvatarStyleGlobal();
});