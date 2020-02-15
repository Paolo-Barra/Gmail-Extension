"use strict";

// ReFind Plugin for Gmail (C)2019 - ReFind Inc. 
// Frontend implemenation 
// 
// Librarys used: 
// 		SeviceStack -  https://docs.servicestack.net/javascript-client $.ss and $.fn variables 
// 		SeviceStack Server Side events - https://docs.servicestack.net/javascript-server-events-client
// 		InboxSDK - https://www.inboxsdk.com/docs
//		jQuery   - https://api.jquery.com/on/

var refindInst;
class RefindForChrome {

	// sdk_ReFindForGmail_ca4b170f16 is our ID created on the inboxSDK website 
	// InboxSDK API Key 
	// https://www.inboxsdk.com/register
	// sdk_reFind_ForEmail_67ecda266d created on 8/12/2019

	constructor(_sdk) {
		sdk = _sdk;
		refindInst = this;

		// Global properties
		refindInst.sseEventSource = undefined;		// Object: EventSource - https://docs.servicestack.net/javascript-server-events-client
		refindInst.venueItem = undefined; 		    // Object: NavItemView - https://www.inboxsdk.com/docs/#NavItemView
		refindInst.activeLabels = [];				// Array:String - an array of labels -- not well known 
		refindInst.needs_refresh = true;			// boolean - set to true when EventSource event occurs 	
		refindInst.menuEvents = undefined;			// MenuEventHandlers: 
		refindInst.RUNTIME_VERSION_NUMBER = "3.1"; // printed to be sure we using the latest source
		refindInst.show_refind_icon = false; 		// if true, display an icon for refind on left side
		refindInst.top_level_venues = {};			// a list of top level venue so removing is easy
		refindInst.app_menu = undefined;			// The top right corner reFind menu		
		refindInst.isValidSession = false;
		refindInst.refreshInterval = undefined;		// The inverval object that refreshes the venue tree

		// constants 


		refindInst.iconHost = "https://venuestorageaccount.blob.core.windows.net/staticfiles/GmailPlugin";
		//refindInst.iconHost = "https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin";
		refindInst.TOPLEVELVENUE = "TopLevel"
		refindInst.APPLICATION_TITLE = "ReFind"
		refindInst.myEmailAddress = sdk.User.getEmailAddress().toLowerCase();

	}

	/* Init functions */
	
	// Initialize the refind session
	// Check if we need to login	
	initRefindSession = () => {

		console.log("initializing session");
		// By default when we start the session we mark it as invalid
		// This allows to:
		// - Verify if the current email is valid
		// - Check if we must present the login screen or show the venue tree
		chrome.storage.local.set({
			isValidSession: false,
			theme: 'color'
		}, () => {

			// Tell backend to be sure were still using the same users
			chrome.runtime.sendMessage({
				type: "onload",
				userEmail: sdk.User.getEmailAddress()
			});

			refindInst.menuEvents = new MenuEventHandlers(sdk, this);
			refindInst.menuEvents.init_event_handlers();

			refindInst.needs_refresh = true;			
			refindInst.init_refresh();
			refindInst.init_tree();

			refindInst.initMessageHandlers();

			refindInst.setup_app_icon_state();
		});
		chrome.runtime.onMessage.addListener(
			function (request, sender, sendResponse) {
				if (request.message === "refind_background_error") {
					$('.inboxsdk__button_iconImg').css('border', '2px solid red');
					console.error("background error", request.error);
				}
				if(request === "refind_update_session_state") {
					refindInst.validate_session_state();
				}
			});
	}

	validate_session_state = () => {

		chrome.storage.local.get(['userEmail'], (result) => {
			let currentEmail = sdk.User.getEmailAddress();
			refindInst.isValidSession = true;
			if(result.userEmail === undefined || result.userEmail != currentEmail) {
				console.log(`validate_session_state:session is invalid:Current email is not logged in to reFind`);
				refindInst.isValidSession = false;
			}
			
			refindInst.setup_app_icon_state();

			console.log(`validate_session_state:Stored email=[${result.userEmail}]`);
			console.log(`validate_session_state:Current email=[${currentEmail}]`);
			console.log(`validate_session_state:refindInst.isValidSession=[${refindInst.isValidSession}]`);
			//console.log(refindInst.app_menu);
		});
	}

	initMessageHandlers = () => {
		chrome.storage.onChanged.addListener((changes, area) => {
			// Listen for changes to the chrome local storage 
			// if we make a change to local storage, and it containes the key 'isValidSession' and that value is set, then setup_tree_listener, else remove it 
			if ('isValidSession' in changes) {
				if (changes.isValidSession.newValue) {
					console.log("Session is valid: setup_tree_listener");
					refindInst.needs_refresh = true;
					refindInst.isValidSession = true;
					
					refindInst.init_refresh();
					refindInst.setup_tree_listener();
					refindInst.validate_session_state();
				}
				else {
					console.log("Session is not valid: Removing eventReceivers");
					if ($.ss && $.ss.eventReceivers) {
						$.ss.eventReceivers["window"] = null;
					}

					refindInst.clearVenueTree();
					refindInst.setup_app_icon_state();
					refindInst.isValidSession = false;
				}
			}

			// If the environment has been switched we need to login again
			if ('switchedEnvironment' in changes) {
				if (changes.switchedEnvironment.newValue) {

					refindInst.isValidSession = false;

					// Set the switched environment flag to false now that the switch is completed
					chrome.storage.local.set({
						switchedEnvironment: false
					}, () => { });

					refindInst.setup_app_icon_state();
				}
			}
		});
	}

	logoutRefind = () => {

		refindInst.stopServerSentEventsListener();

		chrome.storage.local.set({			
			userLoggedOut: true,
			isValidSession: false
		}, () => {
			refindInst.setup_app_icon_state();
			console.log("Logout completed");
		});

		refindInst.refresh_tree();
	}
	
	init_refresh = () => {
		// refreshes the left side tree of controls every 5 seconds 
		console.log("init_refresh");
		refindInst.refreshInterval = setInterval(() => { refindInst.refresh_tree(); }, 5000);
	}

