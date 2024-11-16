// Function to check if Twitter's UI is in dark mode
function isTwitterInDarkMode() {
  const bgColor = window.getComputedStyle(document.body).backgroundColor;
  const darkColors = ["rgb(21, 32, 43)", "rgb(0, 0, 0)"]; // Common dark background colors in Twitter UI
  return darkColors.includes(bgColor);
}

// Function to show loading spinner
function showLoadingSpinner(container) {
  if (!container) return;
  const loadingSVG = document.createElement('div');
  loadingSVG.className = 'loading-spinner';
  loadingSVG.style.display = 'inline-block';
  loadingSVG.style.width = '20px';
  loadingSVG.style.height = '20px';
  loadingSVG.innerHTML = `<svg
    id="loading-spinner"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 50 50"
    preserveAspectRatio="xMidYMid"
    class="loading-svg"
  >
    <circle cx="25" cy="25" fill="none" stroke="#3490dc" stroke-width="4" r="20" stroke-dasharray="94.24777960769379 31.41592653589793">
      <animateTransform
        attributeName="transform"
        type="rotate"
        repeatCount="indefinite"
        dur="1s"
        keyTimes="0;1"
        values="0 25 25;360 25 25"
      ></animateTransform>
    </circle>
  </svg>`;
  container.appendChild(loadingSVG);
}

// Function to hide loading spinner
function hideLoadingSpinner(container) {
  if (!container) return;
  const loadingSpinner = container.querySelector('.loading-spinner');
  if (loadingSpinner) {
    container.removeChild(loadingSpinner);
  }
}

