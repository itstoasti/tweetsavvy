let selectedFile = null;

document.addEventListener('DOMContentLoaded', function () {
  // Initialize all necessary DOM elements and event listeners
  const apiKeyInput = document.getElementById('api-key');
  const validateButton = document.getElementById('validate-button');
  const modelsSelect = document.getElementById('models-select');
  const showApiKeyCheckbox = document.getElementById('show-api-key');
  const windowCloseCheckbox = document.getElementById('window-close');
  const gptQueryReply = document.getElementById('gpt-query-reply');
  const postPrompt = document.getElementById('post-prompt');
  const generatePostButton = document.getElementById('generate-post');
  const toggleDarkModeButton = document.getElementById('toggle-dark-mode');
  const saveEditButton = document.getElementById('save-edit-button');
  const cancelEditButton = document.getElementById('cancel-edit-button');
  const scheduledPostsList = document.getElementById('scheduled-posts-list');
  const extensionShortcutsButton = document.getElementById('extension-shortcuts-button');
  const scheduleCustomPostButton = document.getElementById('schedule-custom-post');
  const customPostContent = document.getElementById('custom-post-content');
  const customPostScheduleDateTime = document.getElementById('custom-post-schedule-datetime');
  const postTypeToggle = document.getElementById('post-type-toggle');
  const aiPostSection = document.getElementById('ai-post-section');
  const customPostSection = document.getElementById('custom-post-section');
  const mediaUpload = document.getElementById('media-upload');

  // Event listener for media file upload
  if (mediaUpload) {
    const mediaStatusElement = document.createElement('p');
    mediaStatusElement.id = 'media-status';
    mediaUpload.parentNode.insertBefore(mediaStatusElement, mediaUpload.nextSibling);

    mediaUpload.addEventListener('change', function (event) {
      const file = event.target.files[0];
      if (file) {
        selectedFile = file;
        mediaStatusElement.textContent = `Media selected: ${file.name}`;
        console.log(`Media file selected: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);
      } else {
        selectedFile = null;
        mediaStatusElement.textContent = '';
        console.log('No media file selected');
      }
    });
  }

  // Toggle between AI and custom post sections
  if (postTypeToggle) {
    postTypeToggle.addEventListener('change', function () {
      if (postTypeToggle.checked) {
        aiPostSection.classList.remove('hidden');
        customPostSection.classList.add('hidden');
      } else {
        aiPostSection.classList.add('hidden');
        customPostSection.classList.remove('hidden');
      }
    });
  }

  // API key and model selection handlers
  if (apiKeyInput) {
    apiKeyInput.addEventListener('change', function () {
      const value = apiKeyInput.value;
      chrome.storage.local.set({ 'open-ai-key': value }).then(() => {
        console.log("New API key saved");
      });
      validateApiKey();
    });
  }

  if (validateButton) {
    validateButton.addEventListener('click', validateApiKey);
  }

  if (modelsSelect) {
    modelsSelect.addEventListener('change', function () {
      const value = modelsSelect.value;
      chrome.storage.local.set({ 'openai-model': value }).then(() => {
        console.log("New OpenAI model saved");
      });
    });
  }

  // API key visibility toggle
  if (showApiKeyCheckbox) {
    showApiKeyCheckbox.addEventListener('click', function () {
      const isChecked = showApiKeyCheckbox.checked;
      apiKeyInput.setAttribute('type', isChecked ? 'text' : 'password');
    });
  }

  // Toggle automatic window close option
  if (windowCloseCheckbox) {
    windowCloseCheckbox.addEventListener('click', function () {
      const isChecked = windowCloseCheckbox.checked;
      chrome.storage.local.set({ 'automatic-window-close': isChecked }).then(() => {
        console.log("Automatic window close " + (isChecked ? "enabled" : "disabled"));
      });
    });
  }

  // GPT query reply setting
  if (gptQueryReply) {
    gptQueryReply.addEventListener('change', function () {
      const value = gptQueryReply.value;
      chrome.storage.local.set({ 'gpt-query-reply': value }).then(() => {
        console.log("New GPT query saved for reply tab");
      });
    });
  }

  // Event listener for generating posts
  if (generatePostButton) {
    generatePostButton.addEventListener('click', async function () {
      const prompt = postPrompt.value;
      const scheduleDateTime = document.getElementById('schedule-datetime').value;

      let mediaBase64, mediaType;
      if (selectedFile) {
        try {
          mediaBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error("Failed to read file"));
            reader.readAsDataURL(selectedFile);
          });
          mediaType = selectedFile.type.startsWith('image/') ? 'image' : 'video';
          console.log("Media processed successfully:", { type: mediaType, size: selectedFile.size });
        } catch (error) {
          console.error("Error processing media file:", error);
          alert("Failed to process media file. Please try again.");
          return;
        }
      } else {
        console.log("No media file selected");
      }

      if (!postTypeToggle.checked) {
        // Handle custom (non-AI) posts
        const content = customPostContent.value;
        if (!content) {
          alert('Please enter post content.');
          return;
        }

        if (scheduleDateTime) {
          scheduleCustomPost(content, scheduleDateTime, mediaBase64, mediaType);
        } else {
          console.log("Preparing to post custom content immediately:", {
            content: content,
            hasMedia: !!mediaBase64,
            mediaType: mediaType
          });

          chrome.storage.local.set({ 'custom-post': content, 'media-base64': mediaBase64, 'media-type': mediaType }).then(() => {
            console.log("Custom post saved with media:", { content, mediaType });
            chrome.tabs.create({ url: 'https://x.com/compose/tweet' }, function (tab) {
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: insertPostContentWithMedia,
                args: [content, mediaBase64, mediaType]
              });
            });
          });

          alert("Post created! Redirecting to Twitter to post it.");
        }
      } else {
        // Handle AI-generated posts
        if (!prompt) {
          alert('Please enter a prompt for the AI.');
          return;
        }

        if (scheduleDateTime) {
          const generatedPost = await generatePost(prompt);
          if (generatedPost) {
            scheduleCustomPost(generatedPost, scheduleDateTime, mediaBase64, mediaType, 'ai', prompt);
          }
        } else {
          const generatedPost = await generatePost(prompt);
          if (generatedPost) {
            console.log("Preparing to post AI-generated content immediately:", {
              generatedPost: generatedPost,
              hasMedia: !!mediaBase64,
              mediaType: mediaType
            });

            chrome.storage.local.set({ 'generated-post': generatedPost, 'media-base64': mediaBase64, 'media-type': mediaType }).then(() => {
              console.log("Generated post saved with media:", { generatedPost, mediaType });
              chrome.tabs.create({ url: 'https://x.com/compose/tweet' }, function (tab) {
                chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: insertPostContentWithMedia,
                  args: [generatedPost, mediaBase64, mediaType]
                });
              });
            });

            alert("Post generated! Redirecting to Twitter to post it.");
          }
        }
      }
    });
  }

  // Event listener for scheduling custom posts
  if (scheduleCustomPostButton) {
    scheduleCustomPostButton.addEventListener('click', function () {
      const content = customPostContent.value;
      const scheduleTime = customPostScheduleDateTime.value;

      console.log("Custom post scheduling initiated");
      console.log("Content:", content);
      console.log("Schedule time:", scheduleTime);
      console.log("Selected file:", selectedFile);

      if (!content || !scheduleTime) {
        console.log("Missing content or schedule time");
        alert('Please enter post content and select a schedule time.');
        return;
      }

      if (selectedFile) {
        const reader = new FileReader();
        reader.onload = function (e) {
          const mediaBase64 = e.target.result;
          const mediaType = selectedFile.type.startsWith('image/') ? 'image' : 'video';
          console.log("Media processed successfully:", { type: mediaType, size: selectedFile.size });

          scheduleCustomPost(content, scheduleTime, mediaBase64, mediaType);
        };
        reader.readAsDataURL(selectedFile);
      } else {
        console.log("No media file selected for custom post");
        scheduleCustomPost(content, scheduleTime);
      }
    });
  }

  // Toggle dark mode
  if (toggleDarkModeButton) {
    toggleDarkModeButton.addEventListener('click', function () {
      const body = document.body;
      const currentMode = body.classList.contains('dark-mode') ? 'dark-mode' : 'light-mode';
      const newMode = currentMode === 'dark-mode' ? 'light-mode' : 'dark-mode';

      body.classList.remove(currentMode);
      body.classList.add(newMode);

      chrome.storage.local.set({ 'theme-mode': newMode }, () => {
        console.log(`Theme mode set to ${newMode}`);
      });
    });
  }

  if (saveEditButton) {
    saveEditButton.addEventListener('click', saveEditedPost);
  }

  if (cancelEditButton) {
    cancelEditButton.addEventListener('click', function () {
      document.getElementById('edit-post-modal').style.display = 'none';
    });
  }

  // Tab switching logic
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', function () {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(tab.getAttribute('data-tab')).classList.add('active');
    });
  });

  // Set default GPT query if present
  chrome.storage.local.get(['gpt-query-reply']).then((result) => {
    const query = result['gpt-query-reply'] || "You are a friendly ghostwriter. Reply to the user's tweets by talking directly to the person. Keep it short and casual, and exclude hashtags.";
    if (gptQueryReply) gptQueryReply.value = query;
  });

  // Set default post prompt if not already set
  chrome.storage.local.get(['post-prompt']).then((result) => {
    const prompt = result['post-prompt'] || "You are a social media content creator. Create an engaging tweet. Exclude hashtags.";
    if (postPrompt) postPrompt.value = prompt;
  });

  chrome.storage.local.get(['open-ai-key']).then((result) => {
    const apiKey = result['open-ai-key'];
    if (apiKeyInput) {
      apiKeyInput.value = apiKey || '';
    }
    if (apiKey == undefined) {
      if (validateButton) {
        validateButton.classList.add('default');
        validateButton.classList.remove('valid');
        validateButton.classList.remove('invalid');
      }
      if (modelsSelect) {
        modelsSelect.disabled = true;
      }
    } else {
      validateApiKey();
    }
  });

  chrome.storage.local.get(['openai-model']).then((result) => {
    const model = result['openai-model'] || 'gpt-3.5-turbo';
    if (modelsSelect) {
      const defaultOption = document.createElement('option');
      defaultOption.value = model;
      defaultOption.text = model;
      defaultOption.selected = true;
      modelsSelect.appendChild(defaultOption);
    }
  });

  chrome.storage.local.get(['automatic-window-close']).then((result) => {
    const isChecked = result['automatic-window-close'];
    if (windowCloseCheckbox) {
      if (isChecked == undefined) {
        windowCloseCheckbox.checked = true;
        chrome.storage.local.set({ 'automatic-window-close': true }).then(() => {
          console.log("Automatic window close enabled");
        });
      } else {
        windowCloseCheckbox.checked = isChecked;
      }
    }
  });

  // Filter and display only the specific shortcut
  chrome.commands.getAll().then((commands) => {
    console.log(commands);
    if (extensionShortcutsButton) {
      const shortcutsContainer = document.getElementById("shortcut-container");
      if (shortcutsContainer) {
        commands.forEach(shortcut => {
          if (shortcut.shortcut === "Ctrl+Shift+L" && shortcut.description === "Generate reply for tweets.") {
            const shortcutElement = document.createElement("li");
            shortcutElement.classList.add("shortcut");
            shortcutElement.innerHTML = `
              <span class="shortcut-key">${shortcut.shortcut}</span> ${shortcut.description}
            `;
            shortcutsContainer.appendChild(shortcutElement);
          }
        });
      }
    }
  });

  if (extensionShortcutsButton) {
    extensionShortcutsButton.addEventListener("click", function () {
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    });
  }

  // Add event listeners for tone buttons
  const toneButtonsReply = document.querySelectorAll('#tone-buttons-reply .tone-button');

  function addToneButtonListeners(buttons, queryInputId, storageKey) {
    buttons.forEach(button => {
      button.addEventListener('click', function () {
        const selectedTone = button.getAttribute('data-tone');
        let newQuery;

        switch (selectedTone) {
          case 'professional':
            newQuery = "You are a professional advisor. Reply to the user's tweets with professional and insightful comments. Keep it concise and exclude hashtags.";
            break;
          case 'humor':
            newQuery = "You are a witty comedian. Reply to the user's tweets with humor and clever jokes. Keep it concise and exclude hashtags.";
            break;
          case 'formal':
            newQuery = "You are a formal spokesperson. Reply to the user's tweets with utmost formality and politeness. Keep it concise and exclude hashtags.";
            break;
          default:
            newQuery = "You are a friendly ghostwriter. Reply to the user's tweets by talking directly to the person. Keep it short and casual, and exclude hashtags.";
        }

        chrome.storage.local.set({ [storageKey]: newQuery, [`selected-tone-${storageKey}`]: selectedTone }).then(() => {
          const queryInput = document.getElementById(queryInputId);
          if (queryInput) {
            queryInput.value = newQuery;
          }
          console.log("New GPT query set for tone:", selectedTone);
          highlightSelectedTone(buttons, selectedTone);
        });
      });
    });
  }

  function highlightSelectedTone(buttons, selectedTone) {
    buttons.forEach(button => {
      if (button.getAttribute('data-tone') === selectedTone) {
        button.classList.add('selected-tone');
      } else {
        button.classList.remove('selected-tone');
      }
    });
  }

  addToneButtonListeners(toneButtonsReply, 'gpt-query-reply', 'gpt-query-reply');

  chrome.storage.local.get(['selected-tone-gpt-query-reply']).then((result) => {
    const selectedTone = result['selected-tone-gpt-query-reply'] || 'default';
    highlightSelectedTone(toneButtonsReply, selectedTone);
  });

  displayScheduledPosts();

  if (scheduledPostsList) {
    scheduledPostsList.addEventListener('click', function (event) {
      if (event.target.tagName === 'BUTTON') {
        const index = event.target.getAttribute('data-index');
        if (event.target.classList.contains('edit-button')) {
          editScheduledPost(index);
        } else if (event.target.classList.contains('delete-button')) {
          deleteScheduledPost(index);
        }
      }
    });
  }
});

// Function to insert generated post content into Twitter's compose text box
async function insertPostContentWithMedia(content, mediaBase64, mediaType) {
  const maxAttempts = 15;
  let attempts = 0;
  let tweetTextArea = null;
  let fileInput = null;

  // Attempt to upload media if provided
  if (mediaType && mediaBase64) {
    try {
      // Locate the file input element for uploading media
      fileInput = document.querySelector(`input[type="file"][accept^="${mediaType}/"]`);
      if (fileInput) {
        // Convert mediaBase64 to a Blob and File object
        const byteCharacters = atob(mediaBase64.split(',')[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: `${mediaType}/${mediaType === 'image' ? 'png' : 'mp4'}` });
        const file = new File([blob], `upload.${mediaType === 'image' ? 'png' : 'mp4'}`, { type: `${mediaType}/${mediaType === 'image' ? 'png' : 'mp4'}` });

        // Attach file to the input element
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        // Dispatch 'change' event to trigger upload
        const event = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(event);
        console.log(`${mediaType} uploaded successfully.`);
      }
    } catch (error) {
      console.error("Error uploading media:", error);
      return;
    }
  } else {
    console.log("No media to upload.");
  }

  // Attempt to find the tweet text area and insert content
  while (!tweetTextArea && attempts < maxAttempts) {
    tweetTextArea = document.querySelector('div[aria-label="Post text"][role="textbox"]');
    if (tweetTextArea) {
      tweetTextArea.focus();
      tweetTextArea.innerHTML = '';

      const insertText = (text) => {
        text.split('').forEach((char) => {
          const event = new InputEvent('input', {
            inputType: 'insertText',
            data: char,
            bubbles: true,
            cancelable: true
          });
          tweetTextArea.dispatchEvent(event);
        });
      };

      // Remove leading and trailing quotation marks and trim to 280 characters
      const trimmedPost = content.replace(/^["'“”‘’`´«»„”]/g, '').replace(/["'“”‘’`´«»„”]$/g, '').split('\n')[0].slice(0, 280);
      insertText(trimmedPost);

      setTimeout(() => {
        if (tweetTextArea.innerText.trim() !== trimmedPost.trim()) {
          console.error("Text not inserted correctly. Retrying...");
          insertText(trimmedPost);
        } else {
          console.log("Text inserted correctly.");
        }
      }, 500);

      break;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;
  }

  if (!tweetTextArea) {
    console.error("Could not find tweet text area after multiple attempts.");
    return;
  }

  // Attempt to find the post button and submit the tweet
  attempts = 0;
  while (attempts < maxAttempts) {
    const postButton = document.querySelector('div[data-testid="tweetButtonInline"]');
    if (postButton && !postButton.disabled) {
      postButton.click();
      console.log("Post button clicked, tweet submitted.");
      break;
    }
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (attempts === maxAttempts) {
    console.error("Failed to find or enable post button.");
  }
}

// Function to validate API key
async function validateApiKey() {
  const apiKey = document.getElementById('api-key').value;
  const validateButton = document.getElementById('validate-button');
  const selectModels = document.getElementById('models-select');

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (selectModels) {
        selectModels.innerHTML = '';
        data.data.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.text = model.id;
          selectModels.appendChild(option);
        });
      }
      if (validateButton) {
        validateButton.classList.remove('invalid');
        validateButton.classList.add('valid');
        validateButton.classList.remove('default');
      }
      if (selectModels) {
        selectModels.disabled = false;
      }

      // Ensure the default model is set to gpt-3.5-turbo if not set
      chrome.storage.local.get(['openai-model']).then((result) => {
        if (!result['openai-model']) {
          chrome.storage.local.set({ 'openai-model': 'gpt-3.5-turbo' }).then(() => {
            if (selectModels) {
              const defaultOption = document.createElement('option');
              defaultOption.value = 'gpt-3.5-turbo';
              defaultOption.text = 'gpt-3.5-turbo';
              defaultOption.selected = true;
              selectModels.appendChild(defaultOption);
              selectModels.value = 'gpt-3.5-turbo';
            }
          });
        } else {
          selectModels.value = result['openai-model'];
        }
      });
    } else {
      throw new Error('Invalid API key');
    }
  } catch (error) {
    console.error('Error validating API key:', error);
    if (validateButton) {
      validateButton.classList.add('invalid');
      validateButton.classList.remove('valid');
      validateButton.classList.remove('default');
    }
    if (selectModels) {
      selectModels.disabled = true;
    }
  }
}

// Function to display scheduled posts with pagination
function displayScheduledPosts() {
  chrome.storage.local.get(['scheduled-posts'], function (result) {
    const scheduledPosts = result['scheduled-posts'] || [];
    const scheduledPostsList = document.getElementById('scheduled-posts-list');
    if (scheduledPostsList) {
      scheduledPostsList.innerHTML = '';

      // Add pagination controls
      const postsPerPage = 5; // Number of posts per page
      let currentPage = 1;
      const totalPages = Math.ceil(scheduledPosts.length / postsPerPage);

      function renderPosts(page) {
        const startIndex = (page - 1) * postsPerPage;
        const endIndex = startIndex + postsPerPage;
        const postsToDisplay = scheduledPosts.slice(startIndex, endIndex);

        scheduledPostsList.innerHTML = '';

        postsToDisplay.forEach((post, index) => {
          const actualIndex = startIndex + index;
          const listItem = document.createElement('div');
          listItem.className = 'scheduled-post-item bg-white shadow-md rounded-lg p-4 mb-4';
          // Retrieve the post content correctly
          const postContent = post.generatedPost || post.content || "No content available";

          let mediaHtml = '';
          if (post.mediaBase64) {
            if (post.mediaType === 'image') {
              mediaHtml = `<img src="${post.mediaBase64}" alt="Post image" class="w-full h-32 object-cover rounded-t-lg mb-2">`;
            } else if (post.mediaType === 'video') {
              mediaHtml = `<video src="${post.mediaBase64}" class="w-full h-32 object-cover rounded-t-lg mb-2" controls></video>`;
            }
          }

          listItem.innerHTML = `
            ${mediaHtml}
            <p class="text-gray-800 mb-2">${postContent}</p>
            <p class="text-sm text-gray-600 mb-2">Schedule Time: ${new Date(post.scheduleTimestamp).toLocaleString()}</p>
            <div class="flex justify-end">
              <button data-index="${actualIndex}" class="edit-button bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-1 px-2 rounded mr-2">Edit</button>
              <button data-index="${actualIndex}" class="delete-button bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded">Delete</button>
            </div>
          `;
          scheduledPostsList.appendChild(listItem);
        });

        // Update pagination info
        const paginationInfo = document.getElementById('pagination-info');
        if (paginationInfo) {
          paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        }
      }

      function createPaginationControls() {
        // Remove existing pagination controls if they exist
        const existingPaginationContainer = document.getElementById('pagination-container');
        if (existingPaginationContainer) {
          existingPaginationContainer.remove();
        }

        const paginationContainer = document.createElement('div');
        paginationContainer.id = 'pagination-container';
        paginationContainer.className = 'flex justify-between items-center mt-4';
        paginationContainer.innerHTML = `
          <button id="prev-page" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Previous</button>
          <span id="pagination-info" class="text-gray-700"></span>
          <button id="next-page" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Next</button>
        `;
        scheduledPostsList.parentNode.insertBefore(paginationContainer, scheduledPostsList.nextSibling);

        document.getElementById('prev-page').addEventListener('click', () => {
          if (currentPage > 1) {
            currentPage--;
            renderPosts(currentPage);
          }
        });

        document.getElementById('next-page').addEventListener('click', () => {
          if (currentPage < totalPages) {
            currentPage++;
            renderPosts(currentPage);
          }
        });
      }

      createPaginationControls();
      renderPosts(currentPage);
    }
  });
}

// Function to edit a scheduled post
function editScheduledPost(index) {
  chrome.storage.local.get(['scheduled-posts'], function (result) {
    const scheduledPosts = result['scheduled-posts'] || [];
    const post = scheduledPosts[index];
    if (post) {
      document.getElementById('post-content').value = post.content || post.generatedPost || '';
      const scheduleDate = new Date(post.scheduleTimestamp);
      const tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
      const localISOTime = (new Date(scheduleDate - tzoffset)).toISOString().slice(0, -1);
      document.getElementById('edit-scheduled-datetime').value = localISOTime.slice(0, 16);
      document.getElementById('edit-index').value = index;
      document.getElementById('edit-post-modal').style.display = 'block';
    }
  });
}

// Function to save edited post
function saveEditedPost() {
  const index = document.getElementById('edit-index').value;
  const updatedContent = document.getElementById('post-content').value;
  const updatedTimestamp = new Date(document.getElementById('edit-scheduled-datetime').value).getTime();

  chrome.storage.local.get(['scheduled-posts'], function (result) {
    const scheduledPosts = result['scheduled-posts'] || [];
    if (scheduledPosts[index]) {
      if (scheduledPosts[index].type === 'custom') {
        scheduledPosts[index].content = updatedContent;
      } else {
        scheduledPosts[index].generatedPost = updatedContent;
      }
      scheduledPosts[index].scheduleTimestamp = updatedTimestamp;

      chrome.storage.local.set({ 'scheduled-posts': scheduledPosts }, function () {
        console.log('Scheduled post updated');
        document.getElementById('edit-post-modal').style.display = 'none';
        displayScheduledPosts();
      });
    }
  });
}

// Function to delete a scheduled post
function deleteScheduledPost(index) {
  chrome.storage.local.get(['scheduled-posts'], function (result) {
    const scheduledPosts = result['scheduled-posts'] || [];
    scheduledPosts.splice(index, 1);
    chrome.storage.local.set({ 'scheduled-posts': scheduledPosts }, function () {
      displayScheduledPosts();
    });
  });
}

// Function to generate post using OpenAI API
async function generatePost(prompt) {
  const apiKeyResult = await chrome.storage.local.get(['open-ai-key']);
  const modelResult = await chrome.storage.local.get(['openai-model']);

  const apiKey = apiKeyResult['open-ai-key'];
  const model = modelResult['openai-model'] || 'gpt-3.5-turbo';

  if (!apiKey || !model) {
    alert("Please make sure to set your API key and model.");
    return;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        "messages": [
          { role: "system", 'content': "You are a social media content creator. Create an engaging tweet. Exclude hashtags. Make sure your response is less than 280 characters." },
          { role: "user", 'content': prompt }
        ],
        model: model,
        temperature: 1,
        max_tokens: 256,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      })
    });

    if (response.ok) {
      const resp = await response.json();
      let generatedPost = resp.choices[0].message.content;

      // Ensure the post is within the Twitter character limit
      if (generatedPost.length > 280) {
        generatedPost = truncateToLastSentence(generatedPost, 280);
      }

      // Ensure only one post is generated
      generatedPost = filterGeneratedPost(generatedPost);

      return generatedPost;
    } else {
      const errorText = await response.text();
      console.error("Error generating post:", errorText);
      alert("Failed to generate post. Please try again.");
    }
  } catch (error) {
    console.error("Error generating post:", error);
    alert("An error occurred while generating the post. Please try again.");
  }
}

