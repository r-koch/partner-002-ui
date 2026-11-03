/* Prototype-only candidate decisions. State is private to this browser tab; no network. */
(function (root) {
  "use strict";
  var KEY = "partner002-candidate-actions";
  function state() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '{"interested":[],"notForMe":[]}'); }
    catch (e) { return { interested: [], notForMe: [] }; }
  }
  function save(value) {
    try { sessionStorage.setItem(KEY, JSON.stringify(value)); } catch (e) {}
  }
  function add(list, handle) {
    var value = state();
    value[list] = (value[list] || []).filter(function (item) { return item !== handle; });
    value[list].push(handle);
    save(value);
  }
  function remove(list, handle) {
    var value = state();
    value[list] = (value[list] || []).filter(function (item) { return item !== handle; });
    save(value);
  }
  root.CandidateState = {
    interested: function () { return state().interested || []; },
    notForMe: function () { return state().notForMe || []; },
    recordInterest: function (handle) { add("interested", String(handle)); remove("notForMe", String(handle)); },
    recordNotForMe: function (handle) { add("notForMe", String(handle)); remove("interested", String(handle)); },
    restore: function (handle) { remove("notForMe", String(handle)); },
    clear: function () { save({ interested: [], notForMe: [] }); }
  };
})(window);