	init_app_button = (loggedIn) => {

		if (refindInst.app_menu) {
			refindInst.app_menu.close();
			refindInst.app_menu.remove();
			refindInst.app_menu = undefined;
		}

		// shows a button in the upper right named "refind" that has a drop drown menu
		let isValidSession = (loggedIn && refindInst.isValidSession);
		console.log(`init_app_button:loggedIn=${loggedIn}`);
		console.log(`init_app_button:isValidSession=${refindInst.isValidSession}`);

		let icon =  isValidSession ? 'VenueLogo.png' : 'VenueLogoDark.png';
		console.log(`init_app_button:Icon for dropdown=${refindInst.iconHost}/${icon}`)
		refindInst.app_menu = sdk.Toolbars.addToolbarButtonForApp({
			title: refindInst.APPLICATION_TITLE,
			iconUrl: `${refindInst.iconHost}/${icon}`,
			hasDropdown: true,
			onClick: refindInst.refind_dropdown_button_click
		});
	}

	setup_app_icon_state = () => {

		chrome.storage.local.get(['userLoggedOut'], (result) => {
			// console.log("loginToRefind");
			 console.log(`userLoggedOut=${result.userLoggedOut}`);
			refindInst.init_app_button(result.userLoggedOut === false);
		});
	}

	loginToRefind = () => {

		chrome.storage.local.set({'userLoggedOut': false, 'isValidSession': false }, function () {

			chrome.runtime.sendMessage({
				type: "onload",
				userEmail: sdk.User.getEmailAddress()
			})

			refindInst.setup_app_icon_state();

			// Display the venue tree
			refindInst.init_tree();
		});
	}

	init_tree = () => {
		refindInst.executeIfValidSession(
			() => { refindInst.setup_tree_listener(); },
			() => { refindInst.stopServerSentEventsListener(); }
		);
	}

	stopServerSentEventsListener = () => {
		console.log("stopServerSentEventsListener");
		if ($(refindInst.sseEventSource) !== undefined) {


			$.ss.eventReceivers["window"] = null;

			// Stop refreshing the venue tree
			if(refindInst.refreshInterval) {
				console.log("clearInterval");
				clearInterval(refindInst.refreshInterval);
				refindInst.refreshInterval = undefined;
			}
		}
	}

	setup_tree_listener = () => {
		// setup listener for server side events.
		console.log("setup_tree_listener");
		chrome.storage.local.get(['isValidSession', 'userAccountId', 'serviceHost'], (result) => {
			if (result.isValidSession == false) return;

			// listen on the channel of the UserAccountId 
			var url = `${result.serviceHost}/sse/event-stream?channel=${result.userAccountId}`;
			console.log(`setup_tree_listener:Url=${url}`);

			refindInst.sseEventSource = new EventSource(url);
			$(refindInst.sseEventSource).handleServerEvents({
				handlers: {
					onMessage: (msg, e) => {						
						// fired after every message
						if (msg.Message === "Venues changed") {
							
							console.log("SSE:Venues have been updated, refreshing Venue tree");
							refindInst.needs_refresh = true;
							//refindInst.refresh_tree();
						}
						if (msg.Message === "Account Removed") 
						{
							refindInst.logoutRefind();
							console.log("SSE:Account Removed:Logging out of ");
						}
					},
				},
				onException: (e) => {
					console.log("SSE:onException:=" + e.name + ': ' + e.message);
					console.log(e);
				},
				onReconnect: (e) => {
					console.log("SSE:onReconnect:" + e)
				}
			});

			// Perform a first refresh so that we display the venues as soon as the gmail page loads
			refindInst.needs_refresh = true;
			refindInst.refresh_tree();
		});
	}

	clear_selected_keyword = () => {
		$('#selected_text_manager').html("");
	}

	set_keyword_update_status = (value) => {
		$("#selected_text_status").text(value);
		$("#selected_text_status").css("display", "block");
		setTimeout(() => {
			$("#selected_text_status").text("")
			$("#selected_text_status").css("display", "none");
		}, 3000);
	}

	// Execute the callback is the Refind session is valid
	executeIfValidSession = (validSessionCallback, invalidSessionCallback) => {

		chrome.storage.local.get(['isValidSession', 'userLoggedOut'], (result) => {

			if (result.userLoggedOut) {
				console.log("Invalid session, user is not logged in");
				invalidSessionCallback();
				return;
			}

			// IF we don't have a valid session log a warning and return
			if (result.isValidSession === false || result.isValidSession === undefined || refindInst.isValidSession === false) {
				invalidSessionCallback();
				return;
			}
			
			// The session is valid, execute the callback
			validSessionCallback();
		});
	}

	clearVenueTree = () => {
		
		// Remove all the venue nodes 
		for (var key in refindInst.top_level_venues) {
			var node = refindInst.top_level_venues[key];
			node.remove();		
		}

		// Clear the cached venue nodes
		refindInst.top_level_venues = {};

		// If we have a top level venue remove it
		if (refindInst.venueItem) {
			if (refindInst.show_refind_icon) {
				refindInst.venueItem.remove();
			}			
		}
	}

	refresh_tree = () => {

		// There has been a change to the left side folder tree
		// Calculate the changes and update Gmail with the changes 
		try {
			if (refindInst.needs_refresh === false) {
				//console.log("Tree doesn't need refresh");
				return;
			}

			refindInst.clearVenueTree();

			refindInst.executeIfValidSession(() => {

				console.log("refresh_tree");
				chrome.storage.local.get(['serviceHost', 'userAccountId'], (result) => {

					if (result.userAccountId === undefined) {
						console.warn('No user account id found, not displaying the venue tree');
						return;
					}

					// ask the SyncService for the changed venue list 
					chrome.runtime.sendMessage({
						type: "GetVenues",
						serviceHost: result.serviceHost,
						userAccountId: result.userAccountId,
						mailAccountId: `${sdk.User.getEmailAddress()}_Gmail`
					},
						(response) => {
							if (refindInst.show_refind_icon) {
								// add a new menu containing, to the icon showing "refind" in the left side tree
								refindInst.venueItem = sdk.NavMenu.addNavItem({
									name: refindInst.APPLICATION_TITLE,
									iconUrl: `${refindInst.iconHost}/VenueLogo.png`,
									accessory: {
										type: 'DROPDOWN_BUTTON',
										onClick: (event) => {
											// Right Click Drop down next to Left menu veneu icon
											event.dropdown.el.innerHTML = `<ul class='venue_dropdown'>
											<li class='add_recipe_button'>
												<img src='${refindInst.iconHost}/Recipe.png'>
												Add Recipe 
											</li>
											<li class='add_cookbook_button'>
												<img src='${refindInst.iconHost}/Cookbooks.png'>
												Add asfasfsf
											</li>
											<li class='edit_recipes_button'>
												<img src='${refindInst.iconHost}/ListIcon.png'>
												List recipes
											</li>
											</ul>
											`;
											refindInst.menuEvents.registerDropdown(event.dropdown);
										}
									}
								});
							}
							else {
								// Venues at top level  
								refindInst.venueItem = sdk.NavMenu;
							}
							// populate sub-items with the recipes 
							refindInst.buildChildren(response.Venues, refindInst.venueItem, { VenueId: refindInst.TOPLEVELVENUE }, result.serviceHost, result.userAccountId);
							refindInst.needs_refresh = false;
						});
				});
			}, () => { });
		}
		catch (e) {
			console.warn(`Error:refresh_tree=${e}`);
		}
	}