// Helper function to truncate text to the last complete sentence under the character limit
function truncateToLastSentence(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  const sentences = text.split('. ');
  let truncatedText = '';

  for (let sentence of sentences) {
    if ((truncatedText + sentence).length > maxLength) {
      break;
    }
    truncatedText += sentence + '. ';
  }

  return truncatedText.trim();
}

// Helper function to filter out multiple posts and ensure only one post is returned
function filterGeneratedPost(text) {
  const postParts = text.split(/\n\s*\n/);
  if (postParts.length > 1) {
    return postParts[0].trim();
  }
  return text.trim();
}

// Function to post the scheduled post
function postScheduledPost(post) {
  const content = post.content || post.generatedPost;
  const mediaBase64 = post.mediaBase64;
  const mediaType = post.mediaType;

  if (!content) {
    console.error('Missing post content.');
    return;
  }

  chrome.tabs.create({ url: 'https://x.com/compose/tweet' }, function (tab) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: insertPostContentWithMedia,
      args: [content, mediaBase64, mediaType]
    });
  });

  alert("Post created! Redirecting to Twitter to post it.");
}

// Automatically post scheduled posts at the right time
function checkAndPostScheduledPosts() {
  chrome.storage.local.get(['scheduled-posts'], function (result) {
    const scheduledPosts = result['scheduled-posts'] || [];
    const now = Date.now();

    const postsToProcess = scheduledPosts.filter(post => post.scheduleTimestamp <= now);

    // Process non-AI posts immediately
    const customPostsToPost = postsToProcess.filter(post => post.type !== 'ai');
    customPostsToPost.forEach(post => {
      postScheduledPost(post);
      const index = scheduledPosts.indexOf(post);
      scheduledPosts.splice(index, 1);
    });

    // Generate and process AI posts
    const aiPostsToGenerate = postsToProcess.filter(post => post.type === 'ai' && !post.generatedPost);
    const generatedPostsPromises = aiPostsToGenerate.map(async (post) => {
      post.generatedPost = await generatePost(post.prompt);
      return post;
    });

    Promise.all(generatedPostsPromises).then((generatedPosts) => {
      generatedPosts.forEach(post => {
        postScheduledPost(post);
        const index = scheduledPosts.indexOf(post);
        scheduledPosts.splice(index, 1);
      });

      chrome.storage.local.set({ 'scheduled-posts': scheduledPosts }, function () {
        displayScheduledPosts();
      });
    });
  });
}

