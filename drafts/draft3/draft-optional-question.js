/* One optional question per route; answers are tab-local and never affect compatibility. */
(function () {
  "use strict";
  var tier = document.body.getAttribute("data-optional-tier");
  var all = window.P2_OPTIONAL_QUESTIONS || [];
  var items = all.filter(function (item) { return item.tier === tier; });
  var params = new URLSearchParams(window.location.search);
  var id = params.get("q");
  var item = items.find(function (entry) { return entry.id === id; }) || items[0];
  var answersKey = "partner002-draft-optional-answers";
  var title = document.getElementById("question-title");
  var host = document.getElementById("question");
  var saveButton = document.getElementById("save-answer");
  var state = readAnswers();
  var selected = state[item.id] && state[item.id].selected ? state[item.id].selected.slice() : [];

  function readAnswers() {
    try { return JSON.parse(sessionStorage.getItem(answersKey) || "{}"); }
    catch (e) { return {}; }
  }
  function persist() {
    var labels = item.options.filter(function (option) { return selected.indexOf(option.value) !== -1; })
      .map(function (option) { return option.label; });
    state[item.id] = { selected: selected.slice(), labels: labels };
    try { sessionStorage.setItem(answersKey, JSON.stringify(state)); } catch (e) {}
  }
  function updateButtons() {
    if (saveButton) saveButton.disabled = selected.length === 0;
  }
  function choose(option, button) {
    var value = option.value;
    if (item.type === "scale" || item.type === "radio") {
      selected = [value];
    } else if (selected.indexOf(value) !== -1) {
      selected = selected.filter(function (current) { return current !== value; });
    } else if ((item.exclusive || []).indexOf(value) !== -1) {
      selected = [value];
    } else {
      selected = selected.filter(function (current) { return (item.exclusive || []).indexOf(current) === -1; });
      selected.push(value);
    }
    Array.prototype.forEach.call(host.querySelectorAll("button[data-value]"), function (candidate) {
      var on = selected.indexOf(candidate.getAttribute("data-value")) !== -1;
      candidate.classList.toggle("sel", on);
      candidate.setAttribute("aria-pressed", on ? "true" : "false");
    });
    updateButtons();
  }
  function render() {
    if (!item) {
      title.textContent = "Question unavailable";
      return;
    }
    title.textContent = item.label;
    document.title = item.label + " — " + tier;
    host.setAttribute("data-optional-id", item.id);
    host.setAttribute("data-type", item.type);
    item.options.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = item.type === "scale" ? "rate" : "opt";
      button.setAttribute("data-value", option.value);
      button.setAttribute("data-label", option.label);
      button.setAttribute("aria-pressed", selected.indexOf(option.value) !== -1 ? "true" : "false");
      if (selected.indexOf(option.value) !== -1) button.classList.add("sel");
      if (item.type !== "scale") {
        var mark = document.createElement("span");
        mark.className = "mark " + (item.type === "multi" ? "square" : "round");
        button.appendChild(mark);
      }
      var label = document.createElement("span");
      label.textContent = option.label;
      button.appendChild(label);
      button.addEventListener("click", function () { choose(option, button); });
      host.appendChild(button);
    });
    updateButtons();
  }
  document.getElementById("back-to-answers").addEventListener("click", function () {
    window.location.href = "draft-03-questionnaire-overview.html";
  });
  if (saveButton) saveButton.addEventListener("click", function () {
    if (!selected.length) return;
    persist();
    window.location.href = "draft-03-questionnaire-overview.html";
  });
  render();
})();
