let mediaUploadSuccessful = false;
let mediaUploadAttempts = 0;
const MAX_MEDIA_UPLOAD_ATTEMPTS = 3;

chrome.storage.local.get(['generated-post', 'custom-post', 'media-base64', 'media-type', 'scheduled-post-id'], async function(result) {
  let postContent = result['generated-post'] || result['custom-post'];
  const mediaBase64 = result['media-base64'];
  const mediaType = result['media-type'];
  const scheduledPostId = result['scheduled-post-id'];
  console.log("Retrieved post content from storage:", postContent);
  console.log("Retrieved media from storage:", mediaType);
  console.log("Scheduled post ID:", scheduledPostId);

  if (!postContent) {
    console.warn("Warning: Post content is undefined. Using default content.");
    postContent = "Default post content. Please edit before posting.";
  }

  try {
    console.log("Starting post process...");
    await attemptPostWithRetries(postContent, mediaBase64, mediaType, scheduledPostId);
    console.log("Post process completed successfully.");
    
    if (scheduledPostId) {
      await removePostedItemFromSchedule(scheduledPostId);
    } else {
      console.log("No scheduled post ID found. Skipping removal from schedule.");
    }
    
    chrome.runtime.sendMessage({type: "updateScheduledPosts"});
  } catch (error) {
    console.error("Final error in post process:", error);
    notifyError("Failed to post after multiple attempts. Please try again later.");
  }
});

async function attemptPostWithRetries(postContent, mediaBase64, mediaType, scheduledPostId) {
  for (let attempt = 1; attempt <= MAX_MEDIA_UPLOAD_ATTEMPTS; attempt++) {
    try {
      console.log(`Attempt ${attempt} to post content with media`);
      
      if (mediaBase64 && mediaType) {
        console.log("Uploading media...");
        await uploadMedia(mediaBase64, mediaType);
        console.log("Media upload successful.");
      }
      
      console.log("Inserting text and posting...");
      await insertTextAndPost(postContent);
      
      console.log("Post successful");
      if (scheduledPostId) {
        chrome.runtime.sendMessage({type: "postSuccess", postId: scheduledPostId});
      } else {
        console.log("No scheduled post ID found. Skipping postSuccess message.");
      }
      return;
    } catch (error) {
      console.error(`Error in attempt ${attempt}:`, error);
      if (attempt === MAX_MEDIA_UPLOAD_ATTEMPTS) {
        throw error;
      }
      console.log("Waiting before next attempt...");
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
    }
  }
}

async function uploadMedia(mediaBase64, mediaType) {
  mediaUploadAttempts++;
  console.log(`Starting media upload. Attempt ${mediaUploadAttempts}/${MAX_MEDIA_UPLOAD_ATTEMPTS}`);

  const fileInput = await findFileInput();
  if (!fileInput) {
    throw new Error("File input not found after multiple attempts");
  }

  const file = await createFileFromBase64(mediaBase64, mediaType);
  if (!checkFileSize(file)) {
    throw new Error("File size exceeds Twitter's limit");
  }

  await simulateFileUpload(fileInput, file);
  
  const mediaProcessed = await waitForMediaProcessing(mediaType);
  if (!mediaProcessed) {
    throw new Error(`${mediaType} processing failed after 60 seconds`);
  }

  mediaUploadSuccessful = true;
}

async function createFileFromBase64(mediaBase64, mediaType) {
  const byteCharacters = atob(mediaBase64.split(',')[1]);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], {type: mediaType === 'image' ? 'image/png' : 'video/mp4'});
  return new File([blob], mediaType === 'image' ? 'image.png' : 'video.mp4', {type: mediaType === 'image' ? 'image/png' : 'video/mp4'});
}

async function simulateFileUpload(fileInput, file) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;

  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 1000));
  fileInput.dispatchEvent(new Event('input', { bubbles: true }));
}

async function insertTextAndPost(postContent) {
  const maxRetries = 30;
  let attempts = 0;
  const retryInterval = 1000;

  while (attempts < maxRetries) {
    const tweetTextArea = document.querySelector('div[aria-label="Tweet text"][role="textbox"]') || document.querySelector('div[aria-label="Post text"][role="textbox"]');

    if (tweetTextArea) {
      console.log("Found tweet text area, inserting text");
      tweetTextArea.focus();
      
      // Use execCommand for cross-platform compatibility
      document.execCommand('insertText', false, postContent);

      console.log("Text inserted:", postContent);

      // Wait a bit to ensure Twitter processes the input
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        console.log("Attempting to post tweet...");
        await postTweet();
        console.log("Tweet posted successfully");
        return;
      } catch (error) {
        console.error("Error posting tweet:", error);
        throw error;
      }
    }

    console.log(`Attempt ${attempts + 1}/${maxRetries}: Could not find tweet text area.`);
    attempts++;
    await new Promise(resolve => setTimeout(resolve, retryInterval));
  }

  throw new Error("Could not find tweet text area after maximum attempts");
}

