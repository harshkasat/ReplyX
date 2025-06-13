// content_script.js - OPTIMIZED VERSION

// Store settings and state
let settings = null;
let isRunning = false;
let lastActionTime = 0;
let processedTweets = new Set();
let automationEnabled = false;
let automationInterval = null;
let pageVisibilityInterval = null;

// Global counters
let totalTweets = 0;
let processedLikes = 0;
let processedComments = 0;
let currentTweetForComment = null;

// Performance optimizations
let tweetCache = new Map();
let actionQueue = [];
let isProcessingQueue = false;
let fastMode = true; // Enable fast processing

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'settingsUpdated':
            settings = message.settings;
            if (settings.automationEnabled !== automationEnabled) {
                toggleAutomation(settings.automationEnabled);
            }
            sendResponse({status: 'received'});
            break;
        case 'automationToggle':
            toggleAutomation(message.enabled);
            sendResponse({status: 'toggled'});
            break;
        case 'groqApiResponse':
            handleGroqResponse(message.data);
            sendResponse({status: 'handled'});
            break;
        case 'groqApiError':
            console.error('Groq API error:', message.error);
            handleCommentError();
            sendResponse({status: 'error_handled'});
            break;
        case 'ping':
            sendResponse({status: 'alive'});
            break;
    }
    return true; // Keep message channel open
});

// FASTER initialization
async function initialize() {
    console.log('Fast initialization starting...');
    
    // Load settings quickly
    try {
        settings = await chrome.storage.sync.get([
            'groqApiKey',
            'groqModel',
            'enableLiking',
            'enableCommenting',
            'automationEnabled'
        ]);
        console.log('Settings loaded fast:', settings);
    } catch (error) {
        console.log('Using default settings');
        settings = {
            enableLiking: true,
            enableCommenting: true,
            automationEnabled: false
        };
    }

    // Start observing immediately
    observeTweets();
    
    // Initialize automation if enabled
    if (settings.automationEnabled) {
        toggleAutomation(true);
    }
    
    // Keep script alive even when tab is not active
    startBackgroundMode();
}

// BACKGROUND MODE - keeps script running when tab is not active
function startBackgroundMode() {
    // Prevent script from being garbage collected
    pageVisibilityInterval = setInterval(() => {
        // Heartbeat to keep script alive
        chrome.storage.local.set({ 
            scriptAlive: Date.now(),
            tabUrl: window.location.href
        });
    }, 10000); // Every 10 seconds

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('Page hidden - continuing in background');
            // Continue automation even when hidden
        } else {
            console.log('Page visible - resuming normal operation');
            // Resume normal operation
            if (automationEnabled && !isRunning) {
                setTimeout(() => runAutomation(), 1000);
            }
        }
    });
}

