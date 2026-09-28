document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    scannerInput: document.getElementById("scanner-input"),
    modeToggle: document.getElementById("mode-toggle"),
    scannerPrompt: document.getElementById("scanner-prompt"),
    scannerSubtext: document.getElementById("scanner-subtext"),
    appTitle: document.getElementById("app-title"),
    eventPromptModal: document.getElementById("event-prompt-modal"),
    eventPromptCancel: document.querySelector(".event-prompt-cancel"),
    eventPromptSubmit: document.querySelector(".event-prompt-submit"),
    eventSelectionList: document.getElementById("event-selection-list"),
    eventSelectionTitle: document.getElementById("event-selection-title")
  };

  const app = window.AttendanceLogic.createAttendanceApp(elements);
  app.init();
  window.handleScan = app.handleScan;
  window.updateModeUI = app.updateModeUI;
});