	buildChildren = (venueBlockList, gmailFolderNode, parentVenue, serviceHost, userAccountId) => {
		// Recursive function that add's tree elements to Refind icon on the left 
		// venueBlockList:VenueBlockDto, gmailFolderNode:NavItemView  , parentVenue:VenueBLockDto.  serviceHost:string, userAccountId:string

		// venueBlockList - recurivly populated list of VenueBlocks for folders that are childern of parentVenue
		// gmailFolderNode - A InboxSdkView where we add folders 
		// parentVenue - the currently selected node in the list of VenueBlockDto's
		// serviceHost - the url of the syncservice system  
		// userAccountId - the uid of the current user 

		// go throught the entire list and only process venues for the parents folder 
		var childVenues = venueBlockList.filter(x => x.ParentVenueId === parentVenue.VenueId);
		if (childVenues.length === 0) {
			return;
		}

		// get a Comparer object that can sort the list using Alpha,ReversAlpha,Date etc.etc.
		var comparer = Comparer.get_comparer(parentVenue);
		childVenues = childVenues.sort(comparer);
		childVenues.forEach(x => {
			// the remaining nodes are sorted correclty 
			var routeId = `venues_${x.VenueId}`;

			// add a new node to the tree 
			var node = gmailFolderNode.addNavItem({
				name: x.Name,
				iconUrl: `${refindInst.iconHost}/VenueFolder.png`,
				routeID: routeId,
				onClick: (event) => {
					// InboxSDK: NavItemDescriptor:onClick event receives direct clicks on the node regardless of the state(expanded/collapsed)					
					var thisNode = refindInst.top_level_venues[routeId];
					if (thisNode) {
						// Expand or collapse the node depending on previous state
						// If the node doesn't have subnodes nothing happens
						thisNode.setCollapsed(!thisNode.isCollapsed());
					}
					refindInst.menuEvents.close_dropdowns();					
				},
				accessory: {
					type: 'DROPDOWN_BUTTON',

					onClick: (event) => {
						// menu that is displayed when you click on a added folder 
						event.dropdown.el.innerHTML = `
							<ul class="venue_dropdown">
								<li class='recipe_button' id='${x.OwnerId}'>
									<img src='${refindInst.iconHost}/Recipe.png'>
									View Recipe
								</li>
								<li><input type='text' class='venue_search' venueId='${x.VenueId}' placeholder='Search in ${x.Name}'></li>
							</ul>
							`;
						refindInst.menuEvents.registerDropdown(event.dropdown);
					}
				}
			});
			node.setCollapsed(true);

			// Store a reference to this venue node so we can remove it later if logging out or switching environments
			refindInst.top_level_venues[routeId] = node;

			// for the new node, make sure it has a callback so when its clicked we display something 
			sdk.Router.handleCustomRoute(routeId, (customRouteView) => {

				let offset = 0;
				let max = 50;  // maxiumn number of threads returned by syncservice 
				return new Promise((resolve, reject) => {

					// ask syncservice for a list of messages threads. this occurs when the user clicks on the venue 
					let getExtendedRequest = {
						type: "GetAllVenueItemsExtended",
						serviceHost: serviceHost,
						userAccountId: userAccountId,
						mailAccountId: `${sdk.User.getEmailAddress()}_Gmail`,
						deviceId: 'Gmail',
						venueId: x.VenueId,
						recipeId: x.OwnerId,
						offset: offset,
						parentVenueId: x.ParentVenueId,
						max: max
					}
					refindInst.listVenueItems(routeId, customRouteView, getExtendedRequest);

				}).catch((e) => {
					console.warn(`Error:buildChildren:handleCustomRoute=${e}`);
				});
			});
			// add the required children for this new node 
			refindInst.buildChildren(venueBlockList, node, x, serviceHost, userAccountId);
		});
	}

	listVenueItems = (routeId, customRouteView, getAllVenuesRequest) => {

		// the user has just clicked on a new venue in the tree.  Ask the syncsservice for the associated messages 
		chrome.runtime.sendMessage(getAllVenuesRequest,
			// result:GetAllvenueItemsExtendedResponse 
			(result) => {
				console.log("----------- THREADS RESULT FROM SERVER--------------");
				if (result.Total == 0) {
					if (getAllVenuesRequest.parentVenueId == refindInst.TOPLEVELVENUE) {

						// if (routeId !== "") {
						// 	var thisNode = refindInst.top_level_venues[routeId];
						// 	if (thisNode) {
						// 		//console.log(`Node is collapsed=[${thisNode.isCollapsed()}]:Id=[${routeId}]`);
						// 		thisNode.setCollapsed(!thisNode.isCollapsed());								
						// 	}
						// }
						refindInst.menuEvents.close_dropdowns();						
					}
					else {
						// This venue contains no items 
						refindInst.createCustomEmptyView(customRouteView);
					}

				} else {
					// this venue has messages display them.
					var threadList = {
						// go through the GetAllvenueItemsExtendedResponse::Items collection and gather only the threadId's.
						threads: result.Items.map(x => {
							return {
								threadId: x.GmailThreadId
							}
						}),
						total: result.Total
					};

					chrome.storage.local.get(['serviceHost', 'userAccountId'],
						// with the valid host and uid 
						(result) => {
							// NOTE: future optimization:  Everytime we click on a venue we ask syncservice for the access token.  It never changes 
							chrome.runtime.sendMessage(
								{
									type: "GetClientAccessToken",
									serviceHost: result.serviceHost,
									userAccountId: result.userAccountId,
									mailAccountId: `${sdk.User.getEmailAddress()}_Gmail`,
									deviceId: 'ChromeExtensionId'
								},
								(authResponse) => {
									console.log('---------- ACCESS TOKEN FROM SERVER RESULT --------------');
									console.log(authResponse.AuthToken);
									chrome.runtime.sendMessage(
										{
											// now that we have the oauth token and the threadlist.  
											// Ask gmail for the actual messages 
											type: "getGmailThreads",
											threads: threadList.threads,
											total: threadList.threads.length,
											userEmail: sdk.User.getEmailAddress(),
											token: authResponse.AuthToken
										},
										(gmailAPIresponse) => {
											console.log("----------- THREADS RESULT FROM GMAIL API--------------");
											console.log(gmailAPIresponse);
											gmailAPIresponse.total = threadList.total;

											// format the list of messages into an actual view 
											refindInst.createCustomView(customRouteView, gmailAPIresponse, getAllVenuesRequest);
										}
									);
								});
						});
				}
			});
	}

