//
// ReFind Plugin for Gmail (C)2019 - ReFind Inc. 
// Backend implemenation -- this logic waits for events sent by the frontend service
//  

// Design note:
// the AddListener waits for messages to sent from the frontend
// if the request if to call a GMAIL API 
//    then the call must start with a call to GetClientAccessToken. 
//    in this system the server is constantly updating the access token and only the server knows when a new one should be used. 
//    for this reason we call this REST service and then us it in any calls to the GMAIL api. 
//    after we have the access token, we reinit the GMAIL api, by calling LOADAPI()
// fi
// 
var error_count = 0;

$.ajaxSetup({
  beforeSend: function (xhr)
  {     
     xhr.setRequestHeader("RKey","AIzaSyCxuBkQhSuOHVX9_0HvIZZElqdDrzllyLI");        
  }
});

window.onerror = function (message, url, lineno, colno, error) {

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { message: "refind_background_error", error: message, error_count: ++error_count }, function (response) { });
    });
  });
  return false;
}


var GMAILCRED = {
  // Gmail API Keys for refind for email 
  CLIENT_ID: '372814543424-j484k02mqgd5c11mer3bildmo43bnhrm.apps.googleusercontent.com',
  API_KEY: 'AIzaSyCxuBkQhSuOHVX9_0HvIZZElqdDrzllyLI'
};

var APPSETTINGS = {
  GMAIL_TIMEOUT: 10000,  // 10 seconds 
  WINDOW_WIDTH: 1280,
  WINDOW_HEIGHT: 1024
}

var ACCESS_TOKEN = {
  AuthToken: '',
  ExpirationDate: ''
}

var id = 0;

requestUpdateSessionState = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, "refind_update_session_state");
    });
  });
}

onChromeTabActivated = (activeInfo) => {
  //console.log(`onChromeTabActivated:TabId=${activeInfo.tabId}`);
  chrome.tabs.sendMessage(activeInfo.tabId, "refind_update_session_state");
}
chrome.tabs.onActivated.addListener(onChromeTabActivated);

