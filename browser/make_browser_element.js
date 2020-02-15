function make_iframe(path, callback) {
  make_iframe_size(path,'500','850',callback);
}

// https://www.inboxsdk.com/docs/#ModalView

// You will see that this iframe, has an internally loaded iframe in it.
// The purpose of this is to get around a "bug" in chrome
// https://bugs.chromium.org/p/chromium/issues/detail?id=408932
// What occurs is an error "Refused to frame  xxx because it violates the following Content Security Policy directive"
// the workaround is to make an iframe in an iframe. 

function make_iframe_size(path, wwidth,wheight,callback) {
  var iframe = document.createElement("iframe");
  var page = chrome.runtime.getURL('browser/browser.html');
  iframe.src = page;
  iframe.height = wheight;
  iframe.width = wwidth; 
  iframe.frameBorder = 0;   
  chrome.storage.local.set({ "path": path }, function(result) {
    callback(iframe);
  });
}

