//  content_script.js
// Store settings and state
let settings = null;
let isRunning = false;
let lastActionTime = 0;
let processedTweets = new Set();
let automationEnabled = false;
let automationInterval = null;

// Global counters
let totalTweets = 0;
let processedLikes = 0;
let processedComments = 0;
let currentTweetForComment = null;

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', initialize);

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'settingsUpdated':
            settings = message.settings;
            if (settings.automationEnabled !== automationEnabled) {
                toggleAutomation(settings.automationEnabled);
            }
            break;
        case 'automationToggle':
            toggleAutomation(message.enabled);
            break;
        case 'groqApiResponse':
            handleGroqResponse(message.data);
            break;
        case 'groqApiError':
            console.error('Groq API error:', message.error);
            handleCommentError();
            break;
        case 'ping':
            sendResponse({status: 'alive'});
            break;
    }
});

// Initialize the automation
async function initialize() {
    // Load settings
    settings = await chrome.storage.sync.get([
        'groqApiKey',
        'groqModel',
        'enableLiking',
        'enableCommenting'
    ]);

    console.log('Extension initialized with settings:', settings);
    // Start observing tweets
    observeTweets();
}

// Set up mutation observer to watch for new tweets
function observeTweets() {
    const observer = new MutationObserver((mutations) => {
        if (isRunning) return;
        
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    processTweets(node);
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Process tweets in the given container
async function processTweets(container) {
    if (!settings || !automationEnabled) return;

    const tweets = container.querySelectorAll('article[data-testid="tweet"]');
    for (const tweet of tweets) {
        if (processedTweets.has(tweet.dataset.tweetId)) continue;
        
        await engageWithTweet(tweet);
        processedTweets.add(tweet.dataset.tweetId);
        // Process one tweet at a time to maintain delay
        break;
    }
}

// Get tweet text for commenting - improved extraction
function getTweetText(tweet) {
    // Try multiple selectors to find tweet text
    const selectors = [
        '[data-testid="tweetText"]',
        '[lang] span',
        '.css-901oao.css-16my406.r-poiln3.r-bcqeeo.r-qvutc0'
    ];
    
    for (const selector of selectors) {
        const textElement = tweet.querySelector(selector);
        if (textElement && textElement.textContent.trim()) {
            console.log('Found tweet text:', textElement.textContent.trim());
            return textElement.textContent.trim();
        }
    }
    
    // Fallback: try to get any text content from the tweet
    const tweetBody = tweet.querySelector('[data-testid="tweetText"]')?.parentElement;
    if (tweetBody) {
        const text = tweetBody.textContent.trim();
        console.log('Fallback tweet text:', text);
        return text.length > 10 ? text : '';
    }
    
    console.log('No tweet text found');
    return '';
}

// Engage with a tweet (like and/or comment)
async function engageWithTweet(tweet) {
    try {
        // Make sure tweet is fully visible
        tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(1000);

        // Verify tweet is in viewport before proceeding
        const rect = tweet.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
            console.log('Tweet not fully visible in viewport, skipping...');
            return false;
        }

        let actionTaken = false;

        // Always like if enabled
        if (settings.enableLiking) {
            console.log('Liking tweet...');
            const liked = await likePost(tweet);
            if (liked) actionTaken = true;
        }

        // Comment randomly (every 2nd or 3rd tweet) if enabled
        if (settings.enableCommenting && shouldComment()) {
            console.log('Commenting on tweet...');
            const commented = await commentOnPost(tweet);
            if (commented) actionTaken = true;
        }

        if (actionTaken) {
            updateLastActionTime();
            // Wait 30 seconds between tweet interactions
            await delay(30000 + Math.random() * 5000); // 30-35 seconds
        }

        return actionTaken;
    } catch (error) {
        console.error('Error engaging with tweet:', error);
        return false;
    }
}

// Determine if we should comment on this tweet (random 2nd or 3rd tweet)
function shouldComment() {
    // Comment on roughly every 2nd or 3rd tweet (33-50% chance)
    return Math.random() < 0.4;
}

// Check if enough time has passed since last action
function canPerformAction() {
    const now = Date.now();
    const baseDelay = 5 * 1000; // 5 seconds
    const requiredDelay = baseDelay + (Math.random() * 5000);
    
    return (now - lastActionTime) >= requiredDelay;
}

// Update the last action timestamp
function updateLastActionTime() {
    lastActionTime = Date.now();
}

// Simulate human-like mouse movement
function simulateMouseMovement(element) {
    return new Promise((resolve) => {
        const rect = element.getBoundingClientRect();
        const targetX = rect.left + rect.width / 2;
        const targetY = rect.top + rect.height / 2;
        
        const startX = Math.random() * window.innerWidth;
        const startY = Math.random() * window.innerHeight;
        
        const cp1x = startX + (Math.random() * 100 - 50);
        const cp1y = startY + (Math.random() * 100 - 50);
        const cp2x = targetX + (Math.random() * 100 - 50);
        const cp2y = targetY + (Math.random() * 100 - 50);
        
        let progress = 0;
        const duration = Math.random() * 500 + 500;
        const startTime = performance.now();
        
        function animate(currentTime) {
            progress = (currentTime - startTime) / duration;
            
            if (progress >= 1) {
                dispatchMouseEvent(element, 'mousemove', targetX, targetY);
                resolve();
                return;
            }
            
            const t = progress;
            const u = 1 - t;
            const tt = t * t;
            const uu = u * u;
            const uuu = uu * u;
            const ttt = tt * t;
            
            const x = uuu * startX + 3 * uu * t * cp1x + 3 * u * tt * cp2x + ttt * targetX;
            const y = uuu * startY + 3 * uu * t * cp1y + 3 * u * tt * cp2y + ttt * targetY;
            
            dispatchMouseEvent(element, 'mousemove', x, y);
            requestAnimationFrame(animate);
        }
        
        requestAnimationFrame(animate);
    });
}

// Dispatch a mouse event
function dispatchMouseEvent(element, eventType, x, y) {
    const event = new MouseEvent(eventType, {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y
    });
    element.dispatchEvent(event);
}

// Like a post
async function likePost(tweet) {
    const likeButton = tweet.querySelector('[data-testid="like"]');
    if (!likeButton) {
        console.log('Like button not found, retrying...');
        await delay(1000);
        const retryLikeButton = tweet.querySelector('[data-testid="like"]');
        if (!retryLikeButton) {
            console.log('Like button still not found, skipping tweet');
            return false;
        }
    }

    // Check if already liked
    const isLiked = tweet.querySelector('[data-testid="unlike"]');
    if (isLiked) {
        console.log('Tweet already liked, skipping');
        processedLikes++;
        updateCounterDisplay();
        return true;
    }

    try {
        await simulateMouseMovement(likeButton);
        await delay(Math.random() * 200 + 100);
        
        likeButton.click();
        
        // Verify the like was successful
        await delay(1000);
        const verifyLiked = tweet.querySelector('[data-testid="unlike"]');
        if (verifyLiked) {
            console.log('Like confirmed successful');
            processedLikes++;
            updateCounterDisplay();
            return true;
        } else {
            console.log('Like may have failed');
            return false;
        }
    } catch (error) {
        console.error('Error while liking:', error);
        return false;
    }
}

// Comment on a post - FIXED VERSION
async function commentOnPost(tweet) {
    try {
        console.log('Starting comment process...');
        
        // Get tweet text first
        const tweetText = getTweetText(tweet);
        if (!tweetText) {
            console.log('Could not extract tweet text, skipping comment');
            return false;
        }

        console.log('Tweet text extracted:', tweetText);

        // Find and click reply button
        const replyButton = tweet.querySelector('[data-testid="reply"]');
        if (!replyButton) {
            console.log('Reply button not found');
            return false;
        }

        console.log('Clicking reply button...');
        await simulateMouseMovement(replyButton);
        await delay(Math.random() * 200 + 100);
        
        replyButton.click();
        await delay(2000); // Wait for reply dialog to load and auto-focus

        // Store current tweet reference for later use
        currentTweetForComment = tweet;

        // Request AI-generated reply
        console.log('Requesting AI reply from Groq...');
        chrome.runtime.sendMessage({
            type: 'groqApiRequest',
            data: {
                prompt: `Generate a short, natural, and engaging reply to this tweet: "${tweetText}"\n\nRequirements:\n- Keep it under 200 characters\n- Sound like a real person\n- Be relevant to the tweet content\n- Use casual language\n- Don't use hashtags or mentions\n\nReply:`
            }
        });

        return true;
    } catch (error) {
        console.error('Error in commentOnPost:', error);
        return false;
    }
}

// Handle Groq API response - FIXED VERSION
async function handleGroqResponse(reply) {
    try {
        console.log('Received AI reply:', reply);
        
        // Wait a bit to ensure dialog is fully loaded and focused
        await delay(1500);
        
        // Since the input is auto-focused after clicking reply, we can directly type
        console.log('Typing reply using document.execCommand...');
        
        // Method 1: Use document.execCommand (works with focused inputs)
        document.execCommand('insertText', false, reply.trim());
        
        await delay(500);
        
        // Method 2: Fallback - simulate typing if execCommand doesn't work
        if (document.activeElement && document.activeElement.textContent !== reply.trim()) {
            console.log('Fallback: Simulating keyboard input...');
            await simulateTyping(reply.trim());
        }
        
        await delay(1000);

        // Find and click the Reply/Post button
        const replySubmitButton = findReplyButton();
        
        if (!replySubmitButton) {
            console.log('Reply submit button not found');
            await handleCommentError();
            return;
        }

        // Click the reply button
        console.log('Clicking reply submit button...');
        await simulateMouseMovement(replySubmitButton);
        await delay(Math.random() * 200 + 100);
        
        replySubmitButton.click();
        
        // Wait and verify comment was posted
        await delay(3000);
        
        processedComments++;
        updateCounterDisplay();
        console.log('Comment posted successfully!');
        
    } catch (error) {
        console.error('Error handling Groq response:', error);
        await handleCommentError();
    }
}

// Find reply/post button with multiple fallbacks
function findReplyButton() {
    // Try different selectors and text content
    const buttonSelectors = [
        '[data-testid="tweetButton"]',
        '[data-testid="tweetButtonInline"]',
        'button[type="submit"]',
        'button'
    ];
    
    for (const selector of buttonSelectors) {
        const buttons = document.querySelectorAll(selector);
        for (const button of buttons) {
            const buttonText = button.textContent.toLowerCase();
            if (buttonText.includes('reply') || 
                buttonText.includes('post') || 
                buttonText.includes('tweet')) {
                return button;
            }
        }
    }
    
    return null;
}

// Simulate typing for fallback
async function simulateTyping(text) {
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        // Create and dispatch keyboard events
        const keydownEvent = new KeyboardEvent('keydown', {
            key: char,
            bubbles: true,
            cancelable: true
        });
        
        const keyupEvent = new KeyboardEvent('keyup', {
            key: char,
            bubbles: true,
            cancelable: true
        });
        
        const inputEvent = new InputEvent('input', {
            data: char,
            bubbles: true,
            cancelable: true
        });
        
        document.activeElement.dispatchEvent(keydownEvent);
        document.activeElement.dispatchEvent(inputEvent);
        document.activeElement.dispatchEvent(keyupEvent);
        
        await delay(Math.random() * 50 + 30); // Random delay between keystrokes
    }
}

// Type reply using multiple methods for better compatibility
async function typeReply(element, text) {
    try {
        // Method 1: Direct text setting
        element.textContent = text;
        element.innerHTML = text;
        
        // Method 2: Simulate typing events
        element.dispatchEvent(new Event('focus', { bubbles: true }));
        element.dispatchEvent(new Event('click', { bubbles: true }));
        
        // Method 3: Character by character input simulation
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            
            // Simulate keydown
            const keydownEvent = new KeyboardEvent('keydown', {
                key: char,
                code: `Key${char.toUpperCase()}`,
                bubbles: true
            });
            element.dispatchEvent(keydownEvent);
            
            // Add character
            element.textContent = text.substring(0, i + 1);
            
            // Simulate input event
            const inputEvent = new Event('input', { bubbles: true });
            element.dispatchEvent(inputEvent);
            
            // Simulate keyup
            const keyupEvent = new KeyboardEvent('keyup', {
                key: char,
                code: `Key${char.toUpperCase()}`,
                bubbles: true
            });
            element.dispatchEvent(keyupEvent);
            
            await delay(Math.random() * 50 + 30); // Random delay between keystrokes
        }
        
        // Final events
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        
    } catch (error) {
        console.error('Error typing reply:', error);
    }
}

