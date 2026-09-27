document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    scannerInput: document.getElementById("scanner-input"),
    modeToggle: document.getElementById("mode-toggle"),
    scannerPrompt: document.getElementById("scanner-prompt"),
    scannerSubtext: document.getElementById("scanner-subtext"),
    eventPromptModal: document.getElementById("event-prompt-modal"),
    eventNameInput: document.getElementById("event-name-input"),
    eventPromptCancel: document.querySelector(".event-prompt-cancel"),
    eventPromptSubmit: document.querySelector(".event-prompt-submit")
  };

  const app = window.AttendanceLogic.createAttendanceApp(elements);
  app.init();
  window.handleScan = app.handleScan;
  window.updateModeUI = app.updateModeUI;
});