async function generateReply(event) {
  console.log("Generate reply button clicked");
  
  const tweetContainer = event.target.closest('[data-testid="tweet"]') || event.target.closest('article[role="article"]');
  if (!tweetContainer) {
    console.log("No tweet container found");
    return;
  }

  const content = tweetContainer.querySelector('[data-testid="tweetText"]') || tweetContainer.querySelector('[data-text="true"]');
  const user = tweetContainer.querySelector('[data-testid="User-Name"]');
  if (!content || !user) {
    console.log("No content or user found");
    return;
  }

  const spans = user.querySelectorAll('span');
  let username = "";
  for (let i = 0; i < spans.length; i++) {
    if (spans[i].innerText.startsWith("@")) {
      username = spans[i].innerText || "";
      break;
    }
  }

  const userHandle = '@' + document.querySelector('[data-testid="AppTabBar_Profile_Link"]').href.split('/')[3];
  if (userHandle === username) {
    console.log("Don't reply to yourself");
    return;
  }

  const existingReplyContainer = tweetContainer.querySelector('.generated-reply-container');
  if (existingReplyContainer) {
    existingReplyContainer.remove(); // Remove the existing reply container
  }

  const replyContainer = document.createElement('div');
  replyContainer.classList.add('generated-reply-container');

  showLoadingSpinner(content);

  const tweetLink = tweetContainer.querySelector('a[href*="/status/"]');
  if (!tweetLink) {
    console.log("No tweet link found");
    return;
  }

  const tweetId = tweetLink.href.split('/status/')[1].split('?')[0];
  console.log("Tweet ID found:", tweetId);

  console.log("Fetching OpenAI key, query, and selected tone");
  const apiKey = await chrome.storage.local.get(['open-ai-key']);
  const gptQueryResult = await chrome.storage.local.get(['gpt-query-reply']);
  const selectedToneResult = await chrome.storage.local.get(['selected-tone-gpt-query-reply']);
  const model = await chrome.storage.local.get(['openai-model']);

  let gptQuery = gptQueryResult['gpt-query-reply'];
  const selectedTone = selectedToneResult['selected-tone-gpt-query-reply'] || 'default';

  console.log("Selected tone:", selectedTone);
  console.log("GPT Query:", gptQuery);

  if (!gptQuery) {
    // Set default query based on selected tone
    switch (selectedTone) {
      case 'professional':
        gptQuery = "You are a professional advisor. Reply to the user's tweets with professional and insightful comments. Keep it concise and exclude hashtags.";
        break;
      case 'humor':
        gptQuery = "You are a witty comedian. Reply to the user's tweets with humor and clever jokes. Keep it concise and exclude hashtags.";
        break;
      case 'formal':
        gptQuery = "You are a formal spokesperson. Reply to the user's tweets with utmost formality and politeness. Keep it concise and exclude hashtags.";
        break;
      default:
        gptQuery = "You are a friendly ghostwriter. Reply to the user's tweets by talking directly to the person. Keep it short and casual, and exclude hashtags.";
    }
  }

  console.log("Final GPT Query:", gptQuery);

  console.log("Sending request to OpenAI API");
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey['open-ai-key']
    },
    body: JSON.stringify({
      "messages": [
        { role: "system", 'content': gptQuery },
        { role: "user", 'content': `[username] wrote [tweet]`.replace('[username]', username).replace('[tweet]', content.innerText) }
      ],
      model: model['openai-model'],
      temperature: 1,
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    })
  });

  hideLoadingSpinner(content);

  if (!response.ok) {
    const errorMessage = "Error while generating a reply for this tweet: " + (await response.json()).error.message;
    let p = document.createElement("p");
    p.innerHTML = errorMessage;
    p.style.marginBottom = '5px';
    p.style.marginTop = '5px';
    replyContainer.appendChild(p);

    let button = document.createElement("button");
    button.innerText = "Report Issue";
    button.classList.add("button");
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.marginTop = "10px";
    button.addEventListener("click", function() {
      window.open(`https://github.com/marcolivierbouch/XReplyGPT/issues/new?title=Issue%20while%20generating%20tweet&body=${errorMessage}`);
    });

    replyContainer.appendChild(button);
    tweetContainer.appendChild(replyContainer);
    console.log(errorMessage);
    return;
  }

  const resp = await response.json();
  console.log("OpenAI API response received", resp);

  // Detect if Twitter is in dark mode
  const textColor = isTwitterInDarkMode() ? 'white' : 'black';

  let p = document.createElement("p");
  p.innerHTML = "Generated reply: ";
  p.style.marginBottom = '5px';
  p.style.marginTop = '5px';
  p.style.color = textColor; // Set text color based on Twitter theme
  replyContainer.appendChild(p);

  resp.choices.forEach(choice => {
    let link = document.createElement("a");
    link.id = "generated-reply";
    link.href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(choice.message.content) + "&in_reply_to=" + tweetId;
    link.target = "_blank";
    link.innerHTML = choice.message.content;
    link.style.marginTop = '10px';
    link.style.color = textColor; // Set text color based on Twitter theme
    link.style.textDecoration = 'none';

    let buttonReply = document.createElement("button");
    buttonReply.id = "generated-reply";
    buttonReply.setAttribute("data-link", "https://twitter.com/intent/tweet?text=" + encodeURIComponent(choice.message.content) + "&in_reply_to=" + tweetId);
    buttonReply.classList.add("button");
    buttonReply.style.display = "flex";
    buttonReply.style.alignItems = "center";
    buttonReply.style.marginTop = "10px";
    buttonReply.style.color = textColor; // Set text color based on Twitter theme

    let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 512 512");
    let path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 427.7l-68.5 74.1c-8.9 9.7-22.9 12.9-35.2 8.1S160 493.2 160 480V396.4c0-4 1.5-7.8 4.2-10.7L331.8 202.8c5.8-6.3 5.6-16-.4-22s-15.7-6.4-22-.7L106 360.8 17.7 316.6C7.1 311.3 .3 300.7 0 288.9s5.9-22.8 16.1-28.7l448-256c10.7-6.1 23.9-5.5 34 1.4z");
    path.setAttribute("fill", "white");

    svg.appendChild(path);
    buttonReply.appendChild(svg);

    let buttonText = document.createElement("span");
    buttonText.innerText = "Send reply";
    buttonText.style.marginLeft = "10px";
    buttonReply.appendChild(buttonText);

    let br = document.createElement("br");
    link.appendChild(br);
    link.appendChild(buttonReply);

    replyContainer.appendChild(link);
  });

  // Append the reply container below the generate reply button
  const generateReplyButton = tweetContainer.querySelector('.generate-reply-button');
  if (generateReplyButton) {
    generateReplyButton.insertAdjacentElement('afterend', replyContainer);
  } else {
    console.log("Generate reply button not found for inserting reply");
    tweetContainer.appendChild(replyContainer);
  }

  console.log("Reply generated and displayed");
}

function addGenerateReplyButtons() {
  console.log("Adding generate reply buttons");
  const tweets = document.querySelectorAll('[data-testid="tweet"], article[role="article"]');
  if (tweets) {
    tweets.forEach(tweet => {
      if (!tweet.querySelector('.generate-reply-button')) {
        // Skip adding the button if the tweet is in the notification area
        const notificationArea = tweet.closest('[aria-label="Timeline: Notifications"]');
        if (notificationArea) {
          console.log("Skipping tweet in notification area");
          return;
        }

        const button = document.createElement('button');
        button.classList.add('generate-reply-button');
        button.innerText = 'Generate Reply';
        button.addEventListener('click', generateReply);
        
        // Add custom styles for the button
        button.style.backgroundColor = '#1DA1F2';
        button.style.color = '#FFFFFF';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.padding = '8px 12px';
        button.style.cursor = 'pointer';
        button.style.fontSize = '14px';
        button.style.fontWeight = 'bold';
        button.style.margin = '10px 0';
        button.style.display = 'inline-block';
        button.style.textAlign = 'center'; // Center text

        // Add hover effect
        button.addEventListener('mouseover', () => {
          button.style.backgroundColor = '#1A91DA';
        });
        button.addEventListener('mouseout', () => {
          button.style.backgroundColor = '#1DA1F2';
        });

        // Append button below the tweet actions container
        const actionsContainer = tweet.querySelector('[role="group"]');
        if (actionsContainer) {
          actionsContainer.insertAdjacentElement('afterend', button);
        } else {
          tweet.appendChild(button);
        }
      }
    });
  }
}