// Handle comment errors
async function handleCommentError() {
    console.log('Handling comment error, closing any open dialogs...');
    
    // Try to close any open modal/dialog
    const closeButtons = document.querySelectorAll('[aria-label="Close"], [data-testid="app-bar-close"]');
    for (const button of closeButtons) {
        try {
            button.click();
            await delay(500);
        } catch (e) {
            // Ignore errors
        }
    }
    
    // Press Escape key to close dialogs
    document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true
    }));
    
    await delay(1000);
}

// Utility delay function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Create counter display
function createCounterDisplay() {
    // Check if the counter already exists to prevent duplicates
    if (document.getElementById('replyx-counter')) {
        console.log('Counter display already exists.');
        return;
    }

    const counter = document.createElement('div');
    counter.id = 'replyx-counter';
    counter.style.cssText = `
        position: fixed;
        width: auto; /* Change to auto for content-based width */
        max-width: 280px; /* Set a maximum width */
        min-width: 150px; /* Ensure it's not too small */
        min-height: 60px;
        bottom: 14px;
        right: 14px;
        background: rgba(0,0,0,0.8);
        border-radius: 10px;
        color: #fff;
        text-align: left; /* Align text to left for better readability if multiple lines */
        padding: 15px;
        z-index: 10000; /* Increment z-index to be even more sure */
        font-family: Arial, sans-serif;
        font-size: 13px; /* Slightly smaller font for compactness */
        line-height: 1.5;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); /* Add a subtle shadow for better visibility */
        transition: opacity 0.3s ease-in-out; /* Smooth transition for appearance/disappearance */
    `;
    document.body.appendChild(counter);
    updateCounterDisplay();
    console.log('Counter display created.');
}

