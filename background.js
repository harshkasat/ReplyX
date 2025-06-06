// background.js

// Store active tab state
let activeTabId = null;
let isRunning = false;

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'settingsUpdated':
            handleSettingsUpdate(message.settings);
            break;
        case 'groqApiRequest':
            handleGroqApiRequest(message.data, sender.tab.id);
            break;
        case 'ping':
            sendResponse({status: 'alive'});
            break;
    }
});

// Handle settings updates
async function handleSettingsUpdate(settings) {
    console.log('Handling settings update:', settings);
    
    // Store settings for future reference
    await chrome.storage.local.set({ currentSettings: settings });
    
    try {
        // Get all Twitter/X tabs
        const tabs = await chrome.tabs.query({
            url: ["*://*.twitter.com/*", "*://*.x.com/*"]
        });

        console.log(`Found ${tabs.length} Twitter/X tabs`);

        // Inject content script if needed and send settings to each tab
        for (const tab of tabs) {
            try {
                // Try to send message first
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'settingsUpdated',
                    settings: settings
                });
                console.log(`Settings sent to tab ${tab.id}`);
            } catch (error) {
                // If sending failed, inject content script and try again
                console.log('Injecting content script into tab:', tab.id);
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content_script.js']
                    });
                    
                    // Wait a bit for script to load
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Try sending message again after injection
                    await chrome.tabs.sendMessage(tab.id, {
                        type: 'settingsUpdated',
                        settings: settings
                    });
                    console.log(`Content script injected and settings sent to tab ${tab.id}`);
                } catch (injectionError) {
                    console.error(`Failed to inject script into tab ${tab.id}:`, injectionError);
                }
            }
        }
    } catch (error) {
        console.error('Error handling settings update:', error);
    }
}

// Handle Groq API requests - FIXED VERSION
async function handleGroqApiRequest(data, tabId) {
    console.log('Handling Groq API request:', data);
    
    try {
        const settings = await chrome.storage.sync.get(['groqApiKey', 'groqModel']);
        
        if (!settings.groqApiKey) {
            console.error('No Groq API key found');
            chrome.tabs.sendMessage(tabId, {
                type: 'groqApiError',
                error: 'No API key configured'
            });
            return;
        }

        console.log('Making request to Groq API...');
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.groqApiKey}`
            },
            body: JSON.stringify({
                model: settings.groqModel || "llama3-8b-8192", // Use a more reliable model
                messages: [{
                    role: 'user',
                    content: data.prompt
                }],
                max_tokens: 100, // Shorter responses for tweets
                temperature: 0.8, // More creative responses
                top_p: 0.9,
                frequency_penalty: 0.5, // Reduce repetition
                presence_penalty: 0.3
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq API response not ok:', response.status, errorText);
            throw new Error(`API request failed: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        console.log('Groq API response:', result);
        
        if (!result.choices || !result.choices[0] || !result.choices[0].message) {
            throw new Error('Invalid response format from Groq API');
        }
        
        // Clean the response text
        let cleanResponse = result.choices[0].message.content
            .replace(/[^\x00-\x7F]/g, "") // Remove non-ASCII characters
            .replace(/"/g, '') // Remove quotes
            .replace(/\n/g, ' ') // Replace newlines with spaces
            .trim();
            
        // Ensure response isn't too long for Twitter
        if (cleanResponse.length > 200) {
            cleanResponse = cleanResponse.substring(0, 197) + "...";
        }
        
        // Make sure it's not empty
        if (!cleanResponse || cleanResponse.length < 3) {
            cleanResponse = "Interesting point! 👍";
        }
        
        console.log('Sending cleaned response to tab:', cleanResponse);
        
        // Send response back to content script
        chrome.tabs.sendMessage(tabId, {
            type: 'groqApiResponse',
            data: cleanResponse
        });
        
    } catch (error) {
        console.error('Error calling Groq API:', error);
        
        // Send fallback response
        const fallbackResponses = [
            "Great point! 👍",
            "Interesting perspective!",
            "Thanks for sharing this!",
            "Really insightful!",
            "I agree with this!",
            "Well said!",
            "This is so true!",
            "Exactly my thoughts!",
            "Love this take!",
            "Couldn't agree more!"
        ];
        
        const randomResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
        
        chrome.tabs.sendMessage(tabId, {
            type: 'groqApiResponse',
            data: randomResponse
        });
    }
}

// Track tab updates and ensure content script is loaded
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && 
        (tab.url?.includes('twitter.com') || tab.url?.includes('x.com'))) {
        
        console.log('Tab updated, checking content script:', tabId);
        
        try {
            // Try to send a ping message to check if content script is loaded
            await chrome.tabs.sendMessage(tabId, { type: 'ping' });
            console.log('Content script already loaded on tab:', tabId);
        } catch (error) {
            // If content script isn't loaded, inject it
            console.log('Content script not found, injecting into tab:', tabId);
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content_script.js']
                });
                
                console.log('Content script injected successfully');
                
                // Wait for script to initialize
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Send current settings if available
                const settings = await chrome.storage.local.get('currentSettings');
                if (settings.currentSettings) {
                    await chrome.tabs.sendMessage(tabId, {
                        type: 'settingsUpdated',
                        settings: settings.currentSettings
                    });
                    console.log('Settings sent to newly injected script');
                }
            } catch (injectionError) {
                console.error('Error injecting content script:', injectionError);
            }
        }
    }
});

// Track active tab for other purposes
chrome.tabs.onActivated.addListener((activeInfo) => {
    activeTabId = activeInfo.tabId;
    console.log('Active tab changed to:', activeTabId);
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeTabId) {
        activeTabId = null;
        console.log('Active tab closed');
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension started up');
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated');
});