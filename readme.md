# ReFind for Chrome Gmail Plugin
## Overview
Our Gmail plugin uses the InboxSDK library to allow users to use Venue with Gmail. The plugin connects to our services in 2 ways:

1. We connect directly to our web services and make AJAX calls to fetch data about the users.
2. We connect to the portal to provide the UI to add and edit recipes, edit groups, and other functions.

## Setup
In order to connect to Venue, we need to set two settings in the extension options.

1. **Portal Host.** This is the address where the portal is located.
2. **Service Host.** This is the adress where the services are located.

At this point, the extension doesn't have the capacity to add new accounts to Venue. 
You need to connect to an already existing environment that you have setup on the mobile. 
The portal host and service host pair need to match up - you need to have added the account with the correct `UserAccountId` so that everything is aligned.

The extension options can be accessed by right clicking on the Venue icon in the upper right hand corner of the browser:

![](/docs_assets/Options.png)

and then clicking on Options.

You should see a screen that looks like this:

![](/docs_assets/OptionsScreen.png)

## Code

### content.js
Most of the application code resides in the file `content.js`. This file is what's called a **content script**. 
Content scripts form the backbone of the API for Chrome Extensions. They define custom code that can be run on certain pages. 
You can see in the application manifest (`manifest.json`) that our `content.js` file is set to run on `mail.google.com` and `inbox.google.com`:

```
"content_scripts": [
  {
    "matches": [
      "https://mail.google.com/*",
      "https://inbox.google.com/*"
    ],
    "js": [
      "lib/inboxsdk.js",
      "lib/jquery-3.3.1.min.js",
      "lib/ss-utils.js",
      "browser/make_browser_element.js",
      "tree/comparer.js",
      "content.js"
    ],
    "run_at": "document_end",
    "css": [
      "style.css"
    ]
  },
```

You can also see that this script is set to run at `document_end`, which means it runs after the page has loaded. 
There are other settings for `run_at` which you can use to run content scripts at different times in the page lifecycle.

### InboxSDK
Our application works primarily by interacting with the InboxSDK library. 
This library provides an API that allows us to rewrite the UI of Gmail and add our own custom code.

#### NavMenu
This API handles adding items to the left tree menu, underneath where all the folders are listed.

![](/docs_assets/Tree.png)

We populate this menu by requesting the full venue list of venues from the Venue web service. 
We then build the tree by adding a node for each venue recursively. This is done in the `buildChildren` function call.

The tree items also have a dropdown. It is accessed by clicking on the accessory button in the right hand side of the node. 
This dropdown is populated using the `onClick` property of the accessory button, which provides a callback that has a reference to a jQuery element object. 
We need to manipulate this object's `innerHTML`. From `buildChildren`:

```
children.forEach(x => {
			var routeId = `venues_${x.VenueId}`;
			var node = parentNode.addNavItem({
				name: x.Name,
				iconUrl: 'https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/VenueFolder.png',
				routeID: routeId,
				accessory: {
					type: 'DROPDOWN_BUTTON',
					onClick: function(event) {
						event.dropdown.el.innerHTML = `
							<ul class="venue_dropdown">