	createCustomEmptyView = (customRouteView) => {
		var message = `
		<style>
			.center-div {
				position: relative;
				margin: auto;
				top: 1%;
				right: 0;
				bottom: 0;
				left: 0;
				width: 600px;
				border-radius: 3px;
			}
		</style>
		<p class="center-div">
				<strong>There are no messages in this recipe.</strong>
		</p>`;
		var customHTMLContainer = customRouteView.getElement();
		$(customHTMLContainer).html(message);
	}

	stringAsHex = (decString) => {
		return parseInt(decString).toString(16);
	}

	refind_dropdown_button_click = (event) => {

		$('.inboxsdk__button_iconImg').css('border', 'none');

		// generates upper right drop-down menue showing choices.  Attached to the Refind button in the upper right
		chrome.storage.local.get(['userName', 'serviceHost', 'userAccountId', 'environment'], function (result) {

			var nameField = "";
			if (result.userName) {
				nameField = `<B>${result.userName}</B>`;
			}
			refindInst.executeIfValidSession(
				() => {
					const envDesc = result.environment ? `${result.environment}: environment` : "No Environment Selected";
					// Logged in session handler
					event.dropdown.el.innerHTML = `
					<p>
						<div class="venue_dropdown_user">
							<img src="${chrome.extension.getURL("img/avatar.svg")}" width="50px" height="50px" style="border-radius: 50%; margin-left: 10px;" />
							<div class="venue_dropdown_user_info">
								${nameField}
								<p>${sdk.User.getEmailAddress()}</p>
								<p>${envDesc}</p>
								<p><i>Logged In</i></p>								
							</div>	
						</div>
						</p>
						<HR>
						<ul class='venue_dropdown'>
							<li class='portal_button'>Portal</li>
							<li class='add_recipe_button'>Add recipe</li>
							<li class='edit_recipes_button'>Installed recipes</li>
							<HR>
							<li class='logout_button'>Sign Out</li>
						</ul>
					`;
					refindInst.menuEvents.registerDropdown(event.dropdown);
				},
				() => {

					// Logged out session handler					
					const loginDesc = `Sign In`;
					const loginClass = "login_button";

					event.dropdown.el.innerHTML = `
					<P>
					<div class="venue_dropdown_user">
						<img src="${chrome.extension.getURL("img/avatar.svg")}" width="50px" height="50px" style="border-radius: 50%; margin-left: 10px;" />
						<div class="venue_dropdown_user_info">
							${nameField}
							<p>${sdk.User.getEmailAddress()}</p>
							<p class="envs_button">${result.environment}: Environment</p>
							<p><i>Logged Out</i></p>		
						</div>
					</div>
					</P>
					<HR>
						<ul class='venue_dropdown'>
							<li class='${loginClass}'>
								${loginDesc}
							</li>
							<li class='envs_button'>
								Select Environment
							</li>
						</ul>
					`;
					refindInst.menuEvents.registerDropdown(event.dropdown);
				});
		});
	}