// Ensure the counter is updated when automation is toggled
// and removed when disabled.
function toggleAutomation(enabled) {
    automationEnabled = enabled;
    console.log('Automation toggled:', enabled);
    
    if (enabled) {
        createCounterDisplay(); // This will now check for existence
        startAutomation();
    } else {
        const counter = document.getElementById('replyx-counter');
        if (counter) {
            counter.style.opacity = '0'; // Fade out
            setTimeout(() => {
                counter.remove();
                console.log('Counter display removed.');
            }, 300); // Wait for fade out
        }
        stopAutomation();
    }
}

// Update counter display
function updateCounterDisplay() {
    const counter = document.getElementById('replyx-counter');
    if (counter) {
        counter.innerHTML = `
            <div><strong>ReplyX Bot Status</strong></div>
            <div>Tweets: ${totalTweets}</div>
            <div>Likes: ${processedLikes}</div>
            <div>Comments: ${processedComments}</div>
        `;
    }
}

// // Toggle automation
// function toggleAutomation(enabled) {
//     automationEnabled = enabled;
//     console.log('Automation toggled:', enabled);
    
//     if (enabled) {
//         createCounterDisplay();
//         startAutomation();
//     } else {
//         const counter = document.getElementById('replyx-counter');
//         if (counter) counter.remove();
//         stopAutomation();
//     }
// }

