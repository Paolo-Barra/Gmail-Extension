"use strict";

	// // functional tests 
	// const clickHandlers = (etype,func) 	=> { return $(document).on('click', etype, func) }
	// const dashboardHandler = (func) 	=> { return clickHandlers('.dashboard_button',func); }
	// const getLocalStorage = (key, func) => { return chrome.storage.local.get(key,func);  }
	// const withUserAccountId = (func) 	=> { getLocalStorage(['userAccountId'],func)[0];  }
	
	// dashboardHandler = () => {
	// 	// drop-down menu showing the dashboard pie chart 
	// 	console.log("Open Dashboard");

	// 	withUserAccountId = (uid) => { 
	// 			var url = `/dashboard?userAccountId=${uid}`;
	// 			make_iframe_size(url, '800', '725', (el) => { sdk.Widgets.showModalView({el: el}); });
	// 			close_dropdowns();
	// 		}
	// 	}


var sdk = undefined;
var active_dropdowns = [];			// Array: active drop down menus
var searchRoutes = [];				// Array:strings - the string contains a venue name 
var parent = undefined;
var currentModalView = undefined;	// The current InboxSDK Modal View displayed on the screen

class MenuEventHandlers
{	
	constructor(_sdk, _parent) 
	{
		// By setting self to the value of this we can keep a reference to this class
		// Problem is that 'this' depends on the context so it can change to point to other objects or enclosures '{ }'
		// When we need to call a function from within this class we use self.function_name()
		self = this;

		sdk = _sdk;
		//active_dropdowns = dropdowns;	
		parent = _parent;
	}
	
	registerDropdown = (dropdown) => {
		active_dropdowns.push(dropdown);
	}

	closeCurrentModalView = () => {
		if(currentModalView) {
			currentModalView.close();
			currentModalView = undefined;
		}
	}
	/* Global functions */
	close_dropdowns = () =>  {
		active_dropdowns.forEach(x => x.close());
		active_dropdowns = [];
	}

	displaySelectEnvironmentsDialog = () => {
		// popup window showing the environmentDialog
		console.log("Open Select Environments Dialog");
		self.close_dropdowns();
		self.closeCurrentModalView();

		var page = chrome.runtime.getURL('js/environmentBrowser/environmentBrowser.html');
		var iframe = document.createElement("iframe");      
		iframe.src = page;
		iframe.width = '800'; 
		iframe.height = '725';  
		iframe.frameBorder = 0;   
		currentModalView = sdk.Widgets.showModalView({
			el: iframe,
			title: 'Select Refind Environment'
		});
	}