function observeDOMChanges() {
  const observer = new MutationObserver(() => {
    addGenerateReplyButtons();
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function displayScheduledPosts() {
  chrome.storage.local.get(['scheduled-posts'], function(result) {
    const scheduledPosts = result['scheduled-posts'] || [];
    const scheduledPostsList = document.getElementById('scheduled-posts-list');
    if (scheduledPostsList) {
      scheduledPostsList.innerHTML = '';
      scheduledPosts.forEach((post, index) => {
        const listItem = document.createElement('div');
        listItem.className = 'scheduled-post-item';
        const postContent = post.content || post.generatedPost;
        const scheduleTime = new Date(post.scheduleTimestamp).toLocaleString();
        listItem.innerHTML = `
          <p>${postContent}</p>
          <p>Scheduled for: ${scheduleTime}</p>
          <button class="edit-button" data-index="${index}">Edit</button>
          <button class="delete-button" data-index="${index}">Delete</button>
        `;
        scheduledPostsList.appendChild(listItem);
      });
    }
  });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateScheduledPosts") {
    displayScheduledPosts();
  }
});

// Initialize
addGenerateReplyButtons();
observeDOMChanges();
window.addEventListener('scroll', addGenerateReplyButtons);
window.addEventListener('load', addGenerateReplyButtons);
displayScheduledPosts();

// Keyboard shortcut handler
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.key === 'L') {
    console.log('Keyboard shortcut for generating reply triggered');
    const selectedTweet = document.querySelector('[data-testid="tweet"]:focus-within, article[role="article"]:focus-within');
    if (selectedTweet) {
      generateReply({ target: selectedTweet });
    }
  }
});

// Function to edit a scheduled post
function editScheduledPost(index) {
  chrome.storage.local.get(['scheduled-posts'], function(result) {
    const scheduledPosts = result['scheduled-posts'] || [];
    const post = scheduledPosts[index];
    if (post) {
      const editModal = document.getElementById('edit-post-modal');
      const postContentInput = document.getElementById('edit-post-content');
      const scheduleDateTimeInput = document.getElementById('edit-scheduled-datetime');
      
      postContentInput.value = post.content || post.generatedPost;
      scheduleDateTimeInput.value = new Date(post.scheduleTimestamp).toISOString().slice(0, 16);
      
      editModal.setAttribute('data-index', index);
      editModal.style.display = 'block';
    }
  });
}

// Function to save edited post
function saveEditedPost() {
  const editModal = document.getElementById('edit-post-modal');
  const index = editModal.getAttribute('data-index');
  const postContent = document.getElementById('edit-post-content').value;
  const scheduleDateTime = document.getElementById('edit-scheduled-datetime').value;

  chrome.storage.local.get(['scheduled-posts'], function(result) {
    const scheduledPosts = result['scheduled-posts'] || [];
    if (scheduledPosts[index]) {
      scheduledPosts[index].content = postContent;
      scheduledPosts[index].scheduleTimestamp = new Date(scheduleDateTime).getTime();
      
      chrome.storage.local.set({ 'scheduled-posts': scheduledPosts }, function() {
        console.log('Scheduled post updated');
        editModal.style.display = 'none';
        displayScheduledPosts();
      });
    }
  });
}

// Function to delete a scheduled post
function deleteScheduledPost(index) {
  chrome.storage.local.get(['scheduled-posts'], function(result) {
    const scheduledPosts = result['scheduled-posts'] || [];
    scheduledPosts.splice(index, 1);
    chrome.storage.local.set({ 'scheduled-posts': scheduledPosts }, function() {
      console.log('Scheduled post deleted');
      displayScheduledPosts();
    });
  });
}

// Event listeners for edit and delete buttons
document.addEventListener('click', function(event) {
  if (event.target.classList.contains('edit-button')) {
    const index = event.target.getAttribute('data-index');
    editScheduledPost(parseInt(index));
  } else if (event.target.classList.contains('delete-button')) {
    const index = event.target.getAttribute('data-index');
    if (confirm('Are you sure you want to delete this scheduled post?')) {
      deleteScheduledPost(parseInt(index));
    }
  }
});

// Event listener for saving edited post
document.getElementById('save-edit-button').addEventListener('click', saveEditedPost);

// Event listener for canceling edit
document.getElementById('cancel-edit-button').addEventListener('click', function() {
  document.getElementById('edit-post-modal').style.display = 'none';
});

// Function to update theme based on Twitter's dark mode
function updateTheme() {
  const isDarkMode = isTwitterInDarkMode();
  document.body.classList.toggle('dark-theme', isDarkMode);
  document.body.classList.toggle('light-theme', !isDarkMode);
}

// Call updateTheme initially and observe for changes
updateTheme();
const observer = new MutationObserver(updateTheme);
observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });