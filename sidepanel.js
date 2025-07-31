// Side panel functionality with embedded XPath picker
let xpaths = [];
let isPickerActive = false;

// DOM elements
const xpathList = document.getElementById('xpath-list');
const clearButton = document.getElementById('clear-xpath');
const sendButton = document.getElementById('send-data');
const chatInput = document.getElementById('chat-input');
const emptyState = document.getElementById('empty-state');
const elementCount = document.getElementById('element-count');
const statusIndicator = document.getElementById('status-indicator');
const startPickerButton = document.getElementById('start-picker');

const MAX_SELECTION = 10;

// Settings modal logic
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const saveApiKeyBtn = document.getElementById('saveApiKey');

settingsBtn.onclick = () => {
  settingsModal.classList.add('active');
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    geminiApiKeyInput.value = result.geminiApiKey || '';
  });
};
closeSettings.onclick = () => settingsModal.classList.remove('active');
saveApiKeyBtn.onclick = () => {
  const key = geminiApiKeyInput.value.trim();
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      settingsModal.classList.remove('active');
    });
  } else {
    alert('chrome.storage is not available. Please use the extension in Chrome.');
  }
};

// Gemini response UI
const responseSection = document.getElementById('responseSection');
const geminiResponse = document.getElementById('geminiResponse');
const copyResponseBtn = document.getElementById('copyResponseBtn');

copyResponseBtn.onclick = () => {
  const code = geminiResponse.textContent;
  navigator.clipboard.writeText(code);
  copyResponseBtn.textContent = 'Copied!';
  setTimeout(() => (copyResponseBtn.textContent = 'Copy'), 1500);
};

// Fixed context for Gemini prompt
const FIXED_CONTEXT = `You are an expert in UI test automation with deep knowledge in Selenium Given the xpaths of elements, write Selenium test cases for theese scenarioes -`;

const updateUI = () => {
  elementCount.textContent = `${xpaths.length}/${MAX_SELECTION}`;
  emptyState.style.display = xpaths.length === 0 ? 'block' : 'none';
  
  if (isPickerActive) {
    statusIndicator.textContent = 'Picker is active - click elements on the page';
    statusIndicator.className = 'status-indicator status-active';
    startPickerButton.textContent = 'Stop Picker';
  } else {
    statusIndicator.textContent = 'Click "Start Picker" to begin selecting elements';
    statusIndicator.className = 'status-indicator status-inactive';
    startPickerButton.textContent = 'Start Picker';
  }
};

// Cleanup function to remove all highlights and event listeners
const cleanupPageHighlights = async () => {
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
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
    console.log('Cleanup error:', e);
  }
};

// Function to remove highlight for a specific XPath
const removeHighlightByXPath = async (xpath) => {
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (xpathToRemove) => {
        // Helper function to evaluate XPath
        function evaluateXPath(xpath) {
          try {
            const result = document.evaluate(
              xpath, 
              document, 
              null, 
              XPathResult.FIRST_ORDERED_NODE_TYPE, 
              null
            );
            return result.singleNodeValue;
          } catch (e) {
            console.log('XPath evaluation error:', e);
            return null;
          }
        }
        
        // Find the element using the XPath and remove highlight
        const element = evaluateXPath(xpathToRemove);
        if (element && element.classList) {
          element.classList.remove('xpath-highlight');
        }
      },
      args: [xpath]
    });
  } catch (e) {
    console.log('Error removing highlight:', e);
  }
};

// Add XPath to the list
const addXPath = (label, xpath) => {
  if (xpaths.length >= MAX_SELECTION) {
    return false;
  }
  
  const labelKey = label.replace(/\s+/g, ' ').trim();
  xpaths.push({ [labelKey]: xpath });
  
  const li = document.createElement('li');
  li.className = 'xpath-item';
  li.innerHTML = `
    <div class="xpath-item-label">
      <span>${labelKey}</span>
      <button class="delete-btn" title="Remove">×</button>
    </div>
    <div class="xpath-item-path">${xpath}</div>
  `;
  
  if (emptyState.style.display !== 'none') {
    emptyState.style.display = 'none';
  }
  
  xpathList.appendChild(li);
  updateUI();
  
  // Delete button handler - FIXED VERSION
  li.querySelector('.delete-btn').onclick = async (e) => {
    e.stopPropagation();
    li.style.transform = 'translateX(100%)';
    li.style.opacity = '0';
    
    // Remove highlight from page using the actual XPath
    await removeHighlightByXPath(xpath);
    
    setTimeout(() => {
      xpathList.removeChild(li);
      const index = xpaths.findIndex(x => Object.values(x)[0] === xpath);
      if (index !== -1) xpaths.splice(index, 1);
      updateUI();
    }, 200);
  };
  
  return true;
};