	// -----------------------------------------  start move to class for CustomViewCreation ----------------------
	createCustomView = (customRouteView, gmailThreadsArray, localGetMessageRequest) => {
		var newStartThread = localGetMessageRequest.offset + 1;
		var newEndThread = newStartThread + 50;
		var totalThread = gmailThreadsArray.total;
		refindInst.activeLabels = [];

		// THIS IS CREATION OF TOP TOOLBAR
		var toolbar = '<div id="custom-inbox-list">' +
			'<div class="full-nav">' +
			//THIS IS LEFT SIDE OF TOOLBAR
			'<div class="nav-row-left">' +
			'<div class="checkboxAll-outer">' +
			'<input id="checkboxAllId" class="checkboxAll" type="checkbox" name="checkboxAll" value="valueCheckboxAll">' +
			'<span class="fa fa-caret-down fa-sm dropdownAll"></span>' +
			'</div>' +
			'<span id="refreshAllId" class="fa fa-repeat fa-2x va0 refreshAll"></span>' +
			'<div id="extraToolbarId" class="displayNone">' +
			'<span id="archiveAllId" class="fa fa-archive fa-lg va0 extra-toolbar-icon " ></span>' +
			'<span id="spamAllId" class="fa fa-exclamation-circle fa-lg va0 extra-toolbar-icon " ></span>' +
			'<span id="trashAllId" class="fa fa-trash fa-lg va0 extra-toolbar-icon " ></span>' +
			'  |  ' +
			'<span id="markAsReadAllId" class="fa fa-envelope-open fa-lg va0 extra-toolbar-icon" ></span>' +
			'<span id="markAsUnreadAllId" class="fa fa-envelope fa-lg va0 extra-toolbar-icon" ></span>' +
			'<span id="snoozeAllId" class="fa fa-clock-o fa-lg va0 extra-toolbar-icon" ></span>' +
			'  |  ' +
			'<span id="moveToAllId" class="fa fa-folder fa-lg va0 extra-toolbar-icon" ></span>' +
			'<div id="labelAllId" class="fa fa-arrow-right fa-lg va0 extra-toolbar-icon labelDropdown" ></div>' +
			'<div id="labelDropdown" class="label-box labelDropdown-content stop-label-dropdown-event">' +
			'<div id="listAllLabels" class="labelsList">' +
			//labels go here
			'</div>' +
			'<div class="mySeparator"></div>' +
			'<div class="manage-labels">Manage labels</div>' +
			'<div id="addLabels" class="add-labels displayNone">Add labels</div>' +
			'</div>' +
			'</div>' +
			'</div>' +

			// THIS IS RIGHT SIDE OF TOOLBAR
			'<div class="nav-row-right">' +
			'<div class="nav-box boxDropdown">' +
			newStartThread + ' - ' + newEndThread + ' of ' + totalThread +
			'</div>' +
			'<div id="boxDropdown" class="boxDropdown-content">' +
			'<div class="newest">Newest</div>' +
			'<div class="oldest">Oldest</div>' +
			'</div>' +
			'<span class="fa fa-angle-left fa-lg va0 nav-prev-page" ></span>' +
			'<span class="fa fa-angle-right fa-lg va0 nav-next-page" ></span>' +
			'<span class="fa fa-cog fa-lg va0 nav-settings settingsDropdown" ></span>' +
			'<div id="settingsDropdown" class="settingsDropdown-content">' +
			'<a class="mySettings" href="#settings/general">Settings</a>' +
			'</div>' +
			'</div>' +
			'</div>' +
			'<div id="messages">' +
			'    <table class="table table-inbox">' +
			'        <tbody></tbody>' +
			'    </table>' +
			'</div>' +
			'</div>';

		var customHTMLContainer = customRouteView.getElement();
		$(customHTMLContainer).html(toolbar);

		var sortable = [];
		$.each(gmailThreadsArray.messages, function (key, val) {
			sortable.push(val);
		});

		sortable.sort(function (a, b) {
			var msgsLen1 = a.messages.length;
			var msgsLen2 = b.messages.length;
			var lastMsg1 = a.messages[msgsLen1 - 1];
			var lastMsg2 = b.messages[msgsLen2 - 1];
			var date1 = lastMsg1.internalDate;
			var date2 = lastMsg2.internalDate;
			return date2 - date1;
		});

		var max = 50;

		//generate messages
		sortable.forEach(function (obj, i) {
			if (i < max) {
				try {
					//CREATE ROW FOR EACH THREAD
					var trashed = false;
					for (var j = 0; j < obj.messages[0].labelIds.length; j++) {
						if (obj.messages[0].labelIds[j] == 'TRASH') trashed = true;
					}
					if (!trashed) refindInst.appendThreadRow(obj, i);
				}
				catch (e) {
					console.warn(`Error:createCustomView=${e}`);
				}
			}
		});

		refindInst.manageLabels();

		// CONNECT ALL EVENTS TO BUTTONS
		$('.checkboxAll').on('click', function (e) {
			var element = document.getElementById("checkboxAllId");
			var tempThreads = document.getElementsByClassName("thread-row");
			var refreshAll = document.getElementById("refreshAllId");
			var extraToolbar = document.getElementById("extraToolbarId");

			if (element.checked) {
				var i;
				for (i = 0; i < tempThreads.length; i++) {
					var tempThreadId = tempThreads[i].getAttribute("data-thread-id");
					var thisThreadHover = document.getElementById("thread-hover-" + tempThreadId);
					thisThreadHover.classList.add("selectedThread");
					tempThreads[i].classList.add('selectedThread');
					document.getElementById("checkboxId" + tempThreadId).checked = true;
				}
				if (!refreshAll.classList.contains("displayNone")) {
					refreshAll.classList.add("displayNone");
					extraToolbar.classList.remove("displayNone");
				}
				refindInst.findUnreadThreads();
			} else {
				var i;
				for (i = 0; i < tempThreads.length; i++) {
					var tempThreadId = tempThreads[i].getAttribute("data-thread-id");
					var thisThreadHover = document.getElementById("thread-hover-" + tempThreadId);
					thisThreadHover.classList.remove("selectedThread");
					tempThreads[i].classList.remove('selectedThread');
					document.getElementById("checkboxId" + tempThreadId).checked = false;
				}
				if (refreshAll.classList.contains("displayNone")) {
					refreshAll.classList.remove("displayNone");
					extraToolbar.classList.add("displayNone");
				}
			}
		});

		$('#archiveAllId').on('click', function (e) {
			var tempThreads = document.getElementsByClassName("selectedThread");
			for (var i = 0; i < tempThreads.length; i++) {
				if (tempThreads[i].classList.contains('thread-row')) {
					var id = tempThreads[i].dataset.threadId;
					refindInst.modifyThread(id, 'archiveThread');
				}
			};
		});

		$('#spamAllId').on('click', function (e) {
			var tempThreads = document.getElementsByClassName("selectedThread");
			for (var i = 0; i < tempThreads.length; i++) {
				if (tempThreads[i].classList.contains('thread-row')) {
					var id = tempThreads[i].dataset.threadId;
					refindInst.modifyThread(id, 'spamThread');
				}
			};
		});

		$('#trashAllId').on('click', function (e) {
			var tempThreads = document.getElementsByClassName("selectedThread");
			for (var i = 0; i < tempThreads.length; i++) {
				if (tempThreads[i].classList.contains('thread-row')) {
					var id = tempThreads[i].dataset.threadId;
					refindInst.modifyThread(id, 'trashThread');
				}
			};
		});

		$('#markAsReadAllId').on('click', function (e) {
			var tempThreads = document.getElementsByClassName("selectedThread");
			for (var i = 0; i < tempThreads.length; i++) {
				if (tempThreads[i].classList.contains('unread-thread')
					&& tempThreads[i].classList.contains('thread-row')) {
					var id = tempThreads[i].dataset.threadId;
					console.log(tempThreads[i]);
					refindInst.modifyThread(id, 'markAsRead');
					refindInst.markThreadAsRead(tempThreads[i]);
				}
			};
			document.getElementById('markAsReadAllId').classList.add('displayNone');
			document.getElementById('markAsUnreadAllId').classList.remove('displayNone');
		});

		$('#markAsUnreadAllId').on('click', function (e) {
			var tempThreads = document.getElementsByClassName("selectedThread");
			for (var i = 0; i < tempThreads.length; i++) {
				console.log(tempThreads[i]);
				if (!tempThreads[i].classList.contains('unread-thread')
					&& tempThreads[i].classList.contains('thread-row')) {
					var id = tempThreads[i].dataset.threadId;
					console.log(tempThreads[i]);
					refindInst.modifyThread(id, 'markAsUnread');
					refindInst.markThreadAsUnread(tempThreads[i]);
				}
			};
			document.getElementById('markAsReadAllId').classList.remove('displayNone');
			document.getElementById('markAsUnreadAllId').classList.add('displayNone');
		});

		$('#snoozeAllId').on('click', function (e) {
			console.log("snooze them all");
		});

		$('#moveToAllId').on('click', function (e) {
			console.log("move them all");
		});

		$('#labelAllId').on('click', function (e) {
			document.getElementById("labelDropdown").classList.toggle("show");
		});

		$('.add-labels').on('click', function (e) {
			var tempThreads = document.getElementsByClassName("selectedThread");
			console.log(tempThreads);
			for (var i = 0; i < tempThreads.length; i++) {
				if (tempThreads[i].classList.contains('thread-row')) {
					var id = tempThreads[i].dataset.threadId;
					refindInst.modifyThread(id, 'labelThread');
				}
			};
		});

		$('.manage-labels').on('click', function (e) {
			sdk.Router.goto('settings/labels');
		})

		$('.nav-prev-page').on('click', function (e) {
			if (newStartThread == 1) return;

			localGetMessageRequest.offset > 50 ? localGetMessageRequest.offset -= 50 : localGetMessageRequest.offset = 0;

			refindInst.listvenueItems("", customRouteView, localGetMessageRequest);
		});

		$('.nav-next-page').on('click', function (e) {
			if (newEndThread == totalThread) return;

			localGetMessageRequest.offset += 50;

			refindInst.listvenueItems("", customRouteView, localGetMessageRequest);
		});

		$('.nav-settings').on('click', function (e) {
			document.getElementById("settingsDropdown").classList.toggle("show");
		});

		//newest and oldest hover box
		$('.nav-box').on({
			click: function () {
				var element = document.getElementById("boxDropdown");
				if (!element.classList.contains("show")) {
					element.classList.toggle("show");
				}
				if (element.classList.contains("clicked")) {
					element.classList.remove("clicked");
				} else {
					element.classList.add("clicked");
				}

			},
			mouseenter: function () {
				var element = document.getElementById("boxDropdown");
				if (!element.classList.contains("clicked") && !element.classList.contains("show")) {
					element.classList.toggle("show");
				}
			},
			mouseleave: function (e) {
				var element = document.getElementById("boxDropdown");

				var $this = $(this);
				var bottom = $this.offset().top + $this.outerHeight();
				if (e.pageY < bottom) {
					if (!element.classList.contains("clicked")) {
						element.classList.toggle("show");
					}
				}
			}
		});

		$('.boxDropdown-content').on('mouseleave', function (e) {
			var element = document.getElementById("boxDropdown");
			if (!element.classList.contains("clicked")) {
				element.classList.toggle("show");
			}
		});

		$('.newest').on('click', function (e) {
			if (newStartThread == 1) return;
			localGetMessageRequest.offset = 0;
			refindInst.listvenueItems("", customRouteView, localGetMessageRequest);
		});

		$('.oldest').on('click', function (e) {
			if (newEndThread == totalThread) return;
			localGetMessageRequest.offset = totalThread - 51;
			refindInst.listvenueItems("", customRouteView, localGetMessageRequest);
		});

		$('.refreshAll').on('click', function (e) {
			refindInst.listvenueItems("", customRouteView, localGetMessageRequest);
		});

		window.onclick = function (event) {

			if (!event.target.matches('.settingsDropdown')) {
				var dropdowns = document.getElementsByClassName("settingsDropdown-content");
				var i;
				for (i = 0; i < dropdowns.length; i++) {
					var openDropdown = dropdowns[i];
					if (openDropdown.classList.contains('show')) {
						openDropdown.classList.remove('show');
					}
				}
			}

			if (!event.target.matches('.boxDropdown')) {
				var dropdowns = document.getElementsByClassName("boxDropdown-content");
				var i;
				for (i = 0; i < dropdowns.length; i++) {
					var openDropdown = dropdowns[i];
					if (openDropdown.classList.contains('show')) {
						openDropdown.classList.remove('show');
					}
				}
			}

			if (!event.target.matches('.stop-label-dropdown-event') && !event.target.matches('.labelDropdown')) {
				var dropdown = document.getElementById("labelDropdown");
				if (!dropdown) {
					// This happens when we are on Google's native message list
					// Somehow events originating from Google's native msg list reach our custom msg list
					console.log("Got spurious event:dropdown is undefined");
					return;
				}

				if (!dropdown.classList) {
					console.log(`dropdown.classList is undefined: Dropdown=[${dropdown.innerText}]`);
					return;
				}

				if (dropdown.classList.contains('show')) {
					dropdown.classList.toggle("show");
				}
			}

		}
	}