chrome.runtime.onMessage.addListener(

  function (request, sender, sendResponse) {

    if (request.type)
      console.log("Request Type=" + request.type);
    else
      console.log("Request Type=" + request);

    if (request === "createRefindAccount") {
      chrome.storage.local.get(['portalHost'], function (result) {
        var loginUrl = `${result.portalHost}/account/create`;
        console.log(loginUrl);
        window = chrome.windows.create({
          url: loginUrl,
          type: "normal",
          width: APPSETTINGS.WINDOW_WIDTH,
          height: APPSETTINGS.WINDOW_HEIGHT
        }, function (newWindow) {
          id = newWindow.id;
        });

      });
      return true;
    }
    else if (request === "close_window") {
      console.log(id);
      chrome.windows.remove(id);
    }
    else if (request === "userAccountId_set") {
      chrome.tabs.query({}, function (tabs) {
        console.log(tabs);
        tabs.forEach(x => {
          chrome.tabs.sendMessage(x.Id, "userAccountId_set");
        });
      })
    }

    else if (request.type == 'onload') {

      console.log("----------- ONLOAD ----------");

      return handleOnLoadRequest(request.userEmail);
    }

    else if (request.type == 'getGmailThreads') {

      console.log("----------- GET GMAIL THREADS ----------");
      var messagesArray = [];
      var messagesObj = {};
      var resultCounter = 0;
      var responseSent = false;
      var resultEstimate = request.total;
      var max = 50;

      request.threads.forEach(function (obj, i) {

        var threadData = gapi.client.gmail.users.threads.get({
          userId: 'me',
          id: obj.threadId,
          fields: '*'
        });

        threadData.execute(function (messageData) {          
          if (messageData.error) {
            resultEstimate -= 1;
          } else {
            if (responseSent === true) return false;

            messagesArray.push(messageData.result);
            resultCounter++;

            if (resultEstimate >= max) {
              if (resultCounter == max) {
                messagesObj.messages = messagesArray;
                sendResponse(messagesObj);
                responseSent = true;
              }
            }
            else {
              if (resultCounter == resultEstimate) {
                messagesObj.messages = messagesArray;
                sendResponse(messagesObj);
                responseSent = true;
              }
            }
          }
        });
      });
      return true;
    }

    else if (request.type == 'MakeRecipeCriteria') {
      console.log("----------- MakeRecipeCriteria ----------");
      $.ss.postJSON(`${request.serviceHost}/json/reply/MakeRecipeCriteria`,
        {
          'Data': request.recipe,
          'UserAccountId': request.userAccountId,
          'DeviceId': request.deviceId,
          'MailAccountId': request.mailAccountId
        }, function (data) {
          sendResponse(data);
        });
      return true;
    }

    else if (request.type == 'ModifyRecipe') {
      console.log("----------- ModifyRecipe ----------");
      $.ss.postJSON(`${request.serviceHost}/json/reply/ModifyRecipe`,
        {
          'UserAccountId': request.userAccountId,
          'MailAccountId': request.mailAccountId,
          'DeviceId': request.deviceId,
          'Type': request.recipeType,
          'RecipeId': request.recipeId,
          'Criteria': request.criteria
        }, function (data) {
          sendResponse(data);
        });
      return true;
    }

    else if (request.type == 'ListRecipe') {
      console.log("----------- ListRecipe ----------");
      $.post(`${request.serviceHost}/json/reply/ListRecipe`, {
        'UserAccountId': request.userAccountId,
        'MailAccountId': request.mailAccountId
      }).then(function (data) {
        sendResponse(data);
      });
      return true;
    }

    else if (request.type == 'GetVenues') {
      console.log("----------- GetVenues ----------");
      $.post(`${request.serviceHost}/json/reply/GetVenues`, {
        'UserAccountId': request.userAccountId,
        'MailAccountId': request.mailAccountId
      }).then(function (data) {
        console.log(data);
        sendResponse(data);
      });
      return true;
    }

    else if (request.type == 'GetAllVenueItemsExtended') {
      console.log("----------- GetAllVenueItemsExtended ----------");
      $.post(`${request.serviceHost}/json/reply/GetAllVenueItemsExtended`, {
        'UserAccountId': request.userAccountId,
        'MailAccountId': request.mailAccountId,
        'DeviceId': request.deviceId,
        'VenueId': request.venueId,
        'Offset': request.offset,
        'Max': request.max
      }).then(function (data) {
        sendResponse(data);
      });
      return true;
    }

    else if (request.type == 'GetClientAccessToken') {
      console.log("----------- GetClientAccessToken ----------");
      getAuthAccessToken("GetClientAccessToken", 
        request.serviceHost, 
        request.userAccountId, 
        request.mailAccountId, 
        request.deviceId, 
        (response) => sendResponse(response));
      
      return true;
    }

    else if (request.type == 'markAsRead') {
      console.log("----------- markAsRead ----------");
      getAuthAccessToken("markAsRead", 
        request.serviceHost, 
        request.userAccountId, 
        request.mailAccountId, 
        request.deviceId, 
        (res) => {
          
          var threadModify = gapi.client.gmail.users.threads.modify({
            'userId': 'me',
            'id': request.threadId,
            'removeLabelIds': ['UNREAD']
          });
          threadModify.execute(function (data) {
            sendResponse(data);
          })
        });
      
      return true;
    }

    else if (request.type == 'markAsUnread') {
      console.log("----------- markAsUnread ----------");

      getAuthAccessToken("markAsUnread", 
        request.serviceHost, 
        request.userAccountId, 
        request.mailAccountId, 
        request.deviceId, 
        (res) => {
          
          var threadModify = gapi.client.gmail.users.threads.modify({
            'userId': 'me',
            'id': request.threadId,
            'addLabelIds': ['UNREAD']
          });
          threadModify.execute(function (data) {
            sendResponse(data);
          })
        });

      return true;
    }

    else if (request.type == 'archiveThread') {
      console.log("----------- archiveThread ----------");

      getAuthAccessToken("archiveThread", 
        request.serviceHost, 
        request.userAccountId, 
        request.mailAccountId, 
        request.deviceId, 
        (res) => {
          
          var threadModify = gapi.client.gmail.users.threads.modify({
            'userId': 'me',
            'id': request.threadId,
            'removeLabelIds': ['INBOX']
          });
          threadModify.execute(function (data) {
            sendResponse(data);
          })
        });

      return true;
    }

    else if (request.type == 'trashThread') {
      console.log("----------- trashThread ----------");

      getAuthAccessToken("trashThread", 
        request.serviceHost, 
        request.userAccountId, 
        request.mailAccountId, 
        request.deviceId, 
        (res) => {
          
          var threadModify = gapi.client.gmail.users.threads.modify({
            'userId': 'me',
            'id': request.threadId,
            'addLabelIds': ['TRASH']
          });
          threadModify.execute(function (data) {
            sendResponse(data);
          })
        });

      return true;
    }

    else if (request.type == 'spamThread') {
      console.log("----------- spamThread ----------");

      getAuthAccessToken("spamThread", 
        request.serviceHost, 
        request.userAccountId, 
        request.mailAccountId, 
        request.deviceId, 
        (res) => {
          
          var threadModify = gapi.client.gmail.users.threads.modify({
            'userId': 'me',
            'id': request.threadId,
            'addLabelIds': ['SPAM']
          });
          threadModify.execute(function (data) {
            sendResponse(data);
          })
        });

      return true;
    }

    else if (request.type == 'labelThread') {
      console.log("----------- labelThread ----------");

      getAuthAccessToken("labelThread", 
        request.serviceHost, 
        request.userAccountId, 
        request.mailAccountId, 
        request.deviceId, 
        (res) => {
          
          var threadModify = gapi.client.gmail.users.threads.modify({
            'userId': 'me',
            'id': request.threadId,
            'addLabelIds': request.activeLabels
          });
          threadModify.execute(function (data) {
            sendResponse(data);
          })
        });
        
      return true;
    }

    else if (request.type == 'starThread') {
      console.log("----------- starThread ----------");

      getAuthAccessToken("starThread", 
        request.serviceHost, 
        request.userAccountId, 
        request.mailAccountId, 
        request.deviceId, 
        (res) => {
          
          var threadModify = gapi.client.gmail.users.threads.modify({
            'userId': 'me',
            'id': request.threadId,
            'addLabelIds': ['STARRED']
          });
          threadModify.execute(function (data) {
            sendResponse(data);
          })
        });

      return true;
    }

    else if (request.type == 'unstarThread') {
      console.log("----------- unstarThread ----------");

      getAuthAccessToken("unstarThread", 
      request.serviceHost, 
      request.userAccountId, 
      request.mailAccountId, 
      request.deviceId, 
      (res) => {
        var threadModify = gapi.client.gmail.users.threads.modify({
          'userId': 'me',
          'id': request.threadId,
          'removeLabelIds': ['STARRED']
        });
        threadModify.execute(function (data) {
          sendResponse(data);
        })
      });

      return true;
    }

    else if (request.type == 'getLabels') {
      console.log("----------- getLabels ----------");

      getAuthAccessToken("getLabels", 
      request.serviceHost, 
      request.userAccountId, 
      request.mailAccountId, 
      request.deviceId, 
      (res) => {        
        var request = gapi.client.gmail.users.labels.list({
          'userId': 'me'
        });
        request.execute(function (res) {
          var labels = res.labels;
          console.log(res);
          sendResponse(labels);
        })
      });
      return true;
    }
    else if (request.type == 'UserAccountExists') {
      console.log("----------- UserAccountExists ----------");
      console.log(request);

      // If the user account doesn't exist we need to login first into google, then we check if we are registered in the portal with this account
      if(request.userAccountId === undefined || request.userAccountId === "") {
        signInToGoogle(request.userEmail, function (newUserAccountId) {
          isUserRegistered(request.serviceHost, request.userEmail, newUserAccountId,
            (accountExistsResponse) => {
              sendResponse(accountExistsResponse);
          });
        });
      }
      else {
        isUserRegistered(request.serviceHost, request.userEmail, request.userAccountId,
         (accountExistsResponse) => {
           sendResponse(accountExistsResponse);
        });
      }
      
      return true;
    }   
    // LAST ELSE IF 
});

