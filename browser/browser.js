// Create sub iframe for modal dialog loads
$(document).ready(function() 
{
  var frame = document.createElement('iframe');
  frame.setAttribute('id', 'rtmframe');
  frame.frameBorder = 0;   
  chrome.storage.local.get(['portalHost', 'path'], function(result) {
    var address = `${result.portalHost}${result.path}`;
    console.log(`Browser:Url:${address}`);
    frame.setAttribute('src', address);    
    document.body.appendChild(frame);
  });

})