// Start automation process
function startAutomation() {
    if (automationInterval) return;
    
    console.log('Starting automation...');
    window.scrollTo(0, 0);
    
    setTimeout(() => {
        runAutomation();
    }, 2000);
    
    automationInterval = setInterval(() => {
        if (!isRunning) {
            console.log('Checking for new tweets...');
            runAutomation();
        }
    }, 10000); // Check every 10 seconds
}

// Stop automation process
function stopAutomation() {
    if (automationInterval) {
        clearInterval(automationInterval);
        automationInterval = null;
    }
    isRunning = false;
    console.log('Automation stopped');
}

// Run a single automation cycle
async function runAutomation() {
    if (!settings || isRunning || !automationEnabled) return;
    
    isRunning = true;
    console.log('Running automation cycle...');
    
    try {
        let processedAnyTweet = false;
        
        const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'))
            .filter(tweet => {
                const rect = tweet.getBoundingClientRect();
                return rect.height > 0 && rect.width > 0;
            });

        console.log(`Found ${tweets.length} visible tweets`);
        totalTweets = tweets.length;
        updateCounterDisplay();
        
        for (const tweet of tweets) {
            if (!tweet.dataset.tweetId) {
                tweet.dataset.tweetId = `tweet_${Date.now()}_${Math.random()}`;
            }

            if (processedTweets.has(tweet.dataset.tweetId)) {
                continue;
            }
            
            console.log('Processing new tweet...');
            
            try {
                tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await delay(2000);
                
                const rect = tweet.getBoundingClientRect();
                if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
                    const success = await engageWithTweet(tweet);
                    if (success) {
                        processedTweets.add(tweet.dataset.tweetId);
                        processedAnyTweet = true;
                        console.log('Successfully processed tweet');
                        break; // Process one tweet at a time
                    }
                } else {
                    console.log('Tweet not properly in viewport after scroll');
                }
            } catch (error) {
                console.error('Error processing tweet:', error);
            }
        }
        
        if (!processedAnyTweet) {
            console.log('No new tweets processed, scrolling for more...');
            const scrolled = await smoothScroll();
        
            if (!scrolled) {
                console.log('Reached end of feed, refreshing page...');
                totalTweets = 0;
                processedLikes = 0;
                processedComments = 0;
                updateCounterDisplay();
                processedTweets.clear();
                setTimeout(() => {
                    window.location.reload();
                }, 5000);
            }
        }
    } catch (error) {
        console.error('Error in automation cycle:', error);
    } finally {
        isRunning = false;
    }
}