```

#### Router
If you look in `buildChildren` you can see how we handle clicking on each venue. We use the `Router` api. 
What this does is allows you to provide custom "routes" on top of the standard ones used inside Gmail. 
These routes allow you to specify a custom list of messages to display. 
We define a custom route for each venue in the tree, in the format: `venue_{VenueId}`. 
We then define the way to get the messages 
we call our `GetAllVenueItems` API (which returns a paged list of memberships for a given VenueId) using the `sdk.Router.handleCustomListRoute` method of the RouterSDK,
 which takes as arguments the route ID you're defining as well as the paging information relevant to the request (offset and max).

#### Thread view
Beyond the tree itself, we also provide custom controls when the user clicks on a specific message. 
These display on the right hand side of the window, in a 'daughter' window.

![](/docs_assets/Daughter.png)

This is set up using the `sdk.Conversations.registerThreadViewHandler` method. 
This gives us access to the daughter window, and allows us to query the messages being displayed as part of the thread 
(for example, to find out the email addresses of the other people in the thread), 
but does not provide any UI except for access to the containing div of the daughter window.

We need to fill in the UI of this screen using our own custom components. More info in that in the section [CSS](#css).

#### Toolbar
We add a button to the global toolbar that has global controls for your account. 
When we don't have a `UserAccountId` yet, this dropdown only presents the Login button (because you're logged out), 
when we do have a `UserAccountId` it presents more controls.

![](/docs_assets/GlobalDropdown.png)

We setup this button using the `sdk.Toolbars.addToolbarButtonForApp` method. 
We control the dropdown by providing a click handler for the button when setting it up (the function `app_button_click` below):

```js
sdk.Toolbars.addToolbarButtonForApp({
  title: "ReFind",
  iconUrl: 'https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/VenueLogo.png',
  hasDropdown: true,
  onClick: app_button_click
});
```

If we look at this function, we see that InboxSDK provides us with a reference to a jQuery element in this click handler. 
This element represents the dropdown. In order to populate it with our controls, we need to manipulate this element's `innerHTML`:

```
function app_button_click(event) {
		chrome.storage.local.get(['userAccountId'], function(result) {
			if (result.userAccountId) {
				event.dropdown.el.innerHTML = `
					<ul class='venue_dropdown'>
						<li class='dashboard_button'>
							<img src='https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/Dashboard.png'>
							Dashboard
						</li>
```

This is a common pattern in InboxSDK, you'll also see it when we add dropdowns to the tree items.

### Logging In
When we go to login to the system we have two goals in mind.

1. We need to login inside the browser so that cookies are set properly and when we show the portal inside of a daughter window, 
	it is already logged in with the correct account.
2. We need to obtain a `UserAccountID` as part of this process.

We tried using the OAuth method that's baked into Chrome extensions, but because they sandbox the browser they use to do that, 
it did not result in us being logged into the browser.

Here's what we do instead:

1. We send a message called login using `chrome.runtime.send`.
2. We listen for this message in a background script called `auth.js`. 
When we receive this message, we use the Chrome API to create a new window and inside that new window, we show the login screen.
3. The user uses this window to login to the app, using the normal process.
4. When the user finishes logging in, he will be directed to the `/Account/RegisterResultsForMobile` page of the portal, 
which basically just says you have been logged in correctly.
5. The page also raises an event called `setUserAccountId`. 
We have a content script called `registered.js` set to run on the portal `RegisterResultsForMobile` screen. 
It contains an event handler that listens for the `setUserAccountId` event.
6. This event handler stores the `UserAccountId` from the event in local storage and then sends a `close_window` message via `chrome.runtime.sendMessage` 
that tells the background script to close the window that was used to login.
7. In `content.js` we have an `onChanged` listener looking for changes to the `UserAccountId`. 
When the new value is valid, it setups up the ServerEvent listener and enables the full UI.

This achieves both of our purposes of having an active logged in session in the browser and getting a valid `UserAccountId` back from the portal. 
Whenever we need to query the state of the system and see if we're logged in, we just check the `UserAccountId`. If we have one, we're logged in.

The logout process simply involves clearing the value for `userAccountId` out of memory. 
The same `onChanged` listener will detect an empty value and disable most of the UI for the app.

### Interacting with the Portal
In order to present the portal inside of an `iframe` we have to do some kind of not straightforward things. 
By default, Chrome extensions do not let you show iframes from third-party websites. 
They also don't let you (easily) change the `src` at runtime. 
The details about these security restrictions are [here](https://developer.chrome.com/apps/app_external). 
In order to get around these security restricts, we have a complicated setup:

  1. We have a static html file `browser/browser.html`. This has nothing in it but links to the javascript files we use, including `browser/browser.js`.
  2. `browser.js` does the following:

    1. Creates the iframe element and adds it to the page.
    2. Reads the `path` and `portalHost` settings from the local storage.
    3. Sets the `src` of the `iframe` to the path from local storage.
    4. We're able to do this because `browser.html` is listed in `manifest.json` as a web accessible resource. 
	We would not be able to do this from inside of a content script.

  3. We use the script `make_browser_element.js` to create the web broswer. It has one function, `make_browser_element` that takes as arguments:

    1. The URL which the browser will be presenting.
    2. A function that will be called back with a reference to the browser (once created).

  It creates an `iframe` and then sets the source of it to be `browser.html` using `chrome.runtime.getURL` to get a full url for that file. 
  (This is only possible because `browser.html` is a web-accessible resource.) 
  It then storage the path in the local storage, sets some properties of the `iframe` that's been created, and then triggers the callback.

So basically what we're doing is setting the path in local storage every time someone tries to access the browser, 
and then the browser reads that value from local storage and presents the page that's been set there. 
The browser itself is an iframe embedded within an iframe. 
This appears to work because the external iframe is loaded from a static web accessible resource. 
This is the only way I was able to get an embedded browser to work because of the security restrictions.

#### Mole View
We currently present the portal in a mole view. This view is basically a "window". 
You can create multiple of them at the same time and you can minimize them and park them at the bottom of the window. 
This is how the Compose View works in regular Gmail.

![](/docs_assets/MoleView.png)

There are also options for a modal view (popup in middle of screen) and a drawer view (shows on the right side of the screen), 
but we've decided to use the Mole View because the other two are modal and black out the rest of the screen.

When we present the browser, we first call `make_browser_element` to create the browser, and then call `sdk.Widgets.showMoleView` from inside the callback, 
passing the browser element from the callback into the `showMoleView` method as the `el` property (which represents the content of the mole view).

For example, the following code shows the Edit Recipe screen from the portal inside of a mole view.

```js
var recipeId = $(this).attr('id');
			var url = `/portal/Outlook#!/tenant/recipes/detail/recipe//${recipeId}/`;
			make_browser_element(url, function(el) {
				sdk.Widgets.showMoleView({
					el: el,
					title: 'Edit Recipe'
				});
			});
			close_dropdowns();
```

### Syntax
Because we have to use `innerHTML` to build elements on the page in javascript, we're often in the position of writing large amounts of inline javascript.

In order to make this easier we use the \` backtick syntax to handle large chunks of html inside of javascript. This enables us to:
  1. Use single and double quotes unescaped inside inline html
  2. Insert interpolated variables using the `${}` syntax
  3. Get code hightlight of the html from inside a text editor.

In general, the format we're using is to open the html block with a backtick, 
then create a new line then write all the html in the following lines using normal html syntax conventions and line spacing 
(aka feel free to use as many lines as you need inside the html code block), and then ending the block with a newline and another tick on its own. 
For example, this is us setting the innerHTML for the dropdown on the NavMenu:

```js
event.dropdown.el.innerHTML = `
  <ul class='venue_dropdown'>
    <li class='add_recipe_button'>
      <img src='https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/Recipe.png'>
      Add Recipe
    </li>
    <li class='add_cookbook_button'>
      <img src='https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/Cookbooks.png'>
      Add Cookbook
    </li>
    <li class='edit_recipes_button'>
      <img src='https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/ListIcon.png'>
      List Recipes
    </li>
  </ul>
`;
```

### Handling clicks
Because all of the html we're using is added to the page via javascript, we need to use `$(document).on` syntax. 
This allows you to add jQuery event handlers to elements that will be added to the page in the future, not just elements that are already there.

We set these up all in the function `init_event_handlers()`. Here is an example of when we add the click handler for the recipe button:

```js
$(document).on('click', ".recipe_button", function() {
  var recipeId = $(this).attr('id');
  var url = `/portal/Outlook#!/tenant/recipes/detail/recipe//${recipeId}/`;
  make_browser_element(url, function(el) {
    sdk.Widgets.showMoleView({
      el: el,
      title: 'Edit Recipe'
    });
  });
  close_dropdowns();
});
```

This is a pretty standard jQuery way to handle clicks, but I thought I should document it. 
If we want to pass in some specific information to the function call, we set an attribute on the html element that we're clicking 
(in the example above, we need to know the recipe id of the recipe we've clicked on in order to edit it), 
and then interrogate it in the click handler to read that value. In the above example we use the `id` attribute of the element, 
but we could just as easily assign the element a custom attribute (like `<div class='recipe_button' recipeId='%RECIPEID%'>`), 
and then read that attribute in the exact same way.

Note that I explored using a more feature-rich javascript framework, with data-binding (I looked into angular, react, and vue), 
but all of them presented major hurdles considering that InboxSDK requires us to interact with it in multiple places using inline html with `innerHTML` calls, 
and just in general the strict content security policy rules for extensions make it seem like too big a hurdle, 
especially considering the small amount of code currently in the application. 
For now, I think we're stuck using old school jQuery, but that may be something to explore in the future.

### Refreshing the tree
The tree view needs to be updated in real time as venues are added to and removed from the system. 
This could happen at any time - we add venues when we create new recipes, but that can happen from any device and doesn't necessarily need to happen on the browser, 
and it can also just happen when we receive a new email message.

Therefore, we need a way to push updates to the extension.

In lieu of setting up MQ and reading all the updates that we are already sending to the mobile (which might be a lot to do inside of a chrome extension), 
we are instead using the Server Events library. 
You can read more about that [here](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

Because we're using ServiceStack to generate these events on the server side, we also use ServiceStack's library on the client side to read those events. 
You'll see that `lib/ss-utils.js` is included as a content script. This library sets up a connection to our server and then streams the messages.

It's supposed to be able to be typed, so you can setup the event handler in javascript to only respond to one static class of events being sent from the server, 
but we're having some trouble getting that working. 
You can read more about the ServiceStack library for handling server events [here](https://docs.servicestack.net/server-events).

In lieu of being able to use the type system, you'll see when we parse server events, we instead interrogate the `Message` property of the object, 
to see if the message matches the value `Venues changed`:

```js
function setup_tree_listener() {
  chrome.storage.local.get(['userAccountId', 'serviceHost'], function(result) {
    var url = `${result.serviceHost}/venue/event-stream?channel=${result.userAccountId}`;
    var source = new EventSource(`${result.serviceHost}/venue/event-stream?channel=${result.userAccountId}`);
    $(source).handleServerEvents({
      handlers: {
        onMessage: function (msg, e) { // fired after every message
          console.log(msg);
          if (msg.Message === "Folders changed") {
            needs_refresh = true;
          }
        },
      }
    });
  });
}
```

Ideally, instead of having the handler be `onMessage`, we would have a handler called something like `VenueTreeChanged` 
(the type of the event on the server) and we would only respond to that. Something like:

```js
handlers: {
  VenueTreeChanged: function (msg, e) { // fired after every message
    needs_refresh = true;
  },
}
```

When we had this in the code, however, none of the handlers were being called. I'm not sure what the problem was there.

These events are triggered on the server whenever a `ReturnedVenueMembers` object is sent out that contains either an added or deleted venue in its payload. 
They are also sent out when recipes are deleted. They may need to be sent out from the server more in order to keep the tree up to date, 
but so far this strategy is more or less working.

However, especially when added new recipes that are parsing a long backlog and creating a lot of new subvenues, 
these events tend to come in too quickly to actually use them to trigger a full venue tree refresh. 
We had that code in in the past and the app would just crash (the Gmail screen would reload). 
Therefore we take a deferred approach where we simply set the `needs_refresh` global to be `true` and move on.

Instead there is a method called `init_refresh` which uses `setInterval` to check for changes to this property every 5 seconds. 
This definitely could be improved, either by being more judicious about sending the events, 
or using a different strategy other than polling to check if the tree needs updating, 
but it was the most expedient one for an MVP and that's why we're using it.

### CSS
We use a small library of css classes (see `styles.css`) to build most of the custom UI that we display in the app. 
Almost everything is built with `<ul>` tags with the individual list items representing one full-width button. 
The class is called `.venue_dropdown`.

```css
ul.venue_dropdown {
  list-style: none;
  padding: 0;
  margin: 0;
  min-width: 200px;
  font-size: 13px;
  line-height: 1em;
  text-align: left;
}

ul.venue_dropdown li {
  padding: 10px;
  cursor: pointer;
}

ul.venue_dropdown li:hover {
  background: #eee;
}

ul.venue_dropdown li img {
  float:left;
  height: 1.3em;
  width: 1.3em;
  margin-top: -.15em;
  margin-right: 10px;
}
```

Each list item has an optional space for an `<img>` tag inside of it. We generally try to add an icon for each list item. 
We store the icons on Amazon S3 and load them directly from there.

For example, there are the buttons for the menu that shows up when you click on the Venue button in the tree:

```html
<ul class='venue_dropdown'>
  <li class='add_recipe_button'>
    <img src='https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/Recipe.png'>
    Add Recipe
  </li>
  <li class='add_cookbook_button'>
    <img src='https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/Cookbooks.png'>
    Add Cookbook
  </li>
  <li class='edit_recipes_button'>
    <img src='https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/ListIcon.png'>
    List Recipes
  </li>
</ul>
```

This is what it looks like rendered:

![](/docs_assets/DropdownRendered.png)

## Directions To Install
1. Make sure Chrome is in 'DeveloperMode'
  1. Go to `chrome://extensions` in chrome
  2. Toggle the switch in the top right to go into developer mode.
2. You should then see a button called 'Load Unpacked'
3. Click that button, and then pick this directory.
4. You will now have the app loaded.
