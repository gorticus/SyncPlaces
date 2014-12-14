/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the SyncPlaces extension.
 *
 * The Initial Developer of the Original Code is Andy Halford.
 * Portions created by the Initial Developer are Copyright (C) 2008-2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var SyncPlacesOptions = {
	Cc: Components.classes,
	Ci: Components.interfaces,
	prefs: Components.classes["@mozilla.org/preferences-service;1"]
									 .getService(Components.interfaces.nsIPrefService)
									 .getBranch("extensions.syncplaces."),
	defaults: Components.classes["@mozilla.org/preferences-service;1"]
											.getService(Components.interfaces.nsIPrefService)
											.getDefaultBranch("extensions.syncplaces."),
	shutdown: false,
	encryptUser: 'syncplaces-encryption',
	passwordUser: 'syncplaces-password',
	prefsFile: 'syncplaces_prefs.json',
	version: "5.0.0",

	onActionLoad: function() {
		this.lastTransferTimes(true);

		//If any params then called from options.xul so skip check
		if (!window.arguments || window.arguments[0] == null) {
			this.firstTimeCheck();
		}
	},

	//When the dialog is first displayed initialise it
	onDialogLoad: function() {
		//If any params then called from actions.xul so skip check
		if (!window || !window.arguments) {
			this.firstTimeCheck();
		}

		this.loadFromPrefs();
		this.toggleSelectFolder(false);
		this.toggleSendNotify();
		this.toggleReceiveNotify();
		this.toggleProtocol();
		this.toggleHTMLFolder();
		this.toggleSyncType();
		this.toggleRegularTransfer(true);
		this.toggleTimedTransfer(true);
		this.toggleAutoSync(true);
		this.toggleAutoClose(true);
		this.togglePasswords(false);
		this.checkValues();
		this.checkSortPlaces(true);

		//Strip out any embedded userid/password from the host (for ftp only)
		if (SyncPlacesOptions.prefs.getCharPref("protocol") == "ftp") {
			var host = document.getElementById('host');
			if (host.value) {
				var userid = document.getElementById('userid');
				var password = document.getElementById('password');
				var login = SyncPlaces.stripEmbeddedLogin(host.value, userid.value, password.value);
				host.value = login.host;
				userid.value = login.userid;
				password.value = login.password;
			}
		}
	},

	firstTimeCheck: function() {
		//Prep to open a tab
		var	thisBrowser = null;
		try {
			thisBrowser = window.opener.getBrowser();
		} catch(e) {}
		if (!thisBrowser) {
			var wm = this.Cc["@mozilla.org/appshell/window-mediator;1"].getService(this.Ci.nsIWindowMediator);
			var mainWindow = wm.getMostRecentWindow("navigator:browser");
			thisBrowser = mainWindow.getBrowser();
		}

		//Display the how to use help page if haven't done so before
		var firstrun = this.prefs.getBoolPref('firstuse');
		if (firstrun && thisBrowser) {
			var tab = thisBrowser.addTab("http://www.andyhalford.com/syncplaces/use.html");
			thisBrowser.selectedTab = tab;
			this.prefs.setBoolPref('firstuse', false);
		}

		//If first time (no host set and not 'file' protocol) then launch setup wizard
		//Also if user sets the option to re-run the wizard
		var host = this.getComplex('host');
		if (this.prefs.getBoolPref('run_wizard') ||
				((!host || SyncPlacesOptions.trim(host).length == 0) && this.prefs.getCharPref('protocol') != 'file'))
		{
			//Note: using "window.open" will not position on the screen properly
			var ww = this.Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(this.Ci.nsIWindowWatcher);
			ww.openWindow(null, "chrome://syncplaces/content/wizard.xul",
															"setup", "chrome,modal,centerscreen", null);
			this.prefs.setBoolPref('run_wizard', false);
			return;
		}
		
		//If upgrading then migrate settings
		var version = this.prefs.getCharPref("version");
		if (version != this.version) {
			//Migrate passwords if pre 4.0
			this.getPassword(this.passwordUser, false, null, 'load');

			//Migrate old files to prefs
			var sent = SyncPlacesIO.lastModifiedAndDelete("syncplaces.sent");
			if (sent) this.prefs.setCharPref("lastSend", sent);
			var received = SyncPlacesIO.lastModifiedAndDelete("syncplaces.received");
			if (received) this.prefs.setCharPref("lastReceived", received);
			var hash = SyncPlacesIO.contentsAndDelete("syncplaces_local_hash.sha1");
			if (hash) this.prefs.setCharPref("sendHash", hash);
			hash = SyncPlacesIO.contentsAndDelete("syncplaces_remote_hash.sha1");
			if (hash) this.prefs.setCharPref("receiveHash", hash);
			hash = SyncPlacesIO.contentsAndDelete("syncplaces_local_pwd_hash.sha1");
			if (hash) this.prefs.setCharPref("sendPwdHash", hash);
			hash = SyncPlacesIO.contentsAndDelete("syncplaces_remote_pwd_hash.sha1");
			if (hash) this.prefs.setCharPref("receivePwdHash", hash);

			this.prefs.setCharPref("version", this.version);
		}
	},

	//Set all options to stored preference or default if none
	loadFromPrefs: function() {
		var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
										.getService(Components.interfaces.nsIStringBundleService)
										.createBundle("chrome://syncplaces/locale/syncplaces.properties");

		//Iterate over the defaults setting each UI item to the pref
		var prefList = this.defaults.getChildList("", {});
		for (var i = 0 ; i < prefList.length ; i++) {
			switch (this.defaults.getPrefType(prefList[i])) {
				case this.defaults.PREF_BOOL:
					var id = prefList[i];
					var checkbox = document.getElementById(id);
					//Deal with outdated prefs (check for null)
					if (checkbox) checkbox.checked = this.prefs.getBoolPref(id);
				break;

				case this.defaults.PREF_STRING:
					var item = document.getElementById(prefList[i]);
					if (!item) break;

					//If radio group (probably a better way of doing this)
					if (prefList[i] == "protocol" || prefList[i] == "comparison" ||
							prefList[i] == "receive_mechanism" ||
							prefList[i] == "send_mechanism" ||
							prefList[i] == "bits" ||
							prefList[i] == "encryption" ||
							prefList[i] == "autostart_detection" ||
							prefList[i] == "shutdown_detection" ||
							prefList[i] == "sync_type") {
						var id = this.prefs.getCharPref(prefList[i]);

						//Select the default item
						var radioItem = document.getElementById(id);
						item.selectedItem = radioItem;
						radioItem.selected;
					}

					//If profiles then populate the menulist
					else if (prefList[i] == "profiles") {
						item.removeAllItems();	//Just in case called when profile is read in
						var currentProfile = this.getComplex("current_profile");

						var currentIndex = 0;
						var profiles = this.getComplex("profiles").toString();
						var names = this.getComplex("profile_names").toString().split(",");
						if (!profiles) {
							profiles = SyncPlacesIO.saveUniqueFile(bundle.GetStringFromName('new_profile_name'), "");
							this.setComplex("profiles", profiles);
							this.setComplex("current_profile", profiles);
							var names = profiles;
							this.setComplex("profile_names", names);
							item.appendItem(names, profiles);
						}
						else {
							profiles = profiles.split(",");
							for (var j=0; j<profiles.length; j++) {
								item.appendItem(names[j], profiles[j]);
								if (profiles[j] == currentProfile) currentIndex = j;
							}
						}

						//Select the current profile
						item.selectedIndex = currentIndex;
					}

					//Some things are strictly ASCII strings
					else if (prefList[i] == "transfer_time" || prefList[i] == "transfer_interval" || 
									 prefList[i] == "delay" || prefList[i] == "timeoutDelay") 
					{
						item.value = this.prefs.getCharPref(prefList[i]);
					}

					//else (if text field) set the value directly
					//Ignore non-option prefs
					else if (prefList[i] != "backupfolder") {
						//Delete password stored by mistake in prefs in v2.3.0
						if (prefList[i] == "encrypt_password")
							this.prefs.clearUserPref("encrypt_password");
						else
							item.value = this.getComplex(prefList[i]);
					}
				break;
			}
		}

		//Passwords
		this.displayPasswords(null, 'load');
	},

	//Set unichar strings
	setComplex: function(name, value) {
		var str = Components.classes["@mozilla.org/supports-string;1"]
      									.createInstance(Components.interfaces.nsISupportsString);
		str.data = value;
		SyncPlacesOptions.prefs.setComplexValue(name, Components.interfaces.nsISupportsString, str);
	},

	//Get unichar strings
	getComplex: function(name) {
		return SyncPlacesOptions.prefs.getComplexValue(name, Components.interfaces.nsISupportsString);
	},

  displayPasswords: function(profile, migrateAlgorithm) {
		document.getElementById('password').value = this.getPassword(this.getComplex("userid"), true, profile);
		document.getElementById('password_password').value = this.getPassword(this.passwordUser, true, profile, migrateAlgorithm);
	},

	getPassword: function(passwordName, timeout, profile, migrateAlgorithm) {
	  var urlString = "chrome://syncplaces";
		if (profile) {
			 urlString += "/" + profile;
		}

		var password = "";
		var oldPassword = "";

		//Retrieve any securely stored password
		try {
			var loginManager = this.Cc["@mozilla.org/login-manager;1"]
														 .getService(this.Ci.nsILoginManager);

			//Find users for the given parameters
			var logins = loginManager.findLogins({}, urlString,
																					 'SyncPlaces', null);

			//Find user from returned array of nsILoginInfo objects
			for (var i = 0; i < logins.length; i++) {
				if (logins[i].username == passwordName) {
					password = logins[i].password;
				}
				else if (logins[i].username == this.encryptUser) {
					oldPassword = logins[i].password;
				}
			}

		} catch (exception) {
			this.alert2(exception, 'couldnt_retrieve_password', null, timeout);
		}

		//Migrate old passwords, on first time use only
		if (!this.prefs.getCharPref("version") && migrateAlgorithm && oldPassword) {
			if (migrateAlgorithm == 'send') {
				if (!password) password = oldPassword;
			}
			//If receiving or loading and the passwords are different, migrate anyway, but alert them
			else if (migrateAlgorithm == 'receive' || migrateAlgorithm == 'load') {
				if (password && password != oldPassword) {
					this.alert2(null, 'password_conflict', null, timeout,
										"http://www.andyhalford.com/syncplaces/migration.html#passwords");
				}
				if (!password) password = oldPassword;
			}
		}

		return password;
	},

	//Save the preferences
	savePrefs: function(timeout) {
		this.serverSettingsChanged();
		this.savePasswords(timeout);

		//Iterate over each item (use the defaults list) saving the value
		var prefList = this.defaults.getChildList("", {});
		for (var i = 0 ; i < prefList.length ; i++) {
			switch (this.defaults.getPrefType(prefList[i])) {
				case this.defaults.PREF_BOOL:
					//Deal with outdated prefs (check for null)
					var checkbox = document.getElementById(prefList[i]);
					if (checkbox)
						this.prefs.setBoolPref(prefList[i], checkbox.checked);
				break;

				case this.defaults.PREF_STRING:
					var item = document.getElementById(prefList[i]);
					if (!item) break;

					//If radio group (probably a better way of doing this)
					if (prefList[i] == "protocol" || prefList[i] == "comparison" ||
							prefList[i] == "receive_mechanism" ||
							prefList[i] == "send_mechanism" ||
							prefList[i] == "bits" ||
							prefList[i] == "encryption" ||
							prefList[i] == "shutdown_detection" ||
							prefList[i] == "autostart_detection" ||
							prefList[i] == "sync_type") {
						this.prefs.setCharPref(prefList[i], item.selectedItem.id);
					}

					//If profiles then save the profile strings
					else if (prefList[i] == "profiles") {
						var menuList = document.getElementById(prefList[i]);
						this.saveProfilePrefs(menuList);
					}

					//Some things are strictly ASCII strings
					else if (prefList[i] == "transfer_time" || prefList[i] == "transfer_interval" || 
									 prefList[i] == "delay" || prefList[i] == "timeoutDelay") 
					{
						this.prefs.setCharPref(prefList[i], item.value);
					}

					//else (if text field) set the value directly
					else if (prefList[i] != "backupfolder") {
						this.setComplex(prefList[i], item.value);
					}
				break;
			}
		}
	},

	saveProfilePrefs: function(menuList) {
		var menuItems = menuList.firstChild.childNodes;
		var currentProfile = menuItems[0].value;
		var profiles = menuItems[0].value;
		var names = menuItems[0].label;
		for (var j=1; j<menuItems.length; j++) {
			profiles += "," + menuItems[j].value;
			names += "," + menuItems[j].label;
			if (j == menuList.selectedIndex) currentProfile = menuItems[j].value;
		}

		this.setComplex("profiles", profiles);
		this.setComplex("current_profile", currentProfile);
		this.setComplex("profile_names", names);
	},

	removeOldPasswords: function(profile) {
	  var urlString = "chrome://syncplaces";
		if (profile) {
			 urlString += "/" + profile;
		}

		//Remove any existing passwords
		var loginManager = this.Cc["@mozilla.org/login-manager;1"].getService(this.Ci.nsILoginManager);
		var logins = loginManager.findLogins({}, urlString,
																				 'SyncPlaces', null);
		for (var i = 0; i < logins.length; i++) {
			//Use the stored preference userid - not the new one!!
			if (logins[i].username == this.getComplex("userid") ||
					logins[i].username == this.passwordUser) {
				loginManager.removeLogin(logins[i]);
			}
		}
	},

	savePasswords: function(timeout, profile, encryptPassword) {
	  var urlString = "chrome://syncplaces";
		if (profile) {
			 urlString += "/" + profile;
		}

		//Save login/encryption password details
		//(before prefs, or old userid overwritten)
		try {
			//Remove any existing passwords
			this.removeOldPasswords(profile);

			//Add the new ones
			var userid = document.getElementById('userid').value;
			var password = document.getElementById('password').value;
			var loginManager = this.Cc["@mozilla.org/login-manager;1"].getService(this.Ci.nsILoginManager);
			var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1", this.Ci.nsILoginInfo, "init");
			if (userid && password) {
				var loginInfo= new nsLoginInfo(urlString, 'SyncPlaces', null,
																			 userid, password, "", "");
				loginManager.addLogin(loginInfo);
			}
			if (!encryptPassword) encryptPassword = document.getElementById('password_password').value;
			if (encryptPassword) {
				var loginInfo= new nsLoginInfo(urlString, 'SyncPlaces', null,
																			 this.passwordUser, encryptPassword, "", "");
				loginManager.addLogin(loginInfo);
			}

		} catch (exception) {
			this.alert2(exception, 'couldnt_save_password', null, timeout);
		}
	},

	//When the OK button is pressed, save all the settings
	onDialogAccept: function() {
		//Check the range values are correct
		this.checkValues();

		//Save the prefs
		this.savePrefs(true);

		//Statusbar icon
		this.updateStatusBar();

		//Shutdown if required
		if (this.shutdown) this.Cc["@mozilla.org/toolkit/app-startup;1"]
													 .getService(this.Ci.nsIAppStartup)
													 .quit(this.Ci.nsIAppStartup.eAttemptQuit);
		return true;
	},

	updateStatusBar: function() {
		//Get a list of all open windows
		var wm = this.Cc["@mozilla.org/appshell/window-mediator;1"]
								 .getService(this.Ci.nsIWindowMediator);
		var enumerator = wm.getEnumerator('navigator:browser');

		//Now hide/show on each window
		while(enumerator.hasMoreElements()) {
			var currentWindow = enumerator.getNext();

			//Turn things on/off as appropriate
			try {
				var bmMenu = document.getElementById("bookmarks_menu").checked;
				currentWindow.document.getElementById("syncplaces-bmenu").hidden = !bmMenu;
		  } catch (exception) {}
			try {
				var bmMenu = document.getElementById("bookmarks_menu").checked;
				currentWindow.document.getElementById("syncplaces-amenu").hidden = !bmMenu;
		  } catch (exception) {}

			try {
				var toolsMenu = document.getElementById("tools_menu").checked;
				currentWindow.document.getElementById("syncplaces-tmenu").hidden = !toolsMenu;
		  } catch (exception) {}
		}
	},

	//When the Cancel button is pressed, just close
	onDialogCancel: function() {
		return true;
	},

	//Check all options are within bounds
	checkValues: function() {
		this.checkPath(false, "path");
		this.checkPath(false, "htmlpath");
		this.checkPath(false, "xbelpath");
		this.checkPath(false, "passwordpath");
		this.checkInterval();
		this.checkTags(false);
	},

	//Check the path option is correct
	checkPath: function(displayAlert, id) {
		var path = document.getElementById(id);
		var value =	this.trim(path.value);
		if (value) {
			var os = "WINNT";
			try {
				os = this.Cc["@mozilla.org/xre/app-info;1"].createInstance(this.Ci.nsIXULRuntime).OS;
			} catch (exception) {
				os = "Darwin";
			}

			var link = "http://www.andyhalford.com/syncplaces/sync.html";
			if (document.getElementById("protocol").selectedItem.id == 'file') {
				if (value.match(/^\\\\/)) {
					if (displayAlert) {
						this.alert2(null, 'no_unc_support', null, true, link);
					}
					value = "";
				}
				//Check that it's a file and not a folder
				if (SyncPlacesIO.isFolder(value)) {
					if (displayAlert) {
						this.alert2(null, 'no_folders', null, true, link);
					}
					value = "";
				}
				//Make sure that the correct form is used for Windows
				if (os == "WINNT") {
					if (!value.match(/^.:\\/)) {
						if (displayAlert) {
							this.alert2(null, 'must_start_with_a_drive', null, true, link);
						}
						value = "";
					}
				}
				//Otherwise must start with at least a '/'
				else if (!value.match(/^\//)) {
					if (displayAlert) {
						this.alert2(null, 'must_have_slash', null, true, link);
					}
					value = "";
				}
				else if (value == "/") {
					if (displayAlert) {
						this.alert2(null, 'more_than_slash', null, true, link);
					}
					value = "";
				}
			}
			else {
				//Must start with at least a '/'
				if (value.indexOf("/") != 0) {
					if (displayAlert) {
						this.alert2(null, 'must_have_slash', null, true, link);
					}
					value = "";
				}
				else if (!value.match(/^\//)) {
					if (displayAlert) {
						this.alert2(null, 'more_than_slash', null, true, link);
					}
					value = "";
				}
			}
		}
		if (path.value != value) path.value = value;
	},

	//Check the "sync every X" interval is greater than 9 seconds
	checkInterval: function() {
		var interval = document.getElementById("transfer_interval").value;
		if (document.getElementById("transfer_measure").value == "seconds" &&
				interval < 10)
		{
			document.getElementById("transfer_interval").value = 10;
		}
	},

	//Check the password password has a value, if not then disable options
	checkPPassword: function() {
		var value =	this.trim(document.getElementById("password_password").value);
		if (!value) {
			this.alert2(null, 'missing_password', null, true,
									"http://www.andyhalford.com/syncplaces/advanced.html#encryption");
			document.getElementById('sync_passwords').checked = false;
			document.getElementById('encrypt').checked = false;
		}
	},

	//Check manually entered styling tags are valid
	checkTags: function(displayAlert) {
		var tags = document.getElementById("style_tags");
		var value =	this.trim(tags.value);
		if (!this.realCheckTags(value) && displayAlert)
			this.alert2(null, 'bad_tags', null, true,
								 "http://www.andyhalford.com/syncplaces/advanced.html#xbel");
	},

	//Real checkTags function is here (for non-dialog use)
	realCheckTags: function(value) {
		if (value) {
			try {
				var domParser = new DOMParser();
				var dom = domParser.parseFromString(value + "<xbel></xbel>", "text/xml");
				if (dom.documentElement.nodeName == "parsererror") {
					return false;
				}
			} catch (exception) {
				return false;
			}
		}
		return true;
	},

	//Check if SortPlaces is installed
	checkSortPlaces: function(startup) {
		var autoSort = document.getElementById("auto_sort");
		if (autoSort.checked) {
			try {
				SortPlacesSort.getDescription(0);
			} catch (e) {
				autoSort.checked = false;
				if (!startup) this.alert2(null, 'missing_sortplaces', null, true,
											"https://addons.mozilla.org/en-US/firefox/addon/9275");
			}
		}
	},

	//Log message to console
	message: function(message) {
	  var consoleService = this.Cc["@mozilla.org/consoleservice;1"]
                             .getService(this.Ci.nsIConsoleService);
	  consoleService.logStringMessage("SyncPlaces: " + message);
	},

	//Display my own style alert with a link to support pages
	alert2: function(exception, key, extraText, timeout, link, confirm) {
		if (!confirm) SyncPlacesNetworking.running = false;

		//If there's an exception log it and display it
		if (exception) {
			Components.utils.reportError(exception);
			if (key) SyncPlaces.timedStatus(key, timeout, true);
		}

		//If there's a key then display message
		else if (key) {
			var params = {inn:{key:key, extraText:extraText, link:link, confirm:confirm}, out:null};
			window.openDialog('chrome://syncplaces/content/alert.xul', '_blank',
										 		'chrome,modal,centerscreen', params);
			if (params.out && params.out.cancelled) {
				return false;
			}
		}
		return true;
	},
	onAlertLoad: function() {
		var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
										.getService(Components.interfaces.nsIStringBundleService)
										.createBundle("chrome://syncplaces/locale/syncplaces.properties");

		var key = window.arguments[0].inn.key;
		var extraText = window.arguments[0].inn.extraText;
		document.getElementById("message").value = bundle.GetStringFromName(key) +
											 			(extraText ? ": " + extraText : "");

		var link = window.arguments[0].inn.link;
		link = link ? link : "http://www.andyhalford.com/syncplaces/support.html#exceptions";
		document.getElementById("link").href=link;

		var confirm = window.arguments[0].inn.confirm;
		if (confirm) {
			document.getElementById("syncplacesAlert").buttons = "accept,cancel";
			document.documentElement.getButton("cancel").focus();
		}
		else {
			document.documentElement.getButton("accept").focus();
		}
	},
	onAlertCancel: function() {
		window.arguments[0].out = {cancelled:true};
	},

	//Trim spaces off front and back of string
	trim: function(theString) {
		try {
			theString = theString.replace( /^\s+/g, "" );
		} catch (e) {
			theString = theString.data.replace( /^\s+/g, "" );
		}
		return theString.replace( /\s+$/g, "" );
	},

	//Display the select folder button depending on the sendall checkbox
	toggleSelectFolder: function(changed) {
		var sendAll = document.getElementById("sendall").checked;
		document.getElementById("selectfolder").disabled = sendAll;
		document.getElementById("skip_name_check").disabled = sendAll;
		document.getElementById("selected_folder").disabled = sendAll;
		document.getElementById("folder_label").disabled = sendAll;

		//If change the subfolder to sync on then send/receive/hash etc are now invalid
		if (changed) this.invalidateSyncSettings();
	},

	toggleReceiveNotify: function() {
		document.getElementById("autostart_detection").disabled = !document.getElementById("auto_receive").checked;
		document.getElementById("startup_label").disabled = !document.getElementById("auto_receive").checked;
	},

	toggleSendNotify: function() {
		document.getElementById("shutdown_detection").disabled = !document.getElementById("auto_send").checked;
		document.getElementById("shutdown_label").disabled = !document.getElementById("auto_send").checked;
	},

	toggleHTMLFolder: function() {
		document.getElementById("htmlpath").disabled = !document.getElementById("sendhtml").checked;
	},

	toggleXBELFolder: function() {
		document.getElementById("xbelpath").disabled = !document.getElementById("sendxbel").checked;
	},

	toggleRegularTransfer: function(startup) {
		var regularTransfer = document.getElementById("regular_transfer").checked;
		if (regularTransfer) {

			//When first choose it tick the other two - but they are optional thereafter
			//Also popup message to reboot Firefox
			if (!this.prefs.getBoolPref("regular_transfer")) {
				document.getElementById("auto_send").checked = true;
				document.getElementById("auto_receive").checked = true;
				this.toggleSendNotify();
				this.toggleReceiveNotify();
				this.alert2(null, 'restart_firefox', null, false,
						"http://www.andyhalford.com/syncplaces/automation.html");
			}
		}
		document.getElementById("transfer_interval").disabled = !regularTransfer;
		document.getElementById("transferint_label").disabled = !regularTransfer;
		document.getElementById("transfer_measure").disabled = !regularTransfer;
	},

	toggleTimedTransfer: function(startup) {
		var timedTransfer = document.getElementById("timed_transfer").checked;
		if (timedTransfer) {

			//Popup message to reboot Firefox when first choose it
			if (!this.prefs.getBoolPref("timed_transfer")) {
				this.alert2(null, 'restart_firefox', null, false,
						"http://www.andyhalford.com/syncplaces/automation.html");
			}
		}
		document.getElementById("transfer_time").disabled = !timedTransfer;
	},

	toggleEncryptPassword: function(check_stuff) {
		var encrypt = document.getElementById("encrypt");
		if (!encrypt.disabled) {
			this.toggleBits();
			document.getElementById("gzip").disabled = encrypt.checked;
			if (encrypt.checked && check_stuff) {
				document.getElementById("gzip").checked = false;
				this.checkPPassword();
			}
		}
	},

	togglePasswords: function(check_password) {
		this.toggleBits();
		var syncPasswords = document.getElementById("sync_passwords").checked;
		document.getElementById("passwordpath").disabled = !syncPasswords;
		document.getElementById("passwordpath_label").disabled = !syncPasswords;
		if (check_password && syncPasswords) this.checkPPassword();
	},

	toggleBits: function() {
		var tea = document.getElementById("encryption").selectedItem.id == 'TEA';
		document.getElementById("bits").disabled = tea;
		document.getElementById("bits_label").disabled = tea;
	},

	toggleProtocol: function() {
		var protocol = document.getElementById("protocol").selectedItem.id;

		//If "file://" then disable the host
		document.getElementById("host").disabled = (protocol == 'file');

		//If not "ftp://" then disable userid/pwd
		document.getElementById("userid").disabled = (protocol != 'ftp');
		document.getElementById("password").disabled = (protocol != 'ftp');
	},

	toggleSyncType: function() {
		var json = document.getElementById("sync_type").selectedItem.id == 'sync_json';
		if (json) {
			document.getElementById("encrypt").disabled = false;
			document.getElementById("small_xbel").disabled = false;
			document.getElementById("sendxbel").disabled = false;
			document.getElementById("gzip").disabled = false;
			document.getElementById("path").disabled = false;
			document.getElementById("path_label").disabled = false;
		}
		else {
			document.getElementById("encrypt").disabled = true;
			document.getElementById("encrypt").checked = false;
			document.getElementById("small_xbel").disabled = true;
			document.getElementById("small_xbel").checked = false;
			document.getElementById("sendxbel").disabled = true;
			document.getElementById("sendxbel").checked = true;
			document.getElementById("xbelpath").disabled = false;
			document.getElementById("gzip").disabled = true;
			document.getElementById("gzip").checked = false;
			document.getElementById("path").disabled = true;
			document.getElementById("path_label").disabled = true;
		}
		this.toggleXBELFolder();
		this.toggleEncryptPassword(false);
	},

	//Toggle auto sync preference
	toggleAutoSync: function(startup) {
		var autosync = document.getElementById("autosync").checked;
		document.getElementById("delay").disabled = !autosync;
		document.getElementById("delay_label").disabled = !autosync;
		document.getElementById("delay_label2").disabled = !autosync;
	},

	//Toggle auto close preference
	toggleAutoClose: function(startup) {
		var autoclose = document.getElementById("timeout").checked;
		document.getElementById("timeoutDelay").disabled = !autoclose;
		document.getElementById("ac_delay_label").disabled = !autoclose;
		document.getElementById("ac_delay_label2").disabled = !autoclose;
	},

	//Select folder for backup/restore
	selectBackupFolder: function() {
		var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
										.getService(Components.interfaces.nsIStringBundleService)
										.createBundle("chrome://syncplaces/locale/syncplaces.properties");

		var nsIFilePicker = this.Ci.nsIFilePicker;
		var fp = this.Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.init(window, bundle.GetStringFromName('backupfolder'),
						nsIFilePicker.modeGetFolder);

		var defaultFolder = SyncPlacesIO.getDefaultFolder();
		fp.displayDirectory = defaultFolder;
		if (fp.show() != nsIFilePicker.returnCancel) {
			this.prefs.setComplexValue("backupfolder", this.Ci.nsILocalFile, fp.file);
		}
	},

	//Select which folder to send
	selectBookmarkFolder: function() {
		//Get the current node and pass it across
		var currentID = -1;
		try {
			currentID = this.prefs.getIntPref("bookmarkFolderID");

		} catch(exception) {
			currentID = -1;
		}

		var params = {inn:{currentID:currentID}, out:null};
		window.openDialog('chrome://syncplaces/content/folders.xul', '_blank',
										 'chrome,resizable,modal,centerscreen', params);
		if (params.out && params.out.selectedNode) {
			var selectedNode = params.out.selectedNode;

			//If ID has changed then invalidate sync settings
			if (currentID && currentID != selectedNode.itemId)
				this.invalidateSyncSettings();

			//Proudly display the chosen folder
			document.getElementById("selected_folder").value = selectedNode.title;

			//Display the appropriate tabs
			this.toggleSelectFolder(false);
		}
	},

	//Backup everything
	backupAll: function() {
		SyncPlaces.saveBookmarks(true, SyncPlaces.JSON, false, null);
		SyncPlacesPasswords.savePasswords();
//		this.Cc["@mozilla.org/preferences-service;1"].getService(this.Ci.nsIPrefService).savePrefFile(this.Ci.nsnull);
	},

	//Restore everything
	restoreAll: function() {
		SyncPlaces.restoreBookmarks(null, null, true, false);
		SyncPlacesPasswords.restorePasswords();
//		this.Cc["@mozilla.org/preferences-service;1"].getService(this.Ci.nsIPrefService).readUserPrefs(this.Ci.nsnull);
	},

	//If server settings changed then invalidate the hash files
	//and delete the send/received timestamps used for merge deletes
	serverSettingsChanged: function() {
		if (this.prefs.getCharPref("protocol") !=
				document.getElementById("protocol").selectedItem.id ||
				this.getComplex("host") != document.getElementById("host").value ||
				this.getComplex("path") != document.getElementById("path").value ||
				(document.getElementById("sendhtml").checked && !this.prefs.getBoolPref("sendhtml")) ||
				this.getComplex("htmlpath") != document.getElementById("htmlpath").value ||
				(document.getElementById("sendxbel").checked && !this.prefs.getBoolPref("sendxbel")) ||
				this.getComplex("xbelpath") != document.getElementById("xbelpath").value ||
				this.getComplex("userid") != document.getElementById("userid").value)
		{
			this.invalidateSyncSettings();
		}
	},

	invalidateSyncSettings: function() {
		this.prefs.setCharPref("sendHash", "");
		this.prefs.setCharPref("receiveHash", "");
		this.prefs.setCharPref("sendPwdHash", "");
		this.prefs.setCharPref("receivePwdHash", "");
		this.prefs.setCharPref("lastSend", "0");
		this.prefs.setCharPref("lastReceived", "0");
		SyncPlacesIO.deleteFile(SyncPlaces.mergeFile);
	},

	//Display the last transfer times
	lastTransferTimes: function(startup) {
		if (startup) {
			var lastReceived = parseInt(this.prefs.getCharPref("lastReceived"), 10);
			if (lastReceived)
				document.getElementById('last_received').value = new Date(lastReceived/1000).toLocaleString();
			else
				document.getElementById('last_received').value = "";

			var lastSend = parseInt(this.prefs.getCharPref("lastSend"), 10);
			if (lastSend)
				document.getElementById('last_sent').value = new Date(lastSend/1000).toLocaleString();
			else
				document.getElementById('last_sent').value = "";
		}

		//If want to dynamically update them, reopen the dialog
		else {
			window.close();
			SyncPlaces.actionsOpen(true);
		}
	},

	//Export all the SyncPlaces prefs + add in the passwords as well (unencrypted)
	exportProfile: function() {
		var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
										.getService(Components.interfaces.nsIStringBundleService)
										.createBundle("chrome://syncplaces/locale/syncplaces.properties");

		var nsIFilePicker = this.Ci.nsIFilePicker;
		var fp = this.Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.init(window, bundle.GetStringFromName('exportfile'), nsIFilePicker.modeSave);
		fp.appendFilter(bundle.GetStringFromName('json_files'), "*.json");
		fp.defaultString = this.prefsFile;

		if (fp.show() != nsIFilePicker.returnCancel) {
			window.setCursor("wait");	//Do this after the file picker otherwise gets ignored
			try {
				//Save the profile's name for importing
				this.setComplex("current_profile_name",
												document.getElementById("profiles").selectedItem.label);
				var json = this.prefsToJson(true);
				SyncPlacesIO.saveFilePath(fp.file, json);
				SyncPlaces.timedStatus('prefs_exported', true, false);

			} catch (exception) {
				this.alert2(exception, 'cant_export_prefs', null, true);
			}
		}
		window.setCursor("auto");
	},

	//Get the current preferences as a JSON string
	prefsToJson: function(addPasswords) {
		//Save them all first
		this.onDialogAccept();

		var preferences = {};
		var prefList = this.defaults.getChildList("", {});
		for (var i = 0 ; i < prefList.length ; i++) {
			switch (this.defaults.getPrefType(prefList[i])) {
				case this.defaults.PREF_INT:
					preferences[prefList[i]] = {};
					preferences[prefList[i]].type = this.defaults.PREF_INT;
					preferences[prefList[i]].value = this.prefs.getIntPref(prefList[i]);
				break;

				case this.defaults.PREF_BOOL:
					preferences[prefList[i]] = {};
					preferences[prefList[i]].type = this.defaults.PREF_BOOL;
					preferences[prefList[i]].value = this.prefs.getBoolPref(prefList[i]);
				break;

				case this.defaults.PREF_STRING:
					preferences[prefList[i]] = {};
					preferences[prefList[i]].type = this.defaults.PREF_STRING;
					//These are all strictly Western char set strings
					if (prefList[i] == "protocol" ||
							prefList[i] == "comparison" ||
							prefList[i] == "receive_mechanism" ||
							prefList[i] == "send_mechanism" ||
							prefList[i] == "bits" ||
							prefList[i] == "encryption" ||
							prefList[i] == "autostart_detection" ||
							prefList[i] == "shutdown_detection" ||
							prefList[i] == "sync_type" ||
							prefList[i] == "transfer_time" ||
							prefList[i] == "transfer_interval" ||
							prefList[i] == "delay")
					{
						preferences[prefList[i]].value = this.prefs.getCharPref(prefList[i]);
					}
					else
						preferences[prefList[i]].value = this.getComplex(prefList[i]).data;
				break;
			}
		}

		//Add passwords
		if (addPasswords) {
			preferences.passwords = {};
			preferences.passwords.userid = this.getPassword(this.getComplex("userid"), true);
			preferences.passwords.passwordUser = this.getPassword(this.passwordUser, true);
		}

		return PlacesUtils.toJSONString(preferences);
	},

	//Import all the SyncPlaces prefs
	importProfile: function() {
		var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
										.getService(Components.interfaces.nsIStringBundleService)
										.createBundle("chrome://syncplaces/locale/syncplaces.properties");

		var nsIFilePicker = this.Ci.nsIFilePicker;
		var fp = this.Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.init(window, bundle.GetStringFromName('importfile'), nsIFilePicker.modeOpen);
		fp.appendFilter(bundle.GetStringFromName('json_files'), "*.json");
		fp.defaultString = this.prefsFile;

		if (fp.show() != nsIFilePicker.returnCancel) {
			window.setCursor("wait");	//Do this after the file picker otherwise gets ignored
			try {
				this.readProfile(fp.file, true);
				SyncPlaces.timedStatus('prefs_imported', true, false);

			} catch (exception) {
				this.alert2(exception, 'cant_import_prefs', null, true);
			}
		}
		window.setCursor("auto");
	},

	//Read in a profile file and apply it
	readProfile: function(profileFile, importing) {
		var jstr = SyncPlacesIO.readFile(profileFile);
		var preferences;
		try {
			preferences = JSON.parse(jstr);
		} catch (exception) {
			//Old FF
			var nativeJSON = this.Cc["@mozilla.org/dom/json;1"].createInstance(this.Ci.nsIJSON);
			preferences = nativeJSON.decode(jstr);
		}

		if (importing) {
			//Check there's a profile name in the import
			var name = preferences.current_profile_name.value;
			if (!name) {
				this.alert2(null, 'missing_name', null, true,
						"http://www.andyhalford.com/syncplaces/advanced.html#profiles");
				return;
			}

			//If name already exists then overwrite that one
			var existingName = false;
			var menuList = document.getElementById("profiles");
			var menuItems = menuList.firstChild.childNodes;
			for (var i=0; i<menuItems.length; i++) {
				if (name == menuItems[i].label) {
					existingName = true;
					menuList.selectedItem = menuItems[i];
					break;
				}
			}

			//Make the existing one the current profile, so that it gets overwritten
			if (existingName) {
				this.changeProfile();

				//Delete any passwords associated with current profile
				//imported one may not use them eg it may not use encryption
				try {
					this.removeOldPasswords(this.getComplex("current_profile"));
				} catch (exception) {
				}
			}

			//If name doesn't exist then create new profile to overwrite
			else {
				this.addProfile(name);
			}

			//Remove current passwords
			try {
				this.removeOldPasswords();
			} catch (exception) {
			}
		}

		//Iterate over each item (use the defaults list) saving the value
		//If no value in profile then reset it to the default
		var prefList = this.defaults.getChildList("", {});
		for (var i = 0 ; i < prefList.length ; i++) {
			switch (this.defaults.getPrefType(prefList[i])) {
				case this.defaults.PREF_INT:
					if (preferences[prefList[i]] && preferences[prefList[i]].type == this.defaults.PREF_INT)
						this.prefs.setIntPref(prefList[i], preferences[prefList[i]].value);
					else {
						try {
							this.prefs.clearUserPref(prefList[i]);
						} catch(e) {}	//If already at default then this fails for some reason unknown to me
					}
				break;

				case this.defaults.PREF_BOOL:
					if (preferences[prefList[i]] &&
							preferences[prefList[i]].type == this.defaults.PREF_BOOL)
					{
						if (prefList[i] != "started" &&
								prefList[i] != "autoStarted")
						{
							this.prefs.setBoolPref(prefList[i], preferences[prefList[i]].value);
						}
					}
					else {
						try {
							this.prefs.clearUserPref(prefList[i]);
						} catch(e) {}	//If already at default then this fails for some reason unknown to me
					}
				break;

				case this.defaults.PREF_STRING:
					if (preferences[prefList[i]] &&
							preferences[prefList[i]].type == this.defaults.PREF_STRING)
					{
					//These are all strictly Western char set strings
						if (prefList[i] == "protocol" ||
								prefList[i] == "comparison" ||
								prefList[i] == "receive_mechanism" ||
								prefList[i] == "send_mechanism" ||
								prefList[i] == "bits" ||
								prefList[i] == "encryption" ||
								prefList[i] == "autostart_detection" ||
								prefList[i] == "shutdown_detection" ||
								prefList[i] == "sync_type" ||
								prefList[i] == "transfer_time" ||
								prefList[i] == "transfer_interval" ||
								prefList[i] == "delay")
						{
							this.prefs.setCharPref(prefList[i], preferences[prefList[i]].value);
						}
						//Ignore these if stored
						else if (prefList[i] != "backupfolder" &&
							prefList[i] != "profiles" &&
							prefList[i] != "profile_names" &&
							prefList[i] != "current_profile")
						{
							this.setComplex(prefList[i], preferences[prefList[i]].value);
						}
					}
					else {
						try {
							this.prefs.clearUserPref(prefList[i]);
						} catch(e) {}	//If already at default then this fails for some reason unknown to me
					}
				break;
			}
		}

		//Invalidate hashes and timestamps whenever reading any profile in which causes server/subfolder changes
		this.serverSettingsChanged();

		//Restore passwords
		if (preferences.passwords) {
			document.getElementById('userid').value = preferences.userid.value;
			document.getElementById('password').value = preferences.passwords.userid;
			document.getElementById('password_password').value = preferences.passwords.passwordUser;

			//Store passwords in password system
			this.savePasswords(true);
		}

		//Apply them
		this.onDialogLoad();

		//Statusbar icon
		this.updateStatusBar();

		//Warning about automation
		if (this.prefs.getBoolPref("regular_transfer") || this.prefs.getBoolPref("timed_transfer"))
			this.alert2(null, 'restart_automation', null, false,
						"http://www.andyhalford.com/syncplaces/options.html#automation");
	},

	addProfile: function(name) {
		//Save the passwords to profile specific area
		//But keep the current settings => current passwords
		this.savePasswords(true, this.getComplex("current_profile"));

		//Save the current prefs to the current profile
		var json = this.prefsToJson(false);
		SyncPlacesIO.saveFile(this.getComplex("current_profile"), json);

		//Add a new item to the dropdown
		var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
										.getService(Components.interfaces.nsIStringBundleService)
										.createBundle("chrome://syncplaces/locale/syncplaces.properties");
		var menuList = document.getElementById("profiles");
		var profiles = this.getComplex("profiles");
		var newId	= SyncPlacesIO.saveUniqueFile(bundle.GetStringFromName('new_profile_name'), "");
		menuList.appendItem((name ? name : newId), newId);
		menuList.selectedIndex = menuList.firstChild.childNodes.length - 1;

		//Update the preference lists
		this.saveProfilePrefs(menuList);
	},

	deleteProfile: function() {
		//Remove from dropdown
		var menuList = document.getElementById("profiles");
		var menuItems = menuList.firstChild.childNodes;
		if (menuItems.length == 1) {
			this.alert2(null, 'cant_delete_last_one', null, true,
						"http://www.andyhalford.com/syncplaces/advanced.html#profiles");
			return;
		}
		var currentIndex = menuList.selectedIndex;
		menuList.removeItemAt(menuList.selectedIndex);
		if (currentIndex == 0) menuList.selectedIndex = 0;
		else menuList.selectedIndex = currentIndex-1;

		//Delete prefs from disk
		var currentProfile = this.getComplex("current_profile");
		SyncPlacesIO.deleteFile(currentProfile);

		//Delete any passwords
		try {
			this.removeOldPasswords(currentProfile);
			this.removeOldPasswords();
		} catch (exception) {
		}

		//Update the preference lists
		this.saveProfilePrefs(menuList);

		//Load in the new current profile
		var filePath = SyncPlacesIO.getDefaultFolder();
		currentProfile = menuList.selectedItem.value;
		filePath.append(currentProfile);
		try {
			this.readProfile(filePath, false);

		} catch (exception) {
			this.alert2(exception, 'cant_read_profile', null, true);
			return;
		}

		//Display profile specific passwords
		this.displayPasswords(currentProfile);
	},

	//Fired when user changes the currently selected item on the dropdown
	changeProfile: function() {
		//Save it before it gets changed
		var currentProfile = this.getComplex("current_profile");

		//Save the passwords to profile specific area
		this.savePasswords(true, currentProfile);

		//Save the current prefs
		var json = this.prefsToJson(false);
		SyncPlacesIO.saveFile(currentProfile, json);

		//Remove the current passwords
		try {
			this.removeOldPasswords();
		} catch (exception) {
		}

		//Update the preference lists
		var menuList = document.getElementById("profiles");
		//Already done by "prefsToJson"
		//this.saveProfilePrefs(menuList);

		//Load in the current profile
		var filePath = SyncPlacesIO.getDefaultFolder();
		currentProfile = menuList.selectedItem.value;
		filePath.append(currentProfile);
		try {
			this.readProfile(filePath, false);

		} catch (exception) {
			this.alert2(exception, 'cant_read_profile', null, true);
			return;
		}

		//Display profile specific passwords
		this.displayPasswords(currentProfile);
	},

	//Fired when profiles dropdown is edited and user 'leaves' the text box
	renameProfile: function() {
		//Get name displayed
		var menuList = document.getElementById("profiles");
		var newName = menuList.inputField.value;
		newName = this.trim(newName);

		//Must enter something
		if (!newName) {
			this.alert2(null, 'missing_name', null, true,
						"http://www.andyhalford.com/syncplaces/advanced.html#profiles");
		}
		//Check for duplicates
		else {
			var menuItems = menuList.firstChild.childNodes;
			for (var i=0; i<menuItems.length; i++) {
				if (newName == menuItems[i].label) {
					this.alert2(null, 'duplicate_name', null, true,
						"http://www.andyhalford.com/syncplaces/advanced.html#profiles");
					newName = null;
					break;
				}
			}
		}

		//Update the current_profile's name in menuList and select it
		var menuItems = menuList.firstChild.childNodes;
		var currentProfile = this.getComplex("current_profile");
		for (var i=0; i<menuItems.length; i++) {
			if (currentProfile == menuItems[i].value) {
				if (newName)
					menuItems[i].label = newName;
				else
					menuList.inputField.value = menuItems[i].label;

				//Select the new name
				menuList.selectedItem = menuItems[i];
				break;
			}
		}
	},

	//Move profile up/down within the list
	moveProfile: function(moveup) {
		//If at top or bottom of list already then nothing to do
		var menuList = document.getElementById("profiles");
		var menuItems = menuList.firstChild.childNodes;
		var currentIndex = menuList.selectedIndex;
		if ( (currentIndex == 0 && moveup) || (currentIndex == (menuItems.length-1) && !moveup) )
			return;

		//Get the list of profiles and their names
		var profiles = [];
		var names = [];
		var currentProfile;
		var currentName;
		for (var i=0; i<menuItems.length; i++) {
			var profile = menuItems[i].value;
			profiles.push(profile);
			var name = menuItems[i].label;
			names.push(name);
			if (i == currentIndex) {
				currentProfile = profile;
				currentName = name;
			}
		}

		//Make the change
		profiles.splice(currentIndex, 1);
		names.splice(currentIndex, 1);
		currentIndex += (moveup ? -1 : +1);
		profiles.splice(currentIndex, 0, currentProfile);
		names.splice(currentIndex, 0, currentName);

		//Clear the list and rebuild it
		menuList.removeAllItems();
		for (var i=0; i<profiles.length; i++) {
			menuList.appendItem(names[i], profiles[i]);
		}

		//Select the current profile
		menuList.selectedIndex = currentIndex;

		//Update the preference lists
		this.saveProfilePrefs(menuList);
	}
}