// Check and post scheduled posts every minute
setInterval(checkAndPostScheduledPosts, 60000);

// Function to schedule a custom post
function scheduleCustomPost(content, scheduleTime, mediaBase64, mediaType, type = 'custom', prompt = null) {
  const post = {
    type: type,
    content: content,
    mediaBase64: mediaBase64,
    mediaType: mediaType,
    scheduleTimestamp: new Date(scheduleTime).getTime(),
    prompt: prompt
  };

  console.log("Scheduling post:", {
    type: type,
    content: content,
    hasMedia: !!mediaBase64,
    mediaType: mediaType,
    scheduleTimestamp: new Date(scheduleTime).getTime(),
    prompt: prompt
  });

  chrome.storage.local.get(['scheduled-posts'], function (result) {
    const scheduledPosts = result['scheduled-posts'] || [];
    scheduledPosts.push(post);
    chrome.storage.local.set({ 'scheduled-posts': scheduledPosts }, function () {
      console.log('Post scheduled:', JSON.stringify(post, null, 2));
      displayScheduledPosts();
      alert("Post scheduled successfully!");

      // Clear the form
      document.getElementById('custom-post-content').value = '';
      document.getElementById('custom-post-schedule-datetime').value = '';
      if (document.getElementById('media-upload')) {
        document.getElementById('media-upload').value = '';
      }
      selectedFile = null;
      const mediaStatusElement = document.getElementById('media-status');
      if (mediaStatusElement) {
        mediaStatusElement.textContent = '';
      }

      // Clear stored file info
      chrome.storage.local.remove('selected-file-info', function () {
        console.log('File info removed from chrome.storage.local');
      });
    });
  });
}