// Smooth scroll function
async function smoothScroll() {
    console.log('Scrolling for more tweets...');
    const scrollHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
    );
    const viewportHeight = window.innerHeight;
    const scrollAmount = viewportHeight / 2;
    
    const currentScroll = window.scrollY;
    const targetScroll = Math.min(currentScroll + scrollAmount, scrollHeight - viewportHeight);
    
    if (currentScroll < scrollHeight - viewportHeight) {
        await new Promise((resolve) => {
            let start = null;
            const duration = 1000;

            function step(timestamp) {
                if (!start) start = timestamp;
                const progress = (timestamp - start) / duration;

                if (progress < 1) {
                    const ease = 1 - Math.pow(1 - progress, 3);
                    window.scrollTo(0, currentScroll + (targetScroll - currentScroll) * ease);
                    requestAnimationFrame(step);
                } else {
                    window.scrollTo(0, targetScroll);
                    resolve();
                }
            }

            requestAnimationFrame(step);
        });
        
        await delay(3000); // Wait longer for new content to load
        return true;
    }
    return false;
}

// Initialize automation state
async function initializeAutomation() {
    const stored = await chrome.storage.sync.get(['automationEnabled']);
    if (stored.automationEnabled) {
        toggleAutomation(true);
    }
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
    initialize();
    initializeAutomation();
});

// Also initialize immediately if DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initialize();
        initializeAutomation();
    });
} else {
    initialize();
    initializeAutomation();
}