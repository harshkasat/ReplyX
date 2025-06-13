// background.js - OPTIMIZED VERSION

// Store active tab state and API cache
let activeTabId = null;
let isRunning = false;
let apiCache = new Map(); // Cache API responses for similar tweets
let rateLimitQueue = []; // Queue for API requests
let isProcessingQueue = false;

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'settingsUpdated':
            handleSettingsUpdate(message.settings);
            break;
        case 'groqApiRequest':
            // Handle async but respond immediately
            handleGroqApiRequestFast(message.data, sender.tab.id);
            sendResponse({status: 'queued'}); // Immediate response
            break;
        case 'ping':
            sendResponse({status: 'alive'});
            break;
    }
    return true; // Keep message channel open for async responses
});

// FASTER settings update - no unnecessary delays
async function handleSettingsUpdate(settings) {
    console.log('Handling settings update:', settings);
    
    // Store settings
    await chrome.storage.local.set({ currentSettings: settings });
    
    try {
        const tabs = await chrome.tabs.query({
            url: ["*://*.twitter.com/*", "*://*.x.com/*"]
        });

        // Process tabs in parallel instead of sequentially
        const promises = tabs.map(async (tab) => {
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'settingsUpdated',
                    settings: settings
                });
            } catch (error) {
                // Inject and retry without waiting
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content_script.js']
                    });
                    
                    // Don't wait - send message immediately
                    setTimeout(async () => {
                        try {
                            await chrome.tabs.sendMessage(tab.id, {
                                type: 'settingsUpdated',
                                settings: settings
                            });
                        } catch (e) {
                            console.log(`Tab ${tab.id} might be closed`);
                        }
                    }, 500); // Reduced wait time
                } catch (injectionError) {
                    console.log(`Tab ${tab.id} injection failed - tab might be closed`);
                }
            }
        });
        
        // Don't wait for all promises to resolve
        Promise.allSettled(promises);
        
    } catch (error) {
        console.error('Error handling settings update:', error);
    }
}

// MUCH FASTER API handling with caching and queue
async function handleGroqApiRequestFast(data, tabId) {
    console.log('Received fast API request');
    
    // Check cache first for instant responses
    const cacheKey = data.prompt.toLowerCase().substring(0, 50);
    if (apiCache.has(cacheKey)) {
        console.log('Using cached response');
        chrome.tabs.sendMessage(tabId, {
            type: 'groqApiResponse',
            data: apiCache.get(cacheKey)
        });
        return;
    }
    
    // Add to queue for processing
    rateLimitQueue.push({ data, tabId, timestamp: Date.now() });
    
    // Process queue if not already processing
    if (!isProcessingQueue) {
        processApiQueue();
    }
}

// Process API requests in background queue
async function processApiQueue() {
    if (isProcessingQueue || rateLimitQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (rateLimitQueue.length > 0) {
        const request = rateLimitQueue.shift();
        
        // Skip old requests (older than 30 seconds)
        if (Date.now() - request.timestamp > 30000) {
            console.log('Skipping old request');
            continue;
        }
        
        await processApiRequest(request);
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    isProcessingQueue = false;
}

// Optimized API request processing
async function processApiRequest({ data, tabId }) {
    // Shorter, faster prompt
    const quickPrompt = `Reply to: "${data.prompt}" sounds like a casual conversation, with human-like imperfections. 
    Use short sentences, include some grammatical mistakes, and avoid over-polishing the text. Keep it punchy, natural, and easy to read. 
    The tone should feel conversational, not overly formal. Don't add too much grammar structure, just make it feel like a regular tweet from a person. 
    Keep it short like 8-11 words.  Add some grammar mistakes, don't over-polish. Sound human not like a bot or brand`;
    
    try {
        const settings = await chrome.storage.sync.get(['groqApiKey', 'groqModel']);
        
        if (!settings.groqApiKey) {
            sendFallbackResponse(tabId);
            return;
        }

        // Faster API call with reduced parameters
        const response = await Promise.race([
            fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.groqApiKey}`
                },
                body: JSON.stringify({
                    model: "llama3-8b-8192",
                    messages: [{ role: 'user', content: quickPrompt }],
                    max_tokens: 50, // Smaller for speed
                    temperature: 0.9,
                    stream: false // Ensure no streaming
                })
            }),
            // 5 second timeout
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('API timeout')), 5000)
            )
        ]);

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.choices?.[0]?.message?.content) {
            let cleanResponse = result.choices[0].message.content
                .replace(/[^\x00-\x7F]/g, "")
                .replace(/"/g, '')
                .replace(/\n/g, ' ')
                .trim();
                
            if (cleanResponse.length > 150) {
                cleanResponse = cleanResponse.substring(0, 147) + "...";
            }
            
            if (!cleanResponse || cleanResponse.length < 3) {
                cleanResponse = getRandomFallback();
            }
            
            // Cache the response
            const cacheKey = data.prompt.toLowerCase().substring(0, 50);
            apiCache.set(cacheKey, cleanResponse);
            
            // Clean cache if it gets too big
            if (apiCache.size > 100) {
                const firstKey = apiCache.keys().next().value;
                apiCache.delete(firstKey);
            }
            
            // Send response
            chrome.tabs.sendMessage(tabId, {
                type: 'groqApiResponse',
                data: cleanResponse
            }).catch(e => console.log('Tab closed before response'));
            
        } else {
            throw new Error('Invalid API response');
        }
        
    } catch (error) {
        console.log('API error, using fallback:', error.message);
        sendFallbackResponse(tabId);
    }
}

// Fast fallback response
function sendFallbackResponse(tabId) {
    const response = getRandomFallback();
    chrome.tabs.sendMessage(tabId, {
        type: 'groqApiResponse',
        data: response
    }).catch(e => console.log('Tab closed'));
}

function getRandomFallback() {
    const responses = [
        "So true! 💯", "This! 👆", "Exactly!", "Facts 🔥", 
        "Love this take", "Well said!", "This hits different",
        "Big mood", "Couldn't agree more", "This is it!"
    ];
    return responses[Math.floor(Math.random() * responses.length)];
}

// FASTER tab handling - no unnecessary waits
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && 
        (tab.url?.includes('twitter.com') || tab.url?.includes('x.com'))) {
        
        // Don't wait - inject immediately in background
        setTimeout(async () => {
            try {
                await chrome.tabs.sendMessage(tabId, { type: 'ping' });
            } catch (error) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['content_script.js']
                    });
                    
                    // Send settings without waiting
                    setTimeout(async () => {
                        const settings = await chrome.storage.local.get('currentSettings');
                        if (settings.currentSettings) {
                            chrome.tabs.sendMessage(tabId, {
                                type: 'settingsUpdated',
                                settings: settings.currentSettings
                            }).catch(() => {});
                        }
                    }, 300);
                } catch (e) {
                    console.log('Injection failed - tab closed or restricted');
                }
            }
        }, 100); // Minimal delay
    }
});

// Keep extension alive in background
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension keeping alive');
    keepAlive();
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed - starting background mode');
    keepAlive();
});

// Keep service worker alive
function keepAlive() {
    setInterval(() => {
        chrome.storage.local.get('heartbeat').then(() => {
            chrome.storage.local.set({ heartbeat: Date.now() });
        });
    }, 25000); // Every 25 seconds to prevent service worker sleep
}

// Track active tab
chrome.tabs.onActivated.addListener((activeInfo) => {
    activeTabId = activeInfo.tabId;
});

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeTabId) {
        activeTabId = null;
    }
});

// Initialize keep alive
keepAlive();