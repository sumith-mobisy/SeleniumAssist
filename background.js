// Background script for XPath Picker extension

// Handle extension icon click to open side panel
chrome.action.onClicked.addListener(async (tab) => {
  // Open the side panel
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message, 'from:', sender);
  
  if (message.action === 'startPicker') {
    // Forward to content script
    chrome.tabs.sendMessage(sender.tab.id, { action: 'startPicker' });
    sendResponse({ success: true });
  } else if (message.action === 'stopPicker') {
    // Forward to content script
    chrome.tabs.sendMessage(sender.tab.id, { action: 'stopPicker' });
    sendResponse({ success: true });
  } else if (message.action === 'clearHighlights') {
    // Forward to content script
    chrome.tabs.sendMessage(sender.tab.id, { action: 'clearHighlights' });
    sendResponse({ success: true });
  } else if (message.action === 'removeHighlight') {
    // Forward to content script
    chrome.tabs.sendMessage(sender.tab.id, { 
      action: 'removeHighlight',
      xpath: message.xpath 
    });
    sendResponse({ success: true });
  } else if (message.action === 'updateStatus') {
    // Forward to side panel via runtime message
    chrome.runtime.sendMessage(message);
    sendResponse({ success: true });
  } else {
    sendResponse({ success: true });
  }
});

// background.js - Add this to handle extension lifecycle events

// Cleanup when extension is suspended or updated
chrome.runtime.onSuspend.addListener(() => {
  cleanupAllTabs();
});

chrome.runtime.onStartup.addListener(() => {
  cleanupAllTabs();
});

// Cleanup when tabs are closed or navigated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    // Tab is navigating, cleanup highlights
    cleanupTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  // Tab is being closed, cleanup highlights
  cleanupTab(tabId);
});

// Function to cleanup a specific tab
async function cleanupTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // Remove all highlights
        const elements = document.querySelectorAll('.xpath-highlight');
        elements.forEach(el => el.classList.remove('xpath-highlight'));
        
        // Remove styles
        const styleEl = document.getElementById('xpath-highlight-styles');
        if (styleEl) {
          styleEl.remove();
        }
        
        // Reset picker state
        if (window.__xpathPickerActive) {
          window.__xpathPickerActive = false;
        }
        
        // Remove the stored click handler reference if it exists
        if (window.__xpathClickHandler) {
          document.body.removeEventListener('click', window.__xpathClickHandler, true);
          delete window.__xpathClickHandler;
        }
      }
    });
  } catch (e) {
    // Tab might not exist or script injection failed, ignore
    console.log('Cleanup failed for tab:', tabId, e);
  }
}

// Function to cleanup all tabs
async function cleanupAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      await cleanupTab(tab.id);
    }
  } catch (e) {
    console.log('Failed to cleanup all tabs:', e);
  }
}