	appendThreadRow = (thread, index) => {

		var emails = refindInst.getThreadEmails(thread)
			, snippet = refindInst.getLastMsgSnippet(thread)
			, dateTime = refindInst.getLastDatetime(thread)
			, threadTitle = refindInst.getLastTitle(thread)
			, unread = refindInst.getLastUnreadStatus(thread)
			, unreadClass = unread === true ? 'unread-thread' : ''
			, lastMessageId = refindInst.getLasMessageId(thread)
			, messageLabels = refindInst.getMessageLabels(thread)

			, newDate = new Date(parseInt(dateTime))
			, newDateDay = newDate.getDate()
			, newDateMonth = newDate.getMonth()
			, newDateYear = newDate.getFullYear()
			, todaysDate = new Date(Date.now())
			, todaysDay = todaysDate.getDate()
			, todaysMonth = todaysDate.getMonth()
			, todaysYear = todaysDate.getFullYear()

		var starredThread;
		if (messageLabels.indexOf('STARRED') > -1) {
			starredThread = true;
		}
		else {
			starredThread = false;
		}

		if (unread) {
			var unreadIcon = 'fa-envelope-open';
			var unreadHover = 'thread-hover-unread';
		} else {
			var unreadIcon = 'fa-envelope';
			var unreadHover = 'thread-hover-read';
		}

		var showDate;
		if (newDateDay === todaysDay && newDateMonth === todaysMonth && newDateYear === todaysYear) {
			var hours = newDate.getHours();
			var ampm = "AM";
			if (hours > 12) {
				hours = hours - 12;
				ampm = "PM";
			}
			if (newDate.getMinutes() < 10) {
				showDate = hours + ':0' + newDate.getMinutes() + ' ' + ampm;
			} else {
				showDate = hours + ':' + newDate.getMinutes() + ' ' + ampm;
			}
		} else {
			var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			var monthName = months[newDate.getMonth()];
			showDate = monthName + ' ' + newDateDay;
		}

		var targetTable = '#messages';

		// format one row of messages that will appear in gmail view
		$(targetTable + ' .table-inbox tbody').append(
			'<tr id="threadRowId' + thread.id + '" class="thread-row ' + unreadClass + '" data-thread-id="' + thread.id + '">' +
			'<td class="thread-checkbox-outer">' +
			'<input id="checkboxId' + thread.id + '" class="thread-checkbox" type="checkbox" name="checkbox' + thread.id + '" value="valueCheckbox' + thread.id + '">' +
			'</td>' +
			'<td class="thread-checkstar-outer">' +
			'<span id="checkstar' + thread.id + '" class="thread-checkstar"></span>' +
			'<span id="checkstarYellow' + thread.id + '" class="thread-checkstar-yellow displayNone"></span>' +
			'</td>' +
			'<td id="tp' + thread.id + '" class="thread-participants">' + emails + '</td>' +
			'<td id="ts' + thread.id + '" class="thread-snippet">' +
			'<div id="message-link-' + thread.id + '" class="thread-snippet-container">' +
			'<div class="thread-snippet-title">' + threadTitle + '</div>&nbsp;-&nbsp;<div class="thread-snippet-desc">' + snippet + '</div>' +
			'</div>' +
			'</td>' +
			'<td class="thread-datetime">' + showDate + '</td>' +
			'<td class="td-thread-hover">' +
			'<div id="thread-hover-' + thread.id + '" class="' + unreadHover + '">' +
			'<span id="threadArchiveId' + thread.id + '" class="fa fa-archive fa-lg va0 thread-hover-icon" ></span>' +
			'<span id="threadTrashId' + thread.id + '" class="fa fa-trash fa-lg va0 thread-hover-icon" ></span>' +
			'<span id="threadUnreadId' + thread.id + '" class="fa ' + unreadIcon + ' fa-lg va0 thread-hover-icon" ></span>' +
			'<span id="threadSnoozeId' + thread.id + '" class="fa fa-clock-o fa-lg va0 thread-hover-icon" ></span>' +
			'</div>' +
			'</td>' +
			'</tr>'
		);

		if (starredThread) {
			var checkstar = document.getElementById('checkstar' + thread.id);
			var checkstaryellow = document.getElementById('checkstarYellow' + thread.id);
			checkstar.classList.add('displayNone');
			checkstaryellow.classList.remove('displayNone');
		}

		$('#checkstar' + thread.id).on('click', function (e) {
			var checkstar = document.getElementById('checkstar' + thread.id);
			var checkstaryellow = document.getElementById('checkstarYellow' + thread.id);
			checkstar.classList.add('displayNone');
			checkstaryellow.classList.remove('displayNone');
			console.log("star clicked");
			refindInst.modifyThread(thread.id, 'starThread');
		});

		$('#checkstarYellow' + thread.id).on('click', function (e) {
			var checkstar = document.getElementById('checkstar' + thread.id);
			var checkstaryellow = document.getElementById('checkstarYellow' + thread.id);
			checkstar.classList.remove('displayNone');
			checkstaryellow.classList.add('displayNone');
			console.log("yellow star clicked");
			refindInst.modifyThread(thread.id, 'unstarThread');
		});

		$('#threadArchiveId' + thread.id).on('click', function (e) {
			refindInst.modifyThread(thread.id, 'archiveThread');
		});

		$('#threadTrashId' + thread.id).on('click', function (e) {
			refindInst.modifyThread(thread.id, 'trashThread')
		});

		$('#threadUnreadId' + thread.id).on('click', function (e) {
			console.log(`ThreadClicked=${thread.id}`);
			var element = document.getElementById('threadUnreadId' + thread.id);
			if (element.classList.contains('fa-envelope-open')) {
				console.log(`fa-envelope-open:markAsRead`);
				refindInst.modifyThread(thread.id, 'markAsRead');
				refindInst.markThreadAsRead(document.getElementById('threadRowId' + thread.id));
			} else {
				console.log(`markAsUnread'`);
				refindInst.modifyThread(thread.id, 'markAsUnread');
				refindInst.markThreadAsUnread(document.getElementById('threadRowId' + thread.id));
			}
		});

		$('#threadSnoozeId' + thread.id).on('click', function (e) {
			console.log("snooze " + thread.id);
		});

		$('.thread-checkbox[name="checkbox' + thread.id + '"]').on('click', function (e) {
			var refreshAll = document.getElementById("refreshAllId");
			var extraToolbar = document.getElementById("extraToolbarId");
			if (e.currentTarget.checked) {
				var thisThread = document.getElementById("threadRowId" + thread.id);
				var thisThreadHover = document.getElementById("thread-hover-" + thread.id);
				thisThread.classList.add("selectedThread");
				thisThreadHover.classList.add("selectedThread");
				document.getElementById("checkboxId" + thread.id).checked = true;
				if (!refreshAll.classList.contains("displayNone")) {
					refreshAll.classList.add("displayNone");
					extraToolbar.classList.remove("displayNone");
				}
				refindInst.findUnreadThreads();
			} else {
				var selectedThreads = document.getElementsByClassName("selectedThread");
				var thisThread = document.getElementById("threadRowId" + thread.id);
				var thisThreadHover = document.getElementById("thread-hover-" + thread.id);
				thisThreadHover.classList.remove("selectedThread");
				thisThread.classList.remove("selectedThread");
				document.getElementById("checkboxId" + thread.id).checked = false;
				if (selectedThreads.length == 0) {
					refreshAll.classList.remove("displayNone");
					extraToolbar.classList.add("displayNone");
				} else {
					refindInst.findUnreadThreads();
				}
			}
		});

		$('#tp' + thread.id + ', #ts' + thread.id).on('click', function (e) {
			console.log(e);
			sdk.Router.goto('inbox/' + thread.id);
		});

		$('.thread-row[data-thread-id="' + thread.id + '"]').on('mouseenter', function (e) {
			var element = document.getElementById('thread-hover-' + thread.id);
			var boxDropdown = document.getElementById("boxDropdown");
			var settingsDropdown = document.getElementById("settingsDropdown");
			if (index < 2 && (boxDropdown.classList.contains("show") || settingsDropdown.classList.contains("show"))) {
			} else {
				element.classList.add("show");
			}
		});

		$('.thread-row[data-thread-id="' + thread.id + '"]').on('mouseleave', function (e) {
			var element = document.getElementById('thread-hover-' + thread.id + '');
			element.classList.remove("show");
		});
	}

