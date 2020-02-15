//
// ReFind Plugin for Gmail (C)2019 - ReFind Inc. 
// Options dialog  
// 
// Librarys used: 
// 		SeviceStack -  https://docs.servicestack.net/javascript-client $.ss and $.fn variables 
// 		SeviceStack Server Side events - https://docs.servicestack.net/javascript-server-events-client
// 		InboxSDK - https://www.inboxsdk.com/docs
//
// This file presents the menu choice "Options" when right clicking on the top level refind icon 
// 

function save_options() {
  console.log('save_options');
  var portalHost = document.getElementById('portalHost').value;
  var serviceHost = document.getElementById('serviceHost').value;
  var userAccountId = document.getElementById('userAccountId').value;

  console.assert(portalHost,"SO:Missing portalHost")
  console.assert(serviceHost,"SO:Missing serviceHost")
  console.assert(userAccountId,"SO:Missing userAccountId")

  var theme = document.getElementById('theme').value;
  chrome.storage.local.set({
    portalHost: portalHost,
    serviceHost: serviceHost,
    userAccountId: userAccountId,
    theme: theme
  }, function() {
    // Update status to let user know options were saved.
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 750);
  });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
  console.log('restore_options');
  // Use default value color = 'red' and likesColor = true.
  chrome.storage.local.get({
    portalHost: 'https://refinddev.commondesk.info',
    fullPortalHost: 'https://refinddev.commondesk.info',
    serviceHost: 'https://refinddev.commondesk.info',
    userAccountId: '9cf9ff65-20b8-4ca3-b65d-8ab60aa07337',
    theme: 'color'
  }, function(items) {
    document.getElementById('portalHost').value = items.portalHost;
    document.getElementById('fullPortalHost').value = items.fullPortalHost;
    document.getElementById('serviceHost').value = items.serviceHost;
    document.getElementById('userAccountId').value = items.userAccountId;
    document.getElementById('theme').value = items.theme;
  });
}

// function switchEnvironment() {
//   console.log('switchEnvironment');
//   chrome.runtime.sendMessage("switchEnvironment");
// }

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
//document.getElementById('environmentsButton').addEventListener('click', switchEnvironment);