async function findFileInput(maxAttempts = 60, interval = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    let fileInput = document.querySelector('input[type="file"][accept^="image/"], input[type="file"][accept^="video/"]');
    
    if (fileInput) {
      console.log("File input found directly");
      return fileInput;
    }

    const uploadButton = document.querySelector('button[aria-label="Add photos or video"]');
    if (uploadButton) {
      console.log("Upload button found, clicking...");
      uploadButton.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      fileInput = document.querySelector('input[type="file"][accept^="image/"], input[type="file"][accept^="video/"]');
      if (fileInput) {
        console.log("File input found after clicking upload button");
        return fileInput;
      }
    }

    console.log(`Attempt ${i + 1}/${maxAttempts}: File input not found, waiting...`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  console.error("File input not found after maximum attempts");
  return null;
}

async function postTweet() {
  const maxAttempts = 120; // 2 minutes
  for (let i = 0; i < maxAttempts; i++) {
    hideHashtagSuggestions();

    const postButton = document.querySelector('button[data-testid="tweetButtonInline"]');
    if (postButton) {
      console.log(`Attempt ${i + 1}: Post button found. Disabled: ${postButton.disabled}, Aria-disabled: ${postButton.getAttribute('aria-disabled')}, Class: ${postButton.className}`);
      
      // Force enable the button
      postButton.disabled = false;
      postButton.removeAttribute('aria-disabled');
      postButton.classList.remove('r-icoktb');
      postButton.classList.add('r-1niwhzg');
      
      console.log("Attempting to force-enable and click the post button");
      
      // Try multiple methods to click the button
      postButton.click();
      postButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      postButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      postButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      
      // Try to submit the form directly
      const form = postButton.closest('form');
      if (form) {
        console.log("Found form, attempting to submit directly");
        form.submit();
      }

      // If clicking the button doesn't work, try simulating Ctrl+Enter (or Cmd+Enter on Mac)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const tweetTextArea = document.querySelector('div[aria-label="Tweet text"][role="textbox"]') || document.querySelector('div[aria-label="Post text"][role="textbox"]');
      if (tweetTextArea) {
        tweetTextArea.focus();
        const keyboardEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          which: 13,
          keyCode: 13,
          bubbles: true,
          cancelable: true,
          ctrlKey: !isMac,
          metaKey: isMac
        });
        tweetTextArea.dispatchEvent(keyboardEvent);
      }

      // Check if the post was successful
      await new Promise(resolve => setTimeout(resolve, 2000));
      const successElement = document.querySelector('div[data-testid="toast"]');
      if (successElement && successElement.textContent.includes("Your post was sent")) {
        console.log("Post confirmed successful");
        return;
      } else {
        console.log("Post not confirmed. Success element not found or doesn't contain expected text.");
      }
    } else {
      console.log("Post button not found, waiting...");
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Failed to confirm post after " + maxAttempts + " seconds");
}

function hideHashtagSuggestions() {
  const suggestionBoxes = document.querySelectorAll('div[data-testid="typeaheadDropdown"], div[role="listbox"]');
  suggestionBoxes.forEach(box => {
    if (box) {
      console.log("Hiding hashtag suggestion box");
      box.style.display = 'none';
    }
  });
}

async function waitForMediaProcessing(mediaType) {
  for (let i = 0; i < 60; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const mediaPreview = document.querySelector('div[data-testid="attachments"] img, div[data-testid="attachments"] video');
    if (mediaPreview) {
      return true;
    }
    console.log(`Waiting for ${mediaType} to be processed... Attempt ${i + 1}/60`);
  }
  return false;
}

function checkFileSize(file, maxSizeInMB = 512) {
  const fileSizeInMB = file.size / (1024 * 1024);
  if (fileSizeInMB > maxSizeInMB) {
    console.error(`File size (${fileSizeInMB.toFixed(2)}MB) exceeds the maximum allowed size of ${maxSizeInMB}MB`);
    return false;
  }
  console.log(`File size (${fileSizeInMB.toFixed(2)}MB) is within the allowed limit`);
  return true;
}

function notifyError(message) {
  chrome.runtime.sendMessage({type: "notification", title: "Error", message: message});
}

async function removePostedItemFromSchedule(scheduledPostId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['scheduled-posts'], function(result) {
      let scheduledPosts = result['scheduled-posts'] || [];
      const initialLength = scheduledPosts.length;
      scheduledPosts = scheduledPosts.filter(post => post.id !== scheduledPostId);
      const finalLength = scheduledPosts.length;
      chrome.storage.local.set({ 'scheduled-posts': scheduledPosts }, function() {
        console.log(`Removed posted item with ID: ${scheduledPostId} from scheduled posts. Posts removed: ${initialLength - finalLength}`);
        resolve();
      });
    });
  });
}