// Clear all XPaths
const clearXPaths = async () => {
  xpaths.length = 0;
  xpathList.innerHTML = '<div class="empty-state" id="empty-state"><div class="empty-state-icon">🎯</div><div>Click elements on the page to collect their XPaths</div></div>';
  updateUI();
  
  // Clear highlights from page
  await cleanupPageHighlights();
};

// Start/Stop picker
const togglePicker = async () => {
  isPickerActive = !isPickerActive;

  if (isPickerActive) {
    // Inject the picker functionality into the page
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // This will run in the page context
          if (window.__xpathPickerActive) return;
          window.__xpathPickerActive = true;
          
          // Add highlight styles
          if (!document.getElementById('xpath-highlight-styles')) {
            const style = document.createElement('style');
            style.id = 'xpath-highlight-styles';
            style.textContent = `
              .xpath-highlight {
                outline: 3px solid #667eea !important;
                outline-offset: 2px !important;
                background-color: rgba(102, 126, 234, 0.1) !important;
                box-shadow: 0 0 0 6px rgba(102, 126, 234, 0.2) !important;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
                position: relative !important;
              }
              
              .xpath-highlight:after {
                content: '✓';
                position: absolute;
                top: -10px;
                right: -10px;
                background: #667eea;
                color: white;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: bold;
                z-index: 1000;
              }
            `;
            document.head.appendChild(style);
          }
          
          // XPath function
          function getXPathWithSummary(el) {
            if (!el || el.nodeType !== 1) return { xpath: '', summary: '' };
          
            // Handle <span> wrapping the multiselect button
            if (el.tagName.toLowerCase() === 'span') {
              el = el.parentElement;
            }
          
            // Special case: if element is a button with class "multiselect", return the XPath of the nearest parent <select>
            if (
              el.tagName.toLowerCase() === 'button' &&
              el.classList.contains('multiselect')
            ) {
              let parent = el.parentElement;
              while (parent) {
                const select = parent.querySelector('select');
                if (select) {
                  return getXPathWithSummary(select);
                }
                parent = parent.parentElement;
              }
            }
          
            let xpath = '';
            if (el === document.body) {
              xpath = '/html/body';
            } else if (el.id) {
              xpath = `//*[@id="${el.id}"]`;
            } else if (el.name) {
              const sameName = document.querySelectorAll(`[name="${el.name}"]`);
              if (sameName.length === 1) {
                xpath = `//${el.tagName.toLowerCase()}[@name="${el.name}"]`;
              }
            } else if (el.classList.length > 0) {
              for (const cls of el.classList) {
                const sameClass = document.querySelectorAll(`.${cls}`);
                if (sameClass.length === 1) {
                  xpath = `//${el.tagName.toLowerCase()}[@class="${cls}"]`;
                  break;
                }
              }
            } else {
              const type = el.getAttribute('type');
              if (type && el.name) {
                const selector = `${el.tagName.toLowerCase()}[type="${type}"][name="${el.name}"]`;
                const sameCombo = document.querySelectorAll(selector);
                if (sameCombo.length === 1) {
                  xpath = `//${selector}`;
                }
              }
          
              if (!xpath) {
                const tag = el.tagName.toLowerCase();
                const tagElements = document.getElementsByTagName(tag);
                if (tagElements.length === 1) {
                  xpath = `//${tag}`;
                } else {
                  const text = el.textContent.trim();
                  if (text && text.length < 40) {
                    const sameText = Array.from(document.getElementsByTagName(tag)).filter(
                      e => e.textContent.trim() === text
                    );
                    if (sameText.length === 1) {
                      xpath = `//${tag}[text()="${text}"]`;
                    }
                  }
                }
              }
          
              if (!xpath) {
                let ix = 0;
                const siblings = el.parentNode ? el.parentNode.childNodes : [];
                for (let i = 0; i < siblings.length; i++) {
                  const sibling = siblings[i];
                  if (sibling === el) {
                    const parentResult = getXPathWithSummary(el.parentNode);
                    xpath = `${parentResult.xpath}/${el.tagName.toLowerCase()}[${ix + 1}]`;
                    break;
                  }
                  if (sibling.nodeType === 1 && sibling.tagName === el.tagName) {
                    ix++;
                  }
                }
              }
            }
          
            // Generate minimal HTML summary
            let summary = `<${el.tagName.toLowerCase()}`;
            if (el.id) summary += ` id="${el.id}"`;
            if (el.name) summary += ` name="${el.name}"`;
            if (el.className) summary += ` class="${el.className}"`;
            const type = el.getAttribute('type');
            if (type) summary += ` type="${type}"`;
            summary += '>';
          
            return { xpath, summary };
          }
          
                    
          
          // Create and store the click handler
          window.__xpathClickHandler = function(event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            
            const el = event.target;
            const xpathSummary = getXPathWithSummary(el);
            const xpath = xpathSummary.xpath;
            // const label = el.innerText.trim().slice(0, 40) || el.tagName.toLowerCase();
            const label = xpathSummary.summary;
            
            // Send to side panel
            chrome.runtime.sendMessage({
              action: 'addXPath',
              label: label,
              xpath: xpath
            });
            
            // Add highlight
            el.classList.add('xpath-highlight');
            
            // Copy to clipboard
            navigator.clipboard.writeText(xpath);
          };
          
          // Add click handler
          document.body.addEventListener('click', window.__xpathClickHandler, true);
        }
      });
    } catch (e) {
      console.log('Script injection error:', e);
    }
  } else {
    // Stop picker
    await cleanupPageHighlights();
  }

  updateUI();
};