function handleOnLoadRequest(currentGMailUser) {

  chrome.storage.local.get(['isValidSession', 'serviceHost', 'userEmail', 'userAccountId', 'userLoggedOut', 'environment'], function (storageResult) {

    console.log("Current:GmailMailUser=" + currentGMailUser);
    console.log("Stored:userEmail=" + storageResult.userEmail);
    console.log("userAccountId=" + storageResult.userAccountId);
    console.log("serviceHost=" + storageResult.serviceHost);
    console.log("userLoggedOut=" + storageResult.userLoggedOut);
    console.log("isValidSession=" + storageResult.isValidSession);
    console.log("environment=" + storageResult.environment);

    if (storageResult.environment === undefined) {
      console.log("No environment is selected, delaying login until user selects a valid environment");
      return;
    }
    // If the user selected the Logout menu, we should not login again until they select Login on the dropdown
    if (storageResult.userLoggedOut) {
      console.log("User is logged out, Refind for Chrome not enabled for user=" + currentGMailUser);
      return;
    }

    //if (storageResult.isValidSession == false && (storageResult.userEmail === undefined || currentGMailUser !== storageResult.userEmail)) {
    if (storageResult.isValidSession == false && storageResult.userEmail === undefined) {
      // There's an email saved but is not equal to the current logged in gmail address
      // Or, there is no saved email (this is the first time we login with the chrome extension)

      // if (storageResult.isValidSession) {
      //   // IF the session is valid but we entered here it means the gmail page has been loaded with a different email than the one we stored last time
      //   console.warn(`Stored email address is different from current email address. StoredEmail=[${storageResult.userEmail}]:CurrentGMailUser=[${currentGMailUser}]`);
      // }

      signInToGoogle(currentGMailUser, function (newUserAccountId) {
        setupUserSession(storageResult, newUserAccountId, currentGMailUser);
      });
    }
    else if (currentGMailUser === storageResult.userEmail) {

      // There's an email saved on local storage and is equal to current logged in gmail address
      // Validate that this email is still registered with refind
      setupUserSession(storageResult, storageResult.userAccountId, currentGMailUser);
    }
  });
  return true;
}

