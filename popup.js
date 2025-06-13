document.addEventListener('DOMContentLoaded', function() {
    // Load saved settings
    chrome.storage.sync.get([
        'groqApiKey',
        'groqModel',
        'enableLiking',
        'enableCommenting',
        'automationEnabled',
    ], function(items) {
        // Set values for input fields, using saved settings or defaults
        document.getElementById('groqApiKey').value = items.groqApiKey || '';
        document.getElementById('groqModel').value = items.groqModel || 'llama-3.3-70b-versatile';
        // document.getElementById('keywords').value = items.keywords || '';
        // document.getElementById('minDelay').value = items.minDelay || 5;
        // document.getElementById('maxDelay').value = items.maxDelay || 15;
        document.getElementById('enableLiking').checked = items.enableLiking !== false; // Default to true if not set
        document.getElementById('enableCommenting').checked = items.enableCommenting !== false; // Default to true if not set
        document.getElementById('automationToggle').checked = items.automationEnabled || false; // Default to false
        
        // Update the visual status of the automation toggle
        updateToggleStatus(items.automationEnabled || false);
    });

    // Save settings when the save button is clicked
    document.getElementById('saveSettings').addEventListener('click', function() {
        // Gather all settings from the input fields
        const settings = {
            groqApiKey: document.getElementById('groqApiKey').value,
            groqModel: document.getElementById('groqModel').value,
            // keywords: document.getElementById('keywords').value,
            // minDelay: parseInt(document.getElementById('minDelay').value), // Convert to integer
            // maxDelay: parseInt(document.getElementById('maxDelay').value), // Convert to integer
            enableLiking: document.getElementById('enableLiking').checked,
            enableCommenting: document.getElementById('enableCommenting').checked,
            automationEnabled: document.getElementById('automationToggle').checked
        };

        // Validate settings before saving
        if (!settings.groqApiKey) {
            showStatus('Please enter your Groq API key', false);
            return; // Stop if validation fails
        }

        // if (settings.minDelay >= settings.maxDelay) {
        //     showStatus('Min delay must be less than max delay', false);
        //     return; // Stop if validation fails
        // }

        // Save validated settings to Chrome's synchronized storage
        chrome.storage.sync.set(settings, function() {
            showStatus('Settings saved successfully!', true);
            
            // Notify the background script that settings have been updated
            chrome.runtime.sendMessage({
                type: 'settingsUpdated',
                settings: settings
            });
        });
    });

    // Handle changes to the automation toggle
    document.getElementById('automationToggle').addEventListener('change', function(e) {
        const isEnabled = e.target.checked; // Get the current state of the toggle
        updateToggleStatus(isEnabled); // Update visual status

        // Save the automation enabled state to Chrome's synchronized storage
        chrome.storage.sync.set({ automationEnabled: isEnabled }, function() {
            // Notify the background script about the automation toggle change
            chrome.runtime.sendMessage({
                type: 'automationToggle',
                enabled: isEnabled
            });
        });
    });
});

// Function to display status messages to the user
function showStatus(message, isSuccess) {
    const status = document.getElementById('status');
    status.textContent = message; // Set the message text
    status.style.display = 'block'; // Make the status message visible
    status.className = isSuccess ? 'success' : 'error'; // Apply success or error styling
    
    // Hide the status message after 3 seconds
    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}

// Function to update the visual text and color for the automation toggle status
function updateToggleStatus(enabled) {
    document.getElementById('toggleStatus').textContent = enabled ? 'On' : 'Off'; // Set text to 'On' or 'Off'
    document.getElementById('toggleStatus').style.color = enabled ? '#1da1f2' : '#666'; // Set color (blue for 'On', grey for 'Off')
}