//
// called on options dialog when you add a new account
// 
document.addEventListener('setUserAccountId', function(data) {
  console.log(data);
  console.assert(data.data,"RG:AEL:userAccountId will be set to empty ")
	chrome.storage.local.set({
    'userAccountId': data.data
  }, function() {
    chrome.runtime.sendMessage("close_window");
  });
});