// Overwrite sendData to call Gemini
const sendData = async () => {
  const prompt = chatInput.value.trim();
  if (!prompt) {
    chatInput.focus();
    chatInput.style.borderColor = 'rgba(255, 59, 92, 0.8)';
    setTimeout(() => chatInput.style.borderColor = 'rgba(255, 255, 255, 0.2)', 2000);
    return;
  }
  if (xpaths.length === 0) {
    xpathList.style.borderColor = 'rgba(255, 59, 92, 0.8)';
    setTimeout(() => xpathList.style.borderColor = 'transparent', 2000);
    return;
  }

  // Show loading
  responseSection.classList.add('active');
  geminiResponse.textContent = 'Loading...';
  copyResponseBtn.style.display = 'none';

  // Get API key
  chrome.storage.local.get(['geminiApiKey'], async (result) => {
    const apiKey = result.geminiApiKey;
    if (!apiKey) {
      geminiResponse.textContent = 'Please set your Gemini API key in settings.';
      return;
    }

    const xpathString = xpaths
      .map(x => {
        const key = Object.keys(x)[0];
        const value = x[key];
        return `${key}: '${value}'`;
      })
      .join('\n');
    // Compose payload
    const userPrompt = prompt;
    const payload = {
      contents: [
        { parts: [ { text: FIXED_CONTEXT  + userPrompt +  '\n\n Xpaths - ' + xpathString + '**INSTRUCTIONS** : use selenium-java 4.8.1, Avoid setup code and comments,, use the xpaths to generate test case functions. Whenever DB call is required use this function DBReader.QueryResult() which is already defined, use these imports import org.openqa.selenium.*;import org.openqa.selenium.chrome.*;import org.openqa.selenium.edge.*; import org.openqa.selenium.firefox.*;import org.openqa.selenium.interactions.*;import org.openqa.seleniumsupport.events.*;import org.testng.annotations.*;import org.testng.asserts.*;' } ] } 
      ]
    };

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': '*/*',
          },
          body: JSON.stringify(payload)
        }
      );
      const data = await res.json();
      let code = '';
      if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
        // Try to extract code block
        const text = data.candidates[0].content.parts.map(p => p.text).join('\n');
        appendGeminiResponse(text);
        const match = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
        code = match ? match[1].trim() : text.trim();
      } else {
        code = 'No response or invalid API key.';
      }
      geminiResponse.textContent = code;
      copyResponseBtn.style.display = 'block';
    } catch (e) {
      geminiResponse.textContent = 'Error: ' + e.message;
      copyResponseBtn.style.display = 'none';
    }
  });
};

const appendGeminiResponse = (text) => {
  const historyContainer = document.getElementById('geminiHistory');
  const match = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  const code = match ? match[1].trim() : text.trim();

  const messageWrapper = document.createElement('div');
  messageWrapper.className = 'gemini-message';

  const pre = document.createElement('pre');
  const codeEl = document.createElement('code');
  codeEl.textContent = code;
  pre.appendChild(codeEl);
  messageWrapper.appendChild(pre);

  historyContainer.appendChild(messageWrapper);

  historyContainer.scrollTop = historyContainer.scrollHistory;
};

// Event listeners
clearButton.onclick = clearXPaths;
startPickerButton.onclick = togglePicker;
sendButton.onclick = sendData;

// Listen for messages from injected script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'addXPath') {
    const success = addXPath(message.label, message.xpath);
    sendResponse({ success });
  }
  return true;
});

// Cleanup when side panel is closed or page is navigated
window.addEventListener('beforeunload', cleanupPageHighlights);
window.addEventListener('pagehide', cleanupPageHighlights);

// Also cleanup when the extension is disabled or side panel is closed
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cleanupPageHighlights();
  }
});

// Initialize UI
updateUI(); 

document.getElementById('toggleHistoryBtn').addEventListener('click', function () {
  const history = document.getElementById('geminiHistory');
  const isVisible = history.style.display === 'block';

  history.style.display = isVisible ? 'none' : 'block';
  this.textContent = isVisible ? 'Show History' : 'Hide History';
});