function isUserRegistered(serviceHost, currentGMailUser, userAccountId, registeredCallback) {

  console.log(`isUserRegistered:Email=${currentGMailUser}, stored userId=${userAccountId}`);

  if(userAccountId === undefined || userAccountId === "") {
    console.error("isUserRegistered:Invalid user account id")
    return;
  }
  // Check if we are logged in with a valid email account    
  //if(result.userEmail === currentGMailUser) registeredCallback(true);

  // If we have an email, validate it against the aspnetzero backend to ensure we are running in gmail with a registered account
  // If we don't have a registered account the Venue tree and the menues will not be displayed     

  $.post(`${serviceHost}/json/reply/UserAccountExists`, {
    'UserAccountId': userAccountId,
    'DeviceId': 'ChromeExtensionId'
  }).then(function (response) {
    console.log(response);
    return registeredCallback(response.AccountExists);
  });
}

function setupUserSession(storageResult, userAccountId, currentGMailUser) {

  isUserRegistered(storageResult.serviceHost, currentGMailUser, userAccountId, (isRegistered) => {

    console.log(`setupUserSession:Is valid Refind session for Gmail Address [${currentGMailUser}] = [${isRegistered}]`);

    // Store the session flag, it will be true or false depending on if the user is registered or not
    chrome.storage.local.set({
      isValidSession: isRegistered,
      //userLoggedOut: false
    });

    // If the user is registered get an access token so we can display messages
    if (isRegistered) {
      getClientAccessToken(storageResult.serviceHost, userAccountId, currentGMailUser);
      requestUpdateSessionState();
     // sendResponse(storageResult);
    }
  });
}