	manageLabels = () => {
		document.getElementById("#listAllLabels");
		chrome.storage.local.get(['serviceHost', 'userAccountId'], function (result) {
			chrome.runtime.sendMessage({
				type: 'getLabels',
				serviceHost: result.serviceHost,
				userAccountId: result.userAccountId,
				mailAccountId: `${sdk.User.getEmailAddress()}_Gmail`,
				deviceId: 'ChromeExtensionId'
			},
				function (labels) {
					for (var i = 0; i < labels.length; i++) {
						switch (labels[i].name) {
							case 'CATEGORY_PERSONAL':
								refindInst.addLabelToList("Personal", labels[i].id);
								break;
							case 'CATEGORY_SOCIAL':
								refindInst.addLabelToList("Social", labels[i].id);
								break;
							case 'IMPORTANT':
								refindInst.addLabelToList("Important", labels[i].id);
								break;
							case 'CATEGORY_UPDATES':
								refindInst.addLabelToList("Updates", labels[i].id);
								break;
							case 'CATEGORY_FORUMS':
								refindInst.addLabelToList("Forums", labels[i].id);
								break;
							case 'CATEGORY_PROMOTIONS':
								refindInst.addLabelToList("Promotions", labels[i].id);
								break;
							case 'SENT':
							case 'INBOX':
							case 'TRASH':
							case 'DRAFT':
							case 'SPAM':
							case 'STARRED':
							case 'UNREAD':
							case 'CHAT':
								break;
							default:
								refindInst.addLabelToList(labels[i].name, labels[i].id);
						}
					}

				});
		});
	}

