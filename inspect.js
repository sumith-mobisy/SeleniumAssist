document.getElementById('open-sidepanel').addEventListener('click', async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.sidePanel.open({ tabId: tab.id });
  
  window.close();
});
