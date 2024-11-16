chrome.commands.onCommand.addListener((command) => {
  console.log("Handling command: " + command);

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (command === 'generate_reply') {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['src/content.js'],
      });
    } else if (command === "move_to_next_button") {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['src/move-to-next-button.js']
      });
    } else if (command === "move_to_previous_button") {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['src/move-to-previous-button.js']
      });
    }
  });
});

chrome.runtime.onInstalled.addListener(async function (details) {
  console.log('Handling runtime install...', details);

  const self = await chrome.management.getSelf();

  if (details.reason === 'update' && self.installType !== 'development') {
    const changelogUrl = chrome.runtime.getURL('changelog.html');
    chrome.tabs.create({ url: changelogUrl });
  }
});

chrome.runtime.setUninstallURL('https://xreplygpt.com/uninstall.html');

chrome.runtime.onInstalled.addListener(function (details) {
  chrome.tabs.create({ url: 'https://xreplygpt.com/welcome.html' });
});

chrome.alarms.create('checkScheduledPosts', { periodInMinutes: 1 });

function notifyUser(title, message) {
  console.log("Trying to create notification:", title, message);
  const iconUrl = chrome.runtime.getURL('src/images/XReplyGPT.png');
  if (chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: iconUrl,
      title: title,
      message: message,
      priority: 1
    }, function(notificationId) {
      if (chrome.runtime.lastError) {
        console.error("Notification error:", JSON.stringify(chrome.runtime.lastError));
      } else {
        console.log("Notification created with ID:", notificationId);
      }
    });
  } else {
    console.error("chrome.notifications API is not available.");
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkScheduledPosts') {
    processScheduledPosts();
  }
});

async function processScheduledPosts() {
  const result = await chrome.storage.local.get(['scheduled-posts']);
  let scheduledPosts = result['scheduled-posts'] || [];
  const currentTime = Date.now();

  const postsToProcess = scheduledPosts.filter(post => post.scheduleTimestamp <= currentTime);
  scheduledPosts = scheduledPosts.filter(post => post.scheduleTimestamp > currentTime);

  for (const post of postsToProcess) {
    try {
      await processPost(post);
    } catch (error) {
      console.error("Error processing post:", error);
      notifyUser("Error", `Failed to process scheduled post: ${error.message}`);
      // Move the failed post back to the queue with a delay
      post.scheduleTimestamp = Date.now() + 5 * 60 * 1000; // 5 minutes delay
      scheduledPosts.push(post);
    }
  }

  await chrome.storage.local.set({ 'scheduled-posts': scheduledPosts });
  updateScheduledPostsUI();
}

async function processPost(post) {
  let postContent;
  if (post.type === 'ai' && !post.generatedPost) {
    postContent = await generateAIPost(post.prompt, post.mediaBase64, post.mediaType);
  } else {
    postContent = post.content || post.generatedPost;
  }

  if (!postContent) {
    throw new Error("Post content is undefined");
  }

  await chrome.storage.local.set({
    'generated-post': postContent,
    'media-base64': post.mediaBase64,
    'media-type': post.mediaType,
    'scheduled-post-id': post.id
  });

  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url: 'https://x.com/compose/tweet' }, function(tab) {
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['src/compose.js']
          }, (injectionResults) => {
            if (chrome.runtime.lastError) {
              reject(new Error(`Script injection failed: ${chrome.runtime.lastError.message}`));
            } else {
              resolve();
            }
          });
        }
      });
    });
  });
}

async function generateAIPost(prompt, mediaBase64, mediaType) {
  const apiKeyResult = await chrome.storage.local.get(['open-ai-key']);
  const modelResult = await chrome.storage.local.get(['openai-model']);
  const queryResult = await chrome.storage.local.get(['gpt-query-post']);

  const apiKey = apiKeyResult['open-ai-key'];
  const model = modelResult['openai-model'] || 'gpt-3.5-turbo';
  let query = queryResult['gpt-query-post'] || "You are a social media content creator. Create engaging posts. Exclude hashtags.";

  if (!apiKey) {
    throw new Error("Missing API key for OpenAI request.");
  }

  if (!prompt) {
    throw new Error("Missing prompt for OpenAI request.");
  }

  // Include information about the media in the prompt if available
  if (mediaBase64 && mediaType) {
    prompt += ` Include a reference to the attached ${mediaType} in your post.`;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      "messages": [
        { role: "system", 'content': query },
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
    return resp.choices[0].message.content;
  } else {
    const errorMessage = await response.text();
    throw new Error("Failed to generate post: " + errorMessage);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "notification") {
    notifyUser(message.title, message.message);
  } else if (message.type === "updateScheduledPosts") {
    updateScheduledPostsUI();
  } else if (message.type === "postSuccess") {
    removePostedItemFromSchedule(message.postId);
  }
});

function updateScheduledPostsUI() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "updateScheduledPosts"});
    }
  });
}

async function removePostedItemFromSchedule(postId) {
  const result = await chrome.storage.local.get(['scheduled-posts']);
  let scheduledPosts = result['scheduled-posts'] || [];
  const initialLength = scheduledPosts.length;
  scheduledPosts = scheduledPosts.filter(post => post.id !== postId);
  const finalLength = scheduledPosts.length;
  await chrome.storage.local.set({ 'scheduled-posts': scheduledPosts });
  console.log(`Removed posted item with ID: ${postId} from scheduled posts. Posts removed: ${initialLength - finalLength}`);
  updateScheduledPostsUI();
}