	init_event_handlers = () =>
	{
		$(document).on('click', '.envs_button', () =>  {
			self.displaySelectEnvironmentsDialog();
		});

		// This handler needs to be on the content file, as it requires access to the refresh tree function
		$(document).on('click', ".login_button", function () {
			
			self.close_dropdowns();
			self.closeCurrentModalView();

			chrome.storage.local.get(['serviceHost', 'userAccountId', 'fullPortalHost', 'environment'], function (result) {

				if(result.environment === undefined) {
					alert("You need to select a valid [Online] reFind environment before you can login");
					return;
				}
				console.assert(result.userAccountId,"MEH:Missing UserAccountId")
				console.assert(result.serviceHost,"MEH:Missing serviceHost")
				console.assert(sdk.User.getEmailAddress(),"MEH:Missing serviceHost")


				chrome.runtime.sendMessage({
	                type: "UserAccountExists",
	                serviceHost: result.serviceHost,
	                userAccountId: result.userAccountId,
	                userEmail: sdk.User.getEmailAddress()
	            },
	                (accountExists) => 
	                {
						if(accountExists) {
							// The account exists on the sync service, login the user and display the venue tree
							parent.loginToRefind();
							chrome.storage.local.set({								
								userLoggedOut: false
							  });
						} else {
							
							if(confirm("This account has not been registered with reFind, would you like to sign up now?")) {								
								// The account doesn't exist on the sync service, redirect user to portal to create it now									
								window.open(result.fullPortalHost,"ReFind Portal")
							}
						}
					}
				);
			});			
		});

		// using jQuery, attach to the onClick event of various ui elements and add event handlers
		// these classes are specified in refind_dropdown_button_click();
		$(document).on('click', '.dashboard_button', function () {
			// drop-down menu showing the dashboard pie chart 
			console.log("Open Dashboard");
			self.close_dropdowns();
			self.closeCurrentModalView();

			chrome.storage.local.get(['userAccountId'], function (result) {
				var url = `/dashboard?userAccountId=${result.userAccountId}`;

				make_iframe_size(url, '800', '725', function (el) {
					currentModalView = sdk.Widgets.showModalView({
						el: el,
						title: '',
					});
				});		
						
			});
		});
				
		$(document).on('click', '.portal_button', () =>  {
			// popup window showing the portal 
			self.close_dropdowns();
			chrome.storage.local.get(['fullPortalHost', 'userAccountId'],  (result)  =>  {
				var url = `${result.fullPortalHost}/app/main/recommend?userAccountId=${result.userAccountId}`
				window.open(url,"ReFind Portal")
			});
		});

	$(document).on('click', ".add_recipe_button", function () {
		// drop-down menu showing the add recipe 				
		self.close_dropdowns();
		self.closeCurrentModalView();

		chrome.storage.local.get(['userAccountId'], function (result) {
			console.log(`uid=${result.userAccountId}`);
			var url = `/templateList?userAccountId=${result.userAccountId}&viewType=Recipes`;
			make_iframe_size(url, '800', '600', function (el) {
				currentModalView = sdk.Widgets.showModalView({
					el: el,
					title: 'Add a Recipe'
				});
			});			
		});		
	});

	$(document).on('click', ".recipe_button", function () {
		// drop-down menu showing the view recipe.  Uses can click edit if required
		self.close_dropdowns();
		self.closeCurrentModalView();

		var recipeId = $(this).attr('id');
		chrome.storage.local.get(['userAccountId'], function (result) {
			console.log(`uid=${result.userAccountId}`);
			var url = `/recipesCreateOrEdit?userAccountId=${result.userAccountId}&type=Recipe&itemId=${recipeId}&summary=true`;
			make_iframe_size(url, '800', '600', function (el) {
				currentModalView = sdk.Widgets.showModalView({
					el: el,
					title: "View Recipes"
				});
			});			
		});
	});

	$(document).on('click', ".add_cookbook_button", function () 
	{
		self.close_dropdowns();
		self.closeCurrentModalView();

		// drop-down menu showing the add cookbook 
		chrome.storage.local.get(['userAccountId'], function (result) {
			var url = `/templateList?userAccountId=${result.userAccountId}&viewType=Cookbooks`;
			make_iframe_size(url, '800', '600', function (el) {
				currentModalView = sdk.Widgets.showModalView({
					el: el,
					title: 'Add Cookbook'
				});
			});			
		});		
	});

	$(document).on('click', ".edit_recipes_button", function () {
		// drop-down menu showing the edit recipes 
		self.close_dropdowns();
		self.closeCurrentModalView();

		chrome.storage.local.get(['userAccountId'], function (result) {
			var url = `/recipes?userAccountId=${result.userAccountId}`;
			make_iframe_size(url, '800', '600', function (el) {
				currentModalView = sdk.Widgets.showModalView({
					el: el,
					showCloseButton: false,
					chrome: true,
					title: 'Edit Recipe',
					buttons:[
						{
						  'text':'Close',
						  'onClick': () => { currentModalView.close(); },
						  'type':'PRIMARY_ACTION'
						},
					  ]
				});
			});			
		});
	});

	// $(document).on('click', ".login_button", function () {
	// 	// drop-down menu showing the login 
	// 	chrome.storage.local.get(['portalHost'], function (result) {
	// 		chrome.storage.local.set({ 'userAccountId': '', 'isValidSession': 'false', 'userEmail': '', 'userLoggedOut': '' }, function () { });
	// 		//chrome.runtime.sendMessage("createRefindAccount", function (response) { });
	// 	});
	// 	self.close_dropdowns();
	// });

	$(document).on('click', ".logout_button", function () {

		self.close_dropdowns();
		self.closeCurrentModalView();

		parent.logoutRefind();
		// chrome.storage.local.get(['portalHost'], function (result) {
		// 	chrome.storage.local.set({ 'userAccountId': '' }, function () { });
		// 	//var url = `${result.portalHost}/app/main/external_logout`;
		// 	//window.open(url);
		// });
		//self.close_dropdowns();
	});

	$(document).on('click', '.user_groups_button', function () {
		// drop-down menu showing the groups screen 

		self.close_dropdowns();
		self.closeCurrentModalView();

		chrome.storage.local.get(['userAccountId'], function (result) {
			var url = `/groups?userAccountId=${result.userAccountId}`;
			make_iframe_size(url, '800', '600', function (el) {
				currentModalView = sdk.Widgets.showModalView({
					el: el,
					title: 'Edit User Groups'
				});
			});			
		});
	});

	$(document).on('click', '.edit_groups', function () {

		self.close_dropdowns();
		self.closeCurrentModalView();

		chrome.storage.local.get(['userAccountId'], function (result) {

			var groupId = $(this).attr('id');
			var url = `/groupDetails?userAccountId=${result.userAccountId}&groupId=${groupId}`;
			make_iframe_size(url, '800', '600', function (el) {
				currentModalView = sdk.Widgets.showModalView({
					el: el,
					title: 'Edit user groups for contact'
				});
			});			
		});
	});

	$(document).on('DOMNodeInserted', function (e) {
		// Disable the contacts panel when opening an email
		return;
		// var contacts = $(e.target).find("#contacts_manager");
		// console.log()
		// if (contacts.length > 0) {
		// 	update_contacts_section();
		// }
	});

	$(document).on('mouseup', '.adn.ads', function () {
		var selection = window.getSelection().toString();
		if (!selection.trim()) {
			clear_selected_keyword();
			return;
		}
		chrome.storage.local.get(['userAccountId', 'serviceHost'], function (result) {
			chrome.runtime.sendMessage({
				type: "ListRecipe",
				serviceHost: result.serviceHost,
				userAccountId: result.userAccountId,
				mailAccountId: `${sdk.User.getEmailAddress()}_Gmail`
			},
				function (response) {
					recipes = response.TheRecipes;
					var keyword_recipes = response.TheRecipes.filter(x => {
						if ("FolderPerContactSource" in x.Values) {
							if (x.Values["FolderPerContactSource"] === 'Keywords') {
								return true;
							}
						}
						return false;
					});
					html = `
					<h3 class="sidebar_header venue_red">Add keywords</h3>
					<p>Filter the keyword	<code>${selection}</code> into one of the following recipes:</p>
					<ul class="venue_dropdown">
				`;
					keyword_recipes.forEach(x => {
						html += `<li class='add_keyword_to_recipe_button' keyword='${selection.trim()}' recipe=${x.RecipeId}><img src='https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/Recipe.png'>${x.Values['Name']}</li>`;
					})
					html += `</ul>`;
					$('#selected_text_manager').html(html);
				});
		});
	});

	$(document).on('keydown', '.venue_search', function (e) {
		if (e.keyCode !== 13) {
			return;
		}

		//  Before navigating to the message list, close any menu or modal view we may have open at this time
		self.close_dropdowns();
		self.closeCurrentModalView();

		var venueId = $(this).attr('venueId');
		var searchTerm = $(this).val();
		var routeId = `search__${venueId}__${searchTerm}`;

		if (routeId in searchRoutes === false) {
			sdk.Router.handleCustomListRoute(routeId, function (offset, max) {
				return new Promise((respond, reject) => {
					chrome.storage.local.get(['userAccountId', 'serviceHost'], function (result) {
						var params = $.param({
							'UserAccountId': result.userAccountId,
							'MailAccountId': `${sdk.User.getEmailAddress()}_Gmail`,
							'VenueId': venueId,
							'SearchTerm': searchTerm,
							'Offset': offset,
							'Max': max
						});
						$.get(`${result.serviceHost}/venue/json/reply/SearchInVenue?${params}`)
							.then(function (response) {
								var response = {
									threads: response.Results.map(x => {
										return {
											//gmailThreadId: x.GmailThreadId.toString(16),
											rfcMessageId: x.MapiMessageId
										}
									}),
									total: response.Total
								};
								console.log('Threads returned by SearchInVenue');
								console.log(response);
								respond(response);
							}).catch(function (e) {
								reject("Search unavailable at this time.");
							});
					});
				}).catch(function (e) {
					console.log(e);
				});
			});
			searchRoutes.push(routeId);
		}
		sdk.Router.goto(routeId);
	});

	$(document).on('click', ".add_keyword_to_recipe_button", function () {
		let keyword = $(this).attr('keyword');
		let recipeId = $(this).attr('recipe');
		var filtered = recipes.filter(x => x.RecipeId === recipeId);
		if (filtered.length > 0) 
		{
			var recipe = filtered[0];
			var current = []
			if ("Keywords" in recipe.Values) {
				var current = recipe.Values.Keywords.split(',').map(x => x.trim()).filter(x => x !== '') || [];
			}
			if (keyword in current === false) {
				current.push(keyword);
			}
			recipe.Values.Keywords = current.join(", ");
			chrome.storage.local.get(['serviceHost', 'userAccountId'], function (result) {

				chrome.runtime.sendMessage({
					type: "MakeRecipeCriteria",
					recipe,
					userAccountId: uerAccountId,
					deviceId: 'Gmail',
					mailAccountId: `${sdk.User.getEmailAddress()}_Gmail`
				},
					function (makeCriteriaResponse) {
						chrome.runtime.sendMessage({
							type: "ModifyRecipe",
							userAccountId: uerAccountId,
							deviceId: 'Gmail',
							mailAccountId: `${sdk.User.getEmailAddress()}_Gmail`,
							postType: makeCriteriaResponse.Criteria.RecipeType,
							recipeId: makeCriteriaResponse.Criteria.RecipeId,
							criteria: makeCriteriaResponse.Criteria
						},

						function (modifyRecipeResponse) {
								if (modifyRecipeResponse.Success) {
									clear_selected_keyword();
									set_keyword_update_status("Keyword added successfully.")
								}
							}
						);
					}
				);
			});
		}
	});
	}
}

	// Disable the contacts secion on the right side of the gmail window
	// function update_contacts_section() {
	// 	var content = `
	// 		<h3 class="sidebar_header venue_blue">Contacts</h3>
	// 		<ul class='venue_dropdown'>
	// 	`;
	// 	contacts.forEach((x, index) => {
	// 		if (index < 5 || contacts_expanded) {
	// 			var allAddresses = contacts.map(y => `${x === y ? '*' : ''}~${y.name || y.emailAddress}~${y.emailAddress}`).join('|');
	// 			content += `<li class='edit_groups' id='${allAddresses}'><img src='https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/Contact.png'>${x.name || x.emailAddress}</li>`;
	// 		}
	// 		else if (index == 5) {
	// 			content += `<li class='toggle_contacts'><img src='https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/Plus.png'>Show ${contacts.length - 5} more...</li>`
	// 		}
	// 	});
	// 	if (contacts_expanded && contacts.length > 5) {
	// 		content += `<li class='toggle_contacts'><img src='https://venue-static-files.s3.us-east-2.amazonaws.com/staticfiles/GmailPlugin/Plus.png'>Show less</li>`
	// 	}
	// 	content += `</ul>`
	// 	$("#contacts_manager").html(content);
	// }

