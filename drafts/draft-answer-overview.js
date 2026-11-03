/* Show the user's own saved required answers in the post-setup menu. */
(function () {
  "use strict";
  var key = "partner002-draft-required-answers";
  var requiredRows = document.querySelectorAll(".qrow[data-qid]");
  var complete = 0;
  function answers() {
    try { return JSON.parse(sessionStorage.getItem(key) || "{}"); }
    catch (e) { return {}; }
  }
  function ownValue(id, side) {
    side = side || {};
    if (side.labels && side.labels.length) return side.labels.join(", ");
    var fields = side.fields || {};
    if (id === "location") {
      var place = [];
      if (fields.city) place.push(fields.city);
      if (fields.country) place.push(fields.country);
      var text = place.join(", ");
      if (fields.postal) text += (text ? " · " : "") + fields.postal;
      return text;
    }
    if (fields.value) return id === "height" ? fields.value + " cm" : String(fields.value);
    return "";
  }
  var data = answers();
  Array.prototype.forEach.call(requiredRows, function (row) {
    var id = row.getAttribute("data-qid");
    var answer = ownValue(id, (data[id] || {}).you);
    var value = row.querySelector("[data-answer-value]");
    var dot = row.querySelector(".dot");
    if (answer) {
      complete++;
      value.textContent = answer;
      value.classList.remove("un");
      if (dot) dot.classList.add("filled");
    } else {
      value.textContent = "Not answered";
      value.classList.add("un");
      if (dot) dot.classList.remove("filled");
    }
  });
  var count = document.querySelector("[data-answer-count]");
  if (count) count.textContent = complete + "/" + requiredRows.length;

  var optionalKey = "partner002-draft-optional-answers";
  var optionalAnswers = {};
  try { optionalAnswers = JSON.parse(sessionStorage.getItem(optionalKey) || "{}"); } catch (e) {}
  function renderOptional(tier, hostId) {
    var host = document.getElementById(hostId);
    if (!host) return;
    (window.P2_OPTIONAL_QUESTIONS || []).filter(function (item) { return item.tier === tier; }).forEach(function (item) {
      var record = optionalAnswers[item.id] || {};
      var labels = record.labels || [];
      var row = document.createElement("div");
      row.className = "qrow";
      row.setAttribute("data-optional-id", item.id);
      row.setAttribute("data-href", (tier === "extended" ? "draft-06c-extended.html" : "draft-06d-deep.html") + "?q=" + encodeURIComponent(item.id));
      var dot = document.createElement("span");
      dot.className = "dot" + (labels.length ? " filled" : "");
      var question = document.createElement("span");
      question.className = "q";
      question.textContent = item.label;
      var answer = document.createElement("span");
      answer.className = labels.length ? "a" : "un";
      answer.textContent = labels.length ? labels.join(", ") : "Not answered";
      row.appendChild(dot);
      row.appendChild(question);
      row.appendChild(answer);
      host.appendChild(row);
    });
  }
  renderOptional("extended", "extended-rows");
  renderOptional("deep", "deep-rows");
})();
