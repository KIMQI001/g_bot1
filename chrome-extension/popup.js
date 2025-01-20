document.addEventListener('DOMContentLoaded', async function() {
  // 获取当前标签页的信息
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // 从content script获取userId
  chrome.tabs.sendMessage(tab.id, { action: "getUserId" }, function(response) {
    const userIdElement = document.getElementById('userId');
    if (response && response.userId) {
      userIdElement.textContent = response.userId;
    } else {
      userIdElement.textContent = 'Not found';
    }
  });

  // 获取IP地址
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    document.getElementById('ipAddress').textContent = data.ip;
  } catch (error) {
    document.getElementById('ipAddress').textContent = 'Error fetching IP';
  }

  // 复制按钮功能
  document.getElementById('copyButton').addEventListener('click', function() {
    const userId = document.getElementById('userId').textContent;
    const ipAddress = document.getElementById('ipAddress').textContent;
    const textToCopy = `User ID: ${userId}\nIP Address: ${ipAddress}`;
    
    navigator.clipboard.writeText(textToCopy).then(function() {
      const button = document.getElementById('copyButton');
      button.textContent = 'Copied!';
      setTimeout(() => {
        button.textContent = 'Copy Info';
      }, 2000);
    });
  });
});