function LoadAPI(authResponse) {
  // gapi.load
  // https://github.com/google/google-api-javascript-client/blob/master/docs/reference.md
  //
  gapi.load('client',
    {
      callback: () => {
        console.log("LoadAPI:gapi.load start");
        gapi.client.setToken({ access_token: authResponse.AuthToken });
        gapi.client.setApiKey(GMAILCRED.API_KEY);
        gapi.client.load('gmail', 'v1', () => {
          console.log("LoadAPI:gapi.load complete");
        });
      },
      onerror: () => {
        // Handle loading error.
        alert('LoadAPI:gapi.client had an error.   Its possible the plugin in out of date.');
        resetSession();
      },
      timeout: APPSETTINGS.GMAIL_TIMEOUT,
      ontimeout: () => {
        // Handle timeout.
        alert('LoadAPI:gapi.client load timed out.   Its possible the plugin in out of date.');
      }
    });
}

function resetSession() {
  // there was an error so reset the session state 
  chrome.storage.local.set(
    {
      isValidSession: false,
    }, function () { });
}

function getAuthAccessToken(caller, serviceHost, userAccountId, mailAccountId, deviceId, callback) {
  
  console.log(ACCESS_TOKEN);
  if(ACCESS_TOKEN.AuthToken !== '') {
    
    var currentDate = new Date();
    var expired = ACCESS_TOKEN.ExpirationDate <= currentDate;
    console.log(`Token is expired=[${expired}]:Expire Date=[${ACCESS_TOKEN.ExpirationDate}]:Current Date=[${currentDate}]`);
    if(expired == false) {
      console.log(`getClientAccessToken:${caller}:Found valid cached token`);
      callback(ACCESS_TOKEN);
      return;
    }
  }
  console.log("getAuthAccessToken:serviceHost=" + serviceHost);
  console.log("getAuthAccessToken:userAccountId=" + userAccountId);
  console.log("getAuthAccessToken:MailAccountId=" + mailAccountId);
  console.log("getAuthAccessToken:deviceId=" + deviceId);
  
  $.post(`${serviceHost}/json/reply/GetClientAccessToken`, {
    'UserAccountId': userAccountId,
    'MailAccountId': mailAccountId,
    'DeviceId': deviceId,
    'Caller': caller
  }).then((authResponse) => {

    // Update the gmail api object with the new valid token
    gapi.client.setToken({ access_token: authResponse.AuthToken });

    console.log(`Token expires=${authResponse.ExpirationDate}`);

    ACCESS_TOKEN.AuthToken = authResponse.AuthToken;
    var localDate = new Date(authResponse.ExpirationDate);
    ACCESS_TOKEN.ExpirationDate = localDate;
    console.log(`Got new access token, expirationDate=${ACCESS_TOKEN.ExpirationDate}`);

    callback(authResponse);
  });
}

function getClientAccessToken(serviceHost, userAccountId, currentGMailUser) {

  let mid = `${currentGMailUser}_Gmail`;

  console.log("getClientAccessToken:serviceHost=" + serviceHost);
  console.log("getClientAccessToken:userAccountId=" + userAccountId);
  console.log("getClientAccessToken:MailAccountId=" + mid);
  console.log("getClientAccessToken:setApiKey=" + GMAILCRED.API_KEY);

  $.post(`${serviceHost}/json/reply/GetClientAccessToken`, {
    'UserAccountId': userAccountId,
    'MailAccountId': mid,
    'DeviceId': 'ChromeExtensionId',
    'Caller': 'function getClientAccessToken'
  }).then((result) => LoadAPI(result));
}