	addLabelToList = (label, labelId) => {

		$('#listAllLabels').append(
			'<div class="single-label stop-label-dropdown-event">' +
			'<input id="' + labelId + '" class="label-checkbox stop-label-dropdown-event" type="checkbox">' +
			'<div class="label-name stop-label-dropdown-event">' + label + '</div></div>'
		);

		$('#' + labelId).on('click', function (e) {
			var target = document.getElementById(labelId).checked;
			if (target) {
				refindInst.activeLabels.push(labelId);
				document.getElementById('addLabels').classList.remove('displayNone');
			} else {
				for (var i = 0; i < refindInst.activeLabels.length; i++) {
					if (refindInst.activeLabels[i] === labelId) {
						refindInst.activeLabels.splice(i, 1);
						if (refindInst.activeLabels.length == 0) document.getElementById('addLabels').classList.add('displayNone');
					}
				}
			}
			console.log(refindInst.activeLabels);
		})
	}

	findUnreadThreads = () => {
		var selectedThreads = document.getElementsByClassName("selectedThread");
		var existingUnread = 0;
		for (var i = 0; i < selectedThreads.length; i++) {
			if (selectedThreads[i].classList.contains('unread-thread')) {
				existingUnread = 1;
				break;
			}
		}
		if (existingUnread == 1) {
			document.getElementById('markAsReadAllId').classList.remove('displayNone');
			document.getElementById('markAsUnreadAllId').classList.add('displayNone');
		} else {
			document.getElementById('markAsReadAllId').classList.add('displayNone');
			document.getElementById('markAsUnreadAllId').classList.remove('displayNone');
		}
	}

	markThreadAsRead = (thread) => {
		var id = thread.getAttribute('data-thread-id');
		var element = document.getElementById('threadUnreadId' + id);
		var hoverElement = document.getElementById('thread-hover-' + id);
		element.classList.remove('fa-envelope-open');
		element.classList.add('fa-envelope');
		thread.classList.remove('unread-thread');
		hoverElement.classList.remove('thread-hover-unread');
		hoverElement.classList.add('thread-hover-read');
	}

	markThreadAsUnread = (thread) => {
		var id = thread.getAttribute('data-thread-id');
		var element = document.getElementById('threadUnreadId' + id);
		var hoverElement = document.getElementById('thread-hover-' + id);
		element.classList.add('fa-envelope-open');
		element.classList.remove('fa-envelope');
		thread.classList.add('unread-thread');
		hoverElement.classList.add('thread-hover-unread');
		hoverElement.classList.remove('thread-hover-read');
	}

	modifyThread = (threadId, requestType) => {
		var labels = refindInst.activeLabels;

		chrome.storage.local.get(['serviceHost', 'userAccountId'], function (result) {
			chrome.runtime.sendMessage({
				type: requestType,
				userEmail: sdk.User.getEmailAddress(),

				threadId: threadId,
				serviceHost: result.serviceHost,
				userAccountId: result.userAccountId,
				mailAccountId: `${sdk.User.getEmailAddress()}_Gmail`,
				deviceId: 'ChromeExtensionId',
				labels
			},
				function (res) {
					console.log(res);
				});
		});
	};


	getThreadEmails = (thread) => {
		var emailArr = [];

		thread.messages.forEach((msg, i) => {

			var from = refindInst.getHeader(msg.payload.headers, 'From')
			var to = refindInst.getHeader(msg.payload.headers, 'To');

			if (emailArr.indexOf(from) == -1) {
				emailArr.push(from);
			}

			if (emailArr.indexOf(to) == -1) {
				emailArr.push(to.toLowerCase() === refindInst.myEmailAddress ? 'me' : to)
			}
		});
		return emailArr.join(', ');
	};

	getHeader = (headers, index) => {
		var header = '';
		$.each(headers, function () {
			if (this.name === index) {
				header = this.value;
			}
		});
		return header;
	};

	getLastMsgSnippet = (thread) => {
		var msgLen = thread.messages.length;
		var msgSnippet = thread.messages[msgLen - 1].snippet;

		return msgSnippet;
	};

	getLastDatetime = (thread) => {
		var msgLen = thread.messages.length;
		var msgInternalDate = thread.messages[msgLen - 1].internalDate;

		return msgInternalDate;
	};

	getLastTitle = (thread) => {
		var msgLen = thread.messages.length;
		var msgTitle = refindInst.getHeader(thread.messages[msgLen - 1].payload.headers, 'Subject');

		return msgTitle;
	};

	getLastUnreadStatus = (thread) => {
		var msgLen = thread.messages.length;
		var msgLabels = thread.messages[msgLen - 1].labelIds;

		//console.log(`getLastUnreadStatus=${msgLabels}`);
		if (msgLabels.indexOf('UNREAD') > -1) {
			return true;
		}
		else {
			return false;
		}
	};

	getLasMessageId = (thread) => {
		var msgLen = thread.messages.length;
		var msgId = thread.messages[msgLen - 1].id;

		return msgId;
	};

	getMessageLabels = (thread) => {
		var msgLen = thread.messages.length;
		var msgLabels = thread.messages[msgLen - 1].labelIds;

		return msgLabels;
	};


	// -----------------------------------------  stop move to class for CustomViewCreation ----------------------
}

InboxSDK.load('2', 'sdk_reFind_ForEmail_67ecda266d').then(function (sdk) {

	var refindForChromeInstance = new RefindForChrome(sdk);
	// Starts system 
	refindForChromeInstance.initRefindSession();
});


