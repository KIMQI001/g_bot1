// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "getUserId") {
    // 获取localStorage中的userId
    const userId = localStorage.getItem('userId');
    sendResponse({ userId: userId });
  }
  return true;
});