function signInToGoogle(currentGMailUser, completionCallback) {

  var redirect_uri = chrome.identity.getRedirectURL("oauth2");
  var authUrl = 'https://accounts.google.com/o/oauth2/auth'    
    + '?response_type=token&client_id=' + GMAILCRED.CLIENT_ID
    + '&scope=' + 'profile email openid'
    + '&redirect_uri=' + redirect_uri
    + '&login_hint=' + currentGMailUser;

  console.log('launchWebAuthFlow:redirect_uri=', redirect_uri);
  console.log('launchWebAuthFlow:authUrl=', authUrl);

  chrome.identity.launchWebAuthFlow({ 'url': authUrl, 'interactive': true }, function (redirectUrl) {
    if (redirectUrl) {
      console.log('signInToGoogle:launchWebAuthFlow login successful:Redirect=', redirectUrl);
      var parsed = parse(redirectUrl.substr(chrome.identity.getRedirectURL("oauth2").length + 1));
      token = parsed.access_token;
      console.log('signInToGoogle:Background login complete.');

      getGMailProfile(token, (response) => {

        var loginResult = JSON.parse(response);
        var newUserAccountId = loginResult.id;
        var userName = loginResult.name;
        console.log(`"signInToGoogle:getGMailProfile:UserEmail=${currentGMailUser}:UserAccountId=${newUserAccountId}:Name=${userName}`);        

        console.assert(newUserAccountId,"WLAF:Missing newUserAccountId")
        console.assert(userName,"WLAF:Missing userName")

        chrome.storage.local.set({
          userAccountId: newUserAccountId,
          isValidSession: true,
          userEmail: currentGMailUser,
          userName: userName
        }, function () {
          console.log(`"signInToGoogle:LoggedIn:UserEmail=${currentGMailUser}:UserAccountId=${newUserAccountId}:Name=${userName}`);          
          completionCallback(newUserAccountId);
          requestUpdateSessionState();
        });
      });
    }
    else {
      console.log("signInToGoogle:launchWebAuthFlow login failed. Verify that your redirect URL=[" + chrome.identity.getRedirectURL("oauth2") + "] is configured with your OAuth2 provider?");

      chrome.storage.local.set({
        isValidSession: false,
      }, function () { });

      return (null);
    }
  });
}

function getGMailProfile(access_token, completionCallback) {
  var x = new XMLHttpRequest();
  x.open('GET', 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=' + access_token);
  x.onload = function () {
    console.log(x.response);
    completionCallback(x.response);
  };
  x.send();
}

function parse(str) {
  if (typeof str !== 'string') {
    return {};
  }

  str = str.trim().replace(/^(\?|#|&)/, '');
  if (!str) {
    return {};
  }

  return str.split('&').reduce(function (ret, param) {
    var parts = param.replace(/\+/g, ' ').split('=');
    // Firefox (pre 40) decodes `%3D` to `=`
    // https://github.com/sindresorhus/query-string/pull/37
    var key = parts.shift();
    var val = parts.length > 0 ? parts.join('=') : undefined;
    key = decodeURIComponent(key);
    // missing `=` should be `null`:
    // http://w3.org/TR/2012/WD-url-20120524/#collect-url-parameters
    val = val === undefined ? null : decodeURIComponent(val);
    if (!ret.hasOwnProperty(key)) {
      ret[key] = val;
    }
    else if (Array.isArray(ret[key])) {
      ret[key].push(val);
    }
    else {
      ret[key] = [ret[key], val];
    }

    return ret;
  }, {});
}
