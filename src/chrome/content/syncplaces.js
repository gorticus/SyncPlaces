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

var SyncPlaces = {
	Cc: Components.classes,
	Ci: Components.interfaces,
	jsonBackupFile: "syncplaces_backup.json",
	xbelExportFile: "syncplaces_xbel.xml",
	xbelJsonFile: "syncplaces.xbel.json",
	serverPageFile: "syncplaces_server_page.html",
	mergeFile: "syncplaces_merge.json",
	JSON: 0,
	HASH: 1,
	XBEL: 2,
	HTML: 3,
	PWD : 4,
	PWD_HASH: 5,
	clearStatusTimeout: 2500,
	currentTimeoutID: -1,
	sideBarOpen: false,
	organizerOpen: false,

	//Calc the URI
	getURI: function(type, fulluri, realm) {
		var protocol = SyncPlacesOptions.prefs.getCharPref("protocol");
		var uri = protocol + "://";

		var path = "";
		switch(type) {
			case this.JSON:
				path = SyncPlacesOptions.getComplex("path");
				break;
			case this.HASH:
				var json = SyncPlacesOptions.prefs.getCharPref("sync_type") == 'sync_json';
				path = SyncPlacesOptions.getComplex(json ? "path" : "xbelpath");
				if (!path || SyncPlacesOptions.trim(path).length == 0) return null;
				path = SyncPlacesOptions.trim(path) + ".sha1";
				break;
			case this.HTML:
				path = SyncPlacesOptions.getComplex("htmlpath");
				break;
			case this.XBEL:
				path = SyncPlacesOptions.getComplex("xbelpath");
				break;
			case this.PWD:
				path = SyncPlacesOptions.getComplex("passwordpath");
				break;
			case this.PWD_HASH:
				path = SyncPlacesOptions.getComplex("passwordpath");
				if (!path || SyncPlacesOptions.trim(path).length == 0) return null;
				path = SyncPlacesOptions.trim(path) + ".sha1";
				break;
		}
		if (!path || SyncPlacesOptions.trim(path).length == 0) return null;

		if (protocol == 'file') {
			path = SyncPlacesOptions.trim(path);
			return uri + path;
		}

		var host = SyncPlacesOptions.getComplex("host");
		if (!host || SyncPlacesOptions.trim(host).length == 0) {
			return null;
		}
		host = SyncPlacesOptions.trim(host);

		//explicit ftp login details
		var userid;
		var password;
		if (protocol == 'ftp') {
			userid = SyncPlacesOptions.getComplex("userid");
			password = SyncPlacesOptions.getPassword(userid, false);
		}

		//Strip out any embedded userid/password from the host
		//for any protocol, not just ftp
		var login = this.stripEmbeddedLogin(host, userid, password);
		host = login.host;
		userid = login.userid;
		password = login.password;

		//Calc the fulluri using details stored in password system
		//unless there's an explicit userid for ftp
		//Or it's ftp and you're skipping authentication altogether
		if (fulluri && !userid &&
				(protocol != 'ftp' || !SyncPlacesOptions.prefs.getBoolPref("skip_auth")))
		{
			try {
				var loginManager = this.Cc["@mozilla.org/login-manager;1"]
															 .getService(this.Ci.nsILoginManager);
				if (!realm) realm = "";
				var logins = loginManager.findLogins({}, uri + host, null, realm);

				//Find user/pass from returned array of nsILoginInfo objects
				//use the last one found - ie most recently added
				var userid;
				var password;
				for (var i = 0; i < logins.length; i++) {
					userid = logins[i].username;
					password = logins[i].password;
				}
			} catch (exception) {
//Components.utils.reportError(e);
			}
		}

		if (userid && SyncPlacesOptions.trim(userid).length > 0) {
			uri += encodeURIComponent(SyncPlacesOptions.trim(userid));
			if (password && SyncPlacesOptions.trim(password).length > 0) {
				//Dont trim the password in case it begins or ends with a space
				uri += ":" + encodeURIComponent(password);
			}
			uri += "@";
		}
		uri = uri + host + SyncPlacesOptions.trim(path);
		return uri;
	},

	stripEmbeddedLogin: function(host, userid, password) {
		var login = {};
		login.host = host;
		login.userid = userid;
		login.password = password;

		var index = host.indexOf('@');
		if (index != -1 && index != host.length-1) {
			login.host = host.substring(index+1);
			//Only use the embedded userid/password if there isn't an explicit one
			if ((!userid || !password) && index != 0) {
				login.userid = host.substring(0, index);
				index = login.userid.indexOf(':');
				if (index != -1) {
					if (index != login.userid.length-1)
						login.password = login.userid.substring(index+1);
					if (index != 0)
						login.userid = login.userid.substring(0, index);
				}
			}
		}
		return login;
	},

	importBookmarks: function(merge) {
		var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
										.getService(Components.interfaces.nsIStringBundleService)
										.createBundle("chrome://syncplaces/locale/syncplaces.properties");

		SyncPlacesOptions.prefs.setBoolPref("merge", merge);
		SyncPlacesOptions.prefs.setBoolPref("merge_pwd", merge);

		var nsIFilePicker = this.Ci.nsIFilePicker;
		var fp = this.Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.init(window, bundle.GetStringFromName('importfile'), nsIFilePicker.modeOpen);
		fp.appendFilters(fp.filterXML);
		fp.defaultString=this.xbelExportFile;

		if (fp.show() != nsIFilePicker.returnCancel) {
			//Take a backup first
			if (SyncPlaces.saveBookmarks(true, SyncPlaces.JSON, false, null)) {
				try {
					if (this.restoreBookmarks(this.xbelJsonFile, fp.file, true, true))
						this.timedStatus('bookmarks_imported', true, false);

				} catch (exception) {
					SyncPlacesOptions.alert2(exception, 'cant_import_bookmarks', null, true);
				}
			}
		}
		window.setCursor("auto");
	},

	exportBookmarks: function() {
		var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
										.getService(Components.interfaces.nsIStringBundleService)
										.createBundle("chrome://syncplaces/locale/syncplaces.properties");

		var nsIFilePicker = this.Ci.nsIFilePicker;
		var fp = this.Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
		fp.init(window, bundle.GetStringFromName('exportfile'), nsIFilePicker.modeSave);
		fp.appendFilters(fp.filterXML);
		fp.defaultString=this.xbelExportFile;

		if (fp.show() != nsIFilePicker.returnCancel) {
			window.setCursor("wait");	//Do this after the file picker otherwise gets ignored
			try {
				SyncPlacesXBELOut(fp.file, true, true);
				this.timedStatus('bookmarks_saved', true, false);

			} catch (exception) {
				SyncPlacesOptions.alert2(exception, 'cant_save_bookmarks', null, true);
			}
		}
		window.setCursor("auto");
	},

	//Save bookmarks to local file
	//Also save favicons
	saveBookmarks: function(showAlert, type, checkSubFolder, backupFile) {
		if (showAlert) window.setCursor("wait");
		var backupFilePath = null;

		try {
			if (!backupFile) backupFile = this.jsonBackupFile;
			backupFilePath = SyncPlacesIO.getDefaultFolder();
			backupFilePath.append(backupFile);

			//Create the backup file in the profile folder
			if (!backupFilePath.exists()) {
				backupFilePath.create(this.Ci.nsILocalFile.NORMAL_FILE_TYPE, 0600);
			}
			else if (!backupFilePath.isWritable()) {
				this.timedStatus('cant_save_bookmarks', showAlert, true);
				if (showAlert) window.setCursor("auto");
				return null;
			}

			switch(type) {
				case this.JSON:
					if (!SyncPlacesBookmarks.backupJSON(backupFilePath, checkSubFolder, showAlert)) {
						this.timedStatus('cant_save_bookmarks', showAlert, true);
						if (showAlert) window.setCursor("auto");
						return null;
					}
					//Save favicons (ignore failures) whenever take a full backup (manual or before receive)
					if (!checkSubFolder) SyncPlacesBookmarks.saveFavicons();
					break;
				case this.HTML:
					var ioService = this.Cc["@mozilla.org/browser/places/import-export-service;1"].getService(this.Ci.nsIPlacesImportExportService);
					ioService.exportHTMLToFile(backupFilePath);
					break;
				case this.XBEL:
					SyncPlacesXBELOut(backupFilePath, checkSubFolder, showAlert);
					break;
			}
		} catch (exception) {
			SyncPlacesOptions.alert2(exception, 'cant_save_bookmarks', null, showAlert);
			if (showAlert) window.setCursor("auto");
			return null;
		}

		if (showAlert) {
			this.timedStatus('bookmarks_saved', showAlert, false);
			window.setCursor("auto");
		}
		return backupFilePath;
	},

	//Restore from a local file (if any)
	restoreBookmarks: function(fileToRestore, xbelFilePath, inActions, xbelImport) {
		var result = false;
		if (inActions) window.setCursor("wait");
		this.closeSidebarOrganiser();

		//Convert the XBEL file into a JSON file
		var xbel = (xbelFilePath != null);
		if (!xbel || SyncPlacesXBELIn(xbelFilePath, inActions)) {

			//Default to a full restore of the backup file
			//It shouldn't allow merge or subfolder
			var	allowMergeAndSubFolder = true;
			if (!fileToRestore) {
				fileToRestore = this.jsonBackupFile;
				allowMergeAndSubFolder = false;
			}

			//Restore bookmarks from the bookmarks file
			try {
				var filePath = SyncPlacesIO.getDefaultFolder();
				filePath.append(fileToRestore);
				if (filePath.exists()) {
					//Calc the adds/dels since last send/receive
					var addsDels = {};
					addsDels.matchingIds = [];
					addsDels.missingNodes = [];
					addsDels.oldNodes = [];
					if (allowMergeAndSubFolder && SyncPlacesOptions.prefs.getBoolPref("merge") &&
							SyncPlacesOptions.prefs.getBoolPref("merge_deletes") && !xbelImport)
					{
						try {
							SyncPlacesMerge.compare(addsDels);
						} catch(e) {
							if (SyncPlacesOptions.prefs.getBoolPref("debug")) Components.utils.reportError(e);
						}
					}

					//Convert bookmarks to nodes
					var nodes = PlacesUtils.unwrapNodes(SyncPlacesIO.readFile(filePath), PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER);
					//Now restore/import etc from these nodes
					var stats = {};
					stats.added = 0;
					stats.addedFolder = 0;
					stats.deletes = 0;
					stats.folderDeletes = 0;
					if (!SyncPlacesUtils.restoreBookmarksFromJSONString(nodes, addsDels, allowMergeAndSubFolder, inActions, xbelImport, stats)) {
						this.timedStatus('cant_restore_bookmarks', inActions, true);
					}
					else {
						result = true;
						if (fileToRestore == this.jsonBackupFile) this.timedStatus('bookmarks_restored', inActions, false);
						//Full restore invalidates the sync settings for mergeDeletes safety
						if (!allowMergeAndSubFolder) {
							SyncPlacesOptions.invalidateSyncSettings();
							SyncPlacesOptions.lastTransferTimes();
						}
						//Display stats
						this.timedStatus(null, inActions, false, stats);
					}
				}
				else {
					this.timedStatus('no_backup_to_restore', inActions, true);
				}

				//Restore any missing favicons
				SyncPlacesBookmarks.restoreFavicons();

			} catch (exception) {
				SyncPlacesOptions.alert2(exception, 'invalid_bookmarks', null, inActions);
			}
		}

		this.openSidebarOrganiser()
		if (inActions) window.setCursor("auto");
		return result;
	},

	//Closes the sidebar and bookmarks organiser windows
	//Otherwise can hang when lots of bookmarks and these are open
	closeSidebarOrganiser: function() {
		var wm = this.Cc["@mozilla.org/appshell/window-mediator;1"].getService(this.Ci.nsIWindowMediator);
		var browserWindow = wm.getMostRecentWindow("navigator:browser");
		this.sideBarOpen = false;
		this.organizerOpen = false;

		//Is the sideBar open
		var sidebar = browserWindow.document.getElementById("sidebar-box");
		if (!sidebar.hidden) {
			//If displaying bookmarks then close it
			if (sidebar.getAttribute("sidebarcommand") == "viewBookmarksSidebar") {
				browserWindow.toggleSidebar("viewBookmarksSidebar");
				this.sideBarOpen = true;	//Set flag so that open it again afterwards
			}
		}

		//Is the organizer open - if so close it
		var enumerator = wm.getEnumerator("Places:Organizer");
		while(enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			win.close();
			this.organizerOpen = true;
		}
	},

	//Closes the sidebar and bookmarks organiser windows
	//Otherwise can hang when lots of bookmarks and these are open
	openSidebarOrganiser: function() {
		var wm = this.Cc["@mozilla.org/appshell/window-mediator;1"].getService(this.Ci.nsIWindowMediator);
		var browserWindow = wm.getMostRecentWindow("navigator:browser");

		//Was the sideBar open?
		if (this.sideBarOpen) browserWindow.toggleSidebar("viewBookmarksSidebar");

		//Was the organizer open?
		//This will hang until library closed
//		if (this.organizerOpen) openDialog("chrome://browser/content/places/places.xul", "", "chrome,toolbar=yes,dialog=no,resizable");

		//Bring SyncPlaces to the front again
		window.focus();
	},

	timedStatus: function(message, timeout, error, stats) {
		function clearStatus() {
			document.getElementById("status").value = "";
		}

		window.clearTimeout(this.currentTimeoutID);
		if (error) {
			SyncPlacesNetworking.running = false;
			//Force transfer window to close when specifically requested for errors
			var prefs = SyncPlaces.Cc["@mozilla.org/preferences-service;1"]
														.getService(SyncPlaces.Ci.nsIPrefService)
														.getBranch("extensions.syncplaces.");
			if (!timeout && prefs.getBoolPref("timeout")) {
				var delay = prefs.getCharPref("timeoutDelay");
				if (!delay) {
					window.close;	//Close immediately if delay is zero;
				}
				else {
					setTimeout(window.close, delay*1000);
				}
			}
		}
		var status;
		var msg;
		try {
			status = document.getElementById("status");
			if (!error && document.getElementById("sp_meter")) {
				document.getElementById("sp_meter").mode="determined";
				document.getElementById("sp_meter").value = 0;
			}

			var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
											.getService(Components.interfaces.nsIStringBundleService)
											.createBundle("chrome://syncplaces/locale/syncplaces.properties");
			if (!message && stats) {
				//NOTE: TODO: the msg is pointless here as gets displayed on screen for too short a time
				msg = "";
				if (stats.added) {
					var placesAdded = bundle.GetStringFromName('places_added') + stats.added;
					SyncPlacesOptions.message(placesAdded);
					msg += placesAdded + " ";
				}
				if (stats.addedFolder) {
					var foldersAdded = bundle.GetStringFromName('folders_added') + stats.addedFolder;
					SyncPlacesOptions.message(foldersAdded);
					msg += foldersAdded + " ";
				}
				if (stats.deletes) {
					var placesDeleted = bundle.GetStringFromName('places_deleted') + stats.deletes;
					SyncPlacesOptions.message(placesDeleted);
					msg += placesDeleted + " ";
				}
				if (stats.folderDeletes) {
					var foldersDeleted = bundle.GetStringFromName('folders_deleted') + stats.folderDeletes;
					SyncPlacesOptions.message(foldersDeleted);
					msg += foldersDeleted + " ";
				}
				if (stats.pwadded) {
					var passwordsAdded = bundle.GetStringFromName('passwords_added') + stats.pwadded;
					SyncPlacesOptions.message(passwordsAdded);
					msg += passwordsAdded + " ";
				}
			}

			//Get the message
			else
				msg = bundle.GetStringFromName(message);

		} catch (e) {
		}

		//If no status then must be windowless
		if (!status) {
			if (error) {
				var params = {inn:{status:message}, out:null};
				var dialog = window.openDialog('chrome://syncplaces/content/error.xul', '_blank',
													'chrome,resizable,modal,centerscreen', params);
			}
			//Send message to console (will not work with 3.0 at present, 3.5+ is fine)
			if (msg) SyncPlacesOptions.message(msg);
		}
		//Display the message on screen
		else {
			if (msg) status.value = msg;
			if (timeout)
				this.currentTimeoutID = setTimeout(clearStatus, this.clearStatusTimeout);
		}
	},

	//Fired when error.xul is loaded (see above)
	onErrorLoad: function() {
		if (window.arguments) {
			//Display any message
			status = document.getElementById("status");
			var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
											.getService(Components.interfaces.nsIStringBundleService)
											.createBundle("chrome://syncplaces/locale/syncplaces.properties");
			status.value = bundle.GetStringFromName(window.arguments[0].inn.status);
		}
	},

	//Compute SHA1 hash of a string
	computeHash: function(str) {
		//Ignore dateAdded and lastModified dates
		function stripTimestamps(str) {
			if (!str) return str;

			//General timestamps and livemark expiry's (13 & 16 digit numbers)
			str = str.replace(/\d{12,16}/g, "");
			//XBEL timestamps
			return str.replace(/"\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d.\d\d\d"/g, "");
		}

		//Ignore the values of IDs
		function stripIDs(str) {
			if (!str) return str;

			//JSON IDs
			str = str.replace(/"id":\d{1,9},/g, "");
			//XBEL IDs
			str = str.replace(/ id="row\d{1,9}"/g, "");
			return str;
		}

		//START HERE
		//Strip timestamps first
		str = stripTimestamps(str);
		//Strip id's - these may not be the same if not using the merge option
		str = stripIDs(str);

		var converter = this.Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(this.Ci.nsIScriptableUnicodeConverter);
		converter.charset = "UTF-8";
		var result = {};
		var data = converter.convertToByteArray(str, result);
		var ch = this.Cc["@mozilla.org/security/hash;1"].createInstance(this.Ci.nsICryptoHash);
		ch.init(ch.SHA1);
		ch.update(data, data.length);

		//Return it as a bin64 string (smaller than hex)
		return ch.finish(true);
	},

	//Display communication error
	displayError: function(errorCode, ignore404) {
		var foundError = true;
		switch (errorCode) {
			case 0x804B0001:
				this.timedStatus('NS_BINDING_FAILED', false, true);
				break;
			case 0x804B0002:
				this.timedStatus('NS_BINDING_ABORTED', false, true);
				break;
			case 0x804B000A:
				this.timedStatus('NS_ERROR_MALFORMED_URI', false, true);
				break;
			case 0x804B000D:
				this.timedStatus('NS_ERROR_CONNECTION_REFUSED', false, true);
				break;
			case 0x804B000E:
				this.timedStatus('NS_ERROR_NET_TIMEOUT', false, true);
				break;
			case 0x804B0010:
				this.timedStatus('NS_ERROR_OFFLINE', false, true);
				break;
			case 0x804B0014:
				this.timedStatus('NS_ERROR_NET_RESET', false, true);
				break;
			case 0x804B0015:
				this.timedStatus('NS_ERROR_FTP_LOGIN', false, true);
				break;
			case 0x80520012: 	//NS_ERROR_FILE_NOT_FOUND
			case 0x80004005:	//NS_ERROR_FAILURE - general error
			//NS_ERROR_INVALID_CONTENT_ENCODING
			//when fails to receive a valid gzip file
			case 0x804B001B:
			case 0x804B0016:	//NS_ERROR_FTP_CWD
				if (ignore404)
					foundError = false;
				else
					this.timedStatus('NS_ERROR_FTP_CWD', false, true);
				break;
			case 0x804B0017:
				this.timedStatus('NS_ERROR_FTP_PASV', false, true);
				break;
			case 0x804B0018:
				this.timedStatus('NS_ERROR_FTP_PWD', false, true);
				break;
			case 0x804B001C:
				this.timedStatus('NS_ERROR_FTP_LIST', false, true);
				break;
			case 0x804B001E:
				this.timedStatus('NS_ERROR_UNKNOWN_HOST', false, true);
				break;
			case 0x804B0046:
				this.timedStatus('NS_ERROR_DOCUMENT_NOT_CACHED', false, true);
				break;
			case 0x804B0047:
				this.timedStatus('NS_ERROR_NET_INTERRUPT', false, true);
				break;
			case 0x804B0048:
				this.timedStatus('NS_ERROR_PROXY_CONNECTION_REFUSED', false, true);
				break;
			case 0x805A1FF3:
			case 0x805A1FDC:
			case 0x805A1FEC:
				this.timedStatus('NS_ERROR_UNKNOWN_CERTIFICATE', false, true);
				break;
			default:
				SyncPlacesOptions.alert2(null, 'connection_failed', errorCode.toString(16), false);
				break;
		}
		return foundError;
	},

	//Check if data contains a web page and display it
	//Dont display if auto-send/receive cos there may not be a browser to do so
	displayWebPage: function(data, startupShutdown) {
		if (!startupShutdown && (data != null) && (data.indexOf("<html") || data.indexOf("<HTML")) ) {
			var	thisBrowser = null;
			try {
				thisBrowser = window.opener.getBrowser();

			} catch(e) {
				var wm = this.Cc["@mozilla.org/appshell/window-mediator;1"].getService(this.Ci.nsIWindowMediator);
				var mainWindow = wm.getMostRecentWindow("navigator:browser");
				thisBrowser = mainWindow.getBrowser();
			}

			//Save the data and open a browser to read it
			try {
				SyncPlacesIO.saveFile(this.serverPageFile, data);
				var serverPage = SyncPlacesIO.getDefaultFolder();
				serverPage.append(this.serverPageFile);
				var ios = this.Cc["@mozilla.org/network/io-service;1"].getService(this.Ci.nsIIOService);
				var fileURL = ios.newFileURI(serverPage);
				var tab = thisBrowser.addTab(fileURL.spec);
				thisBrowser.selectedTab = tab;

			} catch(e) {
			}
		}
	},

	//Mouse click events
	handleEvent: function(event) {
		//Left mouse click displays the actions
		//Other Mouse (eg Mac: command+click)  shows the actions
		if (event.button == 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
			this.actionsOpen();

			//Stop event bubbling up
			event.preventDefault();
		}
	},

	//Open actions window
	actionsOpen: function(skipWizard) {
		var params = null;
		if (skipWizard) {
			params = {inn:{skipWizard:true}, out:null};	//Skip the wizard when called from options.xul
		}
		window.openDialog('chrome://syncplaces/content/actions.xul', 'SyncPlaces', 'chrome,resizable,centerscreen', params);
	},

	//Open options window
	optionsOpen: function() {
		var params = {inn:{skipWizard:true}, out:null};	//Skip the wizard when called from actions.xul
		window.openDialog('chrome://syncplaces/content/options.xul', '_blank', 'chrome,modal,centerscreen', params);
		SyncPlacesOptions.lastTransferTimes(); //Update the last_* status just in case
		return false; //TO keep the actions.xul window open
	},

	//Do sync from menu
	menuSync: function() {
		SyncPlacesOptions.prefs.setBoolPref("send_safe", true);
		SyncPlacesOptions.prefs.setBoolPref("cache", true);
		SyncPlacesOptions.prefs.setBoolPref("cache_pwd", true);
		SyncPlacesOptions.prefs.setBoolPref("merge", true);
		SyncPlacesOptions.prefs.setBoolPref("merge_pwd", true);
		SyncPlacesOptions.prefs.setBoolPref("startManualSend", true);
		window.openDialog('chrome://syncplaces/content/transfer.xul', '_blank', 'chrome,resizable,modal,centerscreen', null);
	},

	//Are there any syncplaces windows showing?
	anySPDialogs: function() {
		try {
			var wm = this.Cc["@mozilla.org/appshell/window-mediator;1"].getService(this.Ci.nsIWindowMediator);
			var enumerator = wm.getEnumerator("syncPlacesType");
			return enumerator.hasMoreElements();
		} catch (exception) {
			return false;
		}
	},

	/* BROWSER LOAD AND UNLOAD */
	//Initialise the interface (show/hide icons etc) when first loads a tab (and when first launched)
	initialiseSP: function() {
		window.removeEventListener("load", SyncPlaces.initialiseSP, false);
		var prefs = SyncPlaces.Cc["@mozilla.org/preferences-service;1"]
													.getService(SyncPlaces.Ci.nsIPrefService)
													.getBranch("extensions.syncplaces.");

		//If already synced from spObserver then ignore this method first time
		//around otherwise it will mess up the automation
		if (prefs.getBoolPref("autoStarted")) {
			prefs.setBoolPref("autoStarted", false);
		}

		//Normal loading
		else {

			//Add to add-on bar (or nav bar for older browsers) with first install
			var firstrun = prefs.getBoolPref('firstrun');
			if (firstrun) {
				prefs.setBoolPref('firstrun', false);
				var myId = "syncplaces-button";
				var bar = document.getElementById("addon-bar");
				if (bar) {
					if (!document.getElementById(myId)) {
						bar.insertItem(myId);
						bar.collapsed = false;	//Show the addon bar if it is hidden
						
						//Remember these changes
						bar.setAttribute("currentset", bar.currentSet);  
						document.persist(bar.id, "currentset");
						document.persist(bar.id, "collapsed");
					}
				}

				//Use nav-bar instead for older browsers
				else {
					var bar = document.getElementById("nav-bar");
					var curSet = bar.currentSet.split(",");

					if (curSet.indexOf(myId) == -1) {
						var pos = curSet.indexOf("search-container") + 1 || curSet.length;
						var set = curSet.slice(0, pos).concat(myId).concat(curSet.slice(pos));

						bar.setAttribute("currentset", set.join(","));
						bar.currentSet = set.join(",");
						document.persist(bar.id, "currentset");
						try {
							BrowserToolboxCustomizeDone(true);
						} catch (e) {}
					}
				}
			}

			//Bookmarks menu
			var bmMenu = document.getElementById("syncplaces-bmenu");
			if (bmMenu) bmMenu.hidden = !prefs.getBoolPref("bookmarks_menu");
			var apMenu = document.getElementById("syncplaces-amenu");
			if (apMenu) apMenu.hidden = !prefs.getBoolPref("bookmarks_menu");

			//Tools menu
			var toolsMenu = document.getElementById("syncplaces-tmenu");
			if (toolsMenu) toolsMenu.hidden = !prefs.getBoolPref("tools_menu");

			//If first time for first window (crude detection)
			if (!prefs.getBoolPref("started")) {
				prefs.setBoolPref("started", true);

				//Crude startup detection ...
				if (prefs.getCharPref("autostart_detection") == "autostart_crude") {
					//Auto-start
					if (prefs.getBoolPref("auto_receive") && !SyncPlaces.anySPDialogs()) {
						prefs.setBoolPref("send_safe", true);
						prefs.setBoolPref("cache", true);
						prefs.setBoolPref("cache_pwd", true);
						prefs.setBoolPref("merge", true);
						prefs.setBoolPref("merge_pwd", true);
						prefs.setBoolPref("startAutoSend", true);
						window.openDialog('chrome://syncplaces/content/transfer.xul', '_blank',
															'chrome,resizable,centerscreen', null);
					}
				}

				//Automation
				SyncPlacesListener.init();

				//Listen for bookmark changes
				PlacesUtils.bookmarks.addObserver(SyncPlacesListener, false);
			}
		}
	}
};

window.addEventListener("load", SyncPlaces.initialiseSP, false);
