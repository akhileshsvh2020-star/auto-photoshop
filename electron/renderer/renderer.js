async function init() {
  const status = await window.connector.status();
  document.querySelector("#url").textContent = `${status.url} -> output: ${status.outputDir}`;
  document.querySelector("#startup").checked = status.startWithWindows;

  document.querySelector("#openWeb").addEventListener("click", () => {
    window.connector.openUrl(status.url);
  });

  document.querySelector("#startup").addEventListener("change", async (event) => {
    event.target.checked = await window.connector.setStartup(event.target.checked);
  });
}

init();