// MUCH FASTER tweet observation
function observeTweets() {
    const observer = new MutationObserver((mutations) => {
        if (isRunning || !automationEnabled) return;
        
        // Batch process mutations for better performance
        let hasNewTweets = false;
        
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                hasNewTweets = true;
                break;
            }
        }
        
        if (hasNewTweets) {
            // Debounce to avoid too many calls
            clearTimeout(observer.debounceTimer);
            observer.debounceTimer = setTimeout(() => {
                processTweetsQuickly();
            }, 500);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// FASTER tweet processing
async function processTweetsQuickly() {
    if (!settings || !automationEnabled || isRunning) return;
    
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    
    for (const tweet of tweets) {
        const tweetId = getTweetId(tweet);
        
        if (processedTweets.has(tweetId)) continue;
        
        // Quick visibility check
        const rect = tweet.getBoundingClientRect();
        if (rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0) {
            // Add to queue for processing
            actionQueue.push({
                tweet,
                tweetId,
                timestamp: Date.now()
            });
            
            // Process queue if not already processing
            if (!isProcessingQueue) {
                processActionQueue();
            }
            
            break; // Process one at a time
        }
    }
}

// QUEUE PROCESSING for better performance
async function processActionQueue() {
    if (isProcessingQueue || actionQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (actionQueue.length > 0) {
        const action = actionQueue.shift();
        
        // Skip old actions (older than 30 seconds)
        if (Date.now() - action.timestamp > 30000) {
            continue;
        }
        
        // Process the action
        await engageWithTweetFast(action.tweet, action.tweetId);
        
        // Small delay between actions
        await delay(fastMode ? 2000 : 5000);
    }
    
    isProcessingQueue = false;
}

// MUCH FASTER tweet engagement
async function engageWithTweetFast(tweet, tweetId) {
    try {
        // Skip scroll if tweet is already visible
        const rect = tweet.getBoundingClientRect();
        if (rect.bottom > window.innerHeight) {
            tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await delay(fastMode ? 500 : 1000);
        }

        let actionTaken = false;

        // FASTER liking
        if (settings.enableLiking) {
            const liked = await likePostFast(tweet);
            if (liked) actionTaken = true;
        }

        // FASTER commenting (reduced frequency for speed)
        if (settings.enableCommenting && shouldCommentFast()) {
            const commented = await commentOnPostFast(tweet);
            if (commented) actionTaken = true;
        }

        if (actionTaken) {
            processedTweets.add(tweetId);
            updateLastActionTime();
            totalTweets++;
            updateCounterDisplay();
        }

        return actionTaken;
    } catch (error) {
        console.error('Error in fast engagement:', error);
        return false;
    }
}

// FASTER liking with minimal delays
async function likePostFast(tweet) {
    const likeButton = tweet.querySelector('[data-testid="like"]');
    if (!likeButton) return false;

    // Quick check if already liked
    const isLiked = tweet.querySelector('[data-testid="unlike"]');
    if (isLiked) {
        processedLikes++;
        return true;
    }

    try {
        // Minimal mouse simulation
        likeButton.focus();
        await delay(fastMode ? 100 : 500);
        
        likeButton.click();
        
        // Quick verification
        await delay(fastMode ? 300 : 1000);
        const verifyLiked = tweet.querySelector('[data-testid="unlike"]');
        if (verifyLiked) {
            processedLikes++;
            updateCounterDisplay();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error in fast like:', error);
        return false;
    }
}

// FASTER commenting
async function commentOnPostFast(tweet) {
    try {
        // Get tweet text quickly
        const tweetText = getTweetTextFast(tweet);
        if (!tweetText) return false;

        // Find reply button
        const replyButton = tweet.querySelector('[data-testid="reply"]');
        if (!replyButton) return false;

        // Quick click
        replyButton.focus();
        await delay(fastMode ? 100 : 500);
        replyButton.click();
        
        // Reduced wait time
        await delay(fastMode ? 1000 : 2000);

        // Store reference
        currentTweetForComment = tweet;

        // Request AI reply
        chrome.runtime.sendMessage({
            type: 'groqApiRequest',
            data: { prompt: tweetText }
        });

        return true;
    } catch (error) {
        console.error('Error in fast comment:', error);
        return false;
    }
}

// FASTER text extraction
function getTweetTextFast(tweet) {
    // Use cached result if available
    const tweetId = getTweetId(tweet);
    if (tweetCache.has(tweetId)) {
        return tweetCache.get(tweetId);
    }
    
    const textElement = tweet.querySelector('[data-testid="tweetText"]');
    if (textElement) {
        const text = textElement.textContent.trim();
        tweetCache.set(tweetId, text);
        
        // Clean cache if too big
        if (tweetCache.size > 50) {
            const firstKey = tweetCache.keys().next().value;
            tweetCache.delete(firstKey);
        }
        
        return text;
    }
    
    return '';
}

// FASTER response handling
async function handleGroqResponse(reply) {
    try {
        console.log('Handling fast response:', reply);
        
        // Minimal wait
        await delay(fastMode ? 500 : 1000);
        
        // Direct text insertion
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.contentEditable === 'true' || activeElement.tagName === 'TEXTAREA')) {
            // Use fastest method
            if (document.execCommand) {
                document.execCommand('insertText', false, reply);
            } else {
                activeElement.textContent = reply;
                activeElement.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
        
        await delay(fastMode ? 500 : 1000);

        // Quick button find and click
        const replyButton = findReplyButton();
        if (replyButton) {
            replyButton.click();
            
            processedComments++;
            updateCounterDisplay();
            
            // Quick scroll after comment
            await delay(fastMode ? 1000 : 2000);
            await quickScroll();
        }
        
    } catch (error) {
        console.error('Error in fast response handling:', error);
        await handleCommentError();
    }
}

// FASTER button finding
function findReplyButton() {
    // Quick selectors
    const quickSelectors = [
        '[data-testid="tweetButton"]',
        '[data-testid="tweetButtonInline"]'
    ];
    
    for (const selector of quickSelectors) {
        const button = document.querySelector(selector);
        if (button) return button;
    }
    
    return null;
}

// FASTER scrolling
async function quickScroll() {
    const scrollAmount = window.innerHeight * 0.3; // Smaller scroll
    window.scrollBy({
        top: scrollAmount,
        behavior: fastMode ? 'auto' : 'smooth'
    });
    
    await delay(fastMode ? 300 : 1000);
    return true;
}

// OPTIMIZED automation cycle
// OPTIMIZED and MORE ROBUST automation cycle
async function runAutomation() {
    if (!settings || isRunning || !automationEnabled) return;

    isRunning = true;

    try {
        const tweets = document.querySelectorAll('article[data-testid="tweet"]');
        totalTweets = tweets.length;
        updateCounterDisplay();

        let processedInThisCycle = false;

        // Process the first unprocessed tweet found in the current view
        for (const tweet of tweets) {
            const tweetId = getTweetId(tweet);

            if (!processedTweets.has(tweetId)) {
                // Check if the tweet is actually visible and not an empty placeholder
                const rect = tweet.getBoundingClientRect();
                if (rect.height > 10) { // Ensure the tweet has some height
                    if (rect.height > 10 && rect.top >= 0 && rect.top < window.innerHeight) {
                        await engageWithTweetFast(tweet, tweetId);
                        processedInThisCycle = true;
                        break; // Process one and restart the cycle.
                    }
                }
            }
        }

        // If after checking all visible tweets, none were processed,
        // we need to scroll to find new ones.
        if (!processedInThisCycle) {
            console.log('No unprocessed tweets in view. Scrolling to find more...');

            const allTweetsOnPage = document.querySelectorAll('article[data-testid="tweet"]');
            
            // TODO: I don't if this correct !!
            // if (allTweetsOnPage.length > 0) {
            //     // Scroll to the last tweet currently rendered on the page.
            //     // This is a much more effective way to load new content.
            //     const lastTweet = allTweetsOnPage[allTweetsOnPage.length - 1];
            //     lastTweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
            //     await delay(1500); // Wait for new content to potentially load after scroll
            // } else {
            //     // Fallback: If there are no tweets at all, do a generic large scroll.
            //     window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
            //     await delay(1500);
            // }
            //  May this Fix up scroll !
            if (!processedInThisCycle) {
            console.log('No new tweets in view. Scrolling DOWN to find more...');
            
            // This is a reliable way to scroll down from the current position.
            window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' });
            await delay(1500); // Wait for new content to load.
        }
        }

    } catch (error) {
        console.error('Error in robust automation cycle:', error);
    } finally {
        isRunning = false;
    }
}

// FASTER automation controls
function toggleAutomation(enabled) {
    automationEnabled = enabled;
    
    if (enabled) {
        createCounterDisplay();
        startAutomationFast();
    } else {
        stopAutomation();
        removeCounterDisplay();
    }
}

function startAutomationFast() {
    if (automationInterval) return;
    
    // Immediate start
    setTimeout(() => runAutomation(), 500);
    
    // Faster interval
    automationInterval = setInterval(() => {
        if (!isRunning) {
            runAutomation();
        }
    }, fastMode ? 3000 : 8000); // Much faster checking
}

function stopAutomation() {
    if (automationInterval) {
        clearInterval(automationInterval);
        automationInterval = null;
    }
    if (pageVisibilityInterval) {
        clearInterval(pageVisibilityInterval);
        pageVisibilityInterval = null;
    }
    isRunning = false;
}

// UTILITY FUNCTIONS
function getTweetId(tweet) {
    if (!tweet.dataset.tweetId) {
        tweet.dataset.tweetId = `tweet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return tweet.dataset.tweetId;
}

function shouldCommentFast() {
    return Math.random() < 0.25; // 25% chance for speed
}

function updateLastActionTime() {
    lastActionTime = Date.now();
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleCommentError() {
    // Quick error handling
    const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
    });
    document.dispatchEvent(escapeEvent);
    
    await delay(500);
}

// COUNTER DISPLAY
function createCounterDisplay() {
    if (document.getElementById('replyx-counter')) return;

    const counter = document.createElement('div');
    counter.id = 'replyx-counter';
    counter.style.cssText = `
        position: fixed;
        width: 200px;
        height: 80px;
        bottom: 20px;
        right: 20px;
        background: rgba(0,0,0,0.9);
        border-radius: 10px;
        color: #fff;
        text-align: center;
        padding: 10px;
        z-index: 99999;
        font-family: Arial, sans-serif;
        font-size: 12px;
        line-height: 1.4;
        border: 2px solid #1da1f2;
    `;
    document.body.appendChild(counter);
    updateCounterDisplay();
}

function updateCounterDisplay() {
    const counter = document.getElementById('replyx-counter');
    if (counter) {
        counter.innerHTML = `
            <div><strong>🚀 ReplyX Fast Mode</strong></div>
            <div>Tweets: ${totalTweets} | Likes: ${processedLikes}</div>
            <div>Comments: ${processedComments}</div>
            <div style="font-size:10px;color:#aaa;">Background: ${document.hidden ? 'ON' : 'ACTIVE'}</div>
        `;
    }
}

function removeCounterDisplay() {
    const counter = document.getElementById('replyx-counter');
    if (counter) counter.remove();
}

// INITIALIZE EVERYTHING
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}