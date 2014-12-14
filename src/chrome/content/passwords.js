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
 * Portions created by the Initial Developer are Copyright (C) 2008-2010
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

var SyncPlacesPasswords = {
	passwordsFile: "syncplaces_passwords",
	asterisks: "******",
	oldPassword: "",
	newPassword: "",
	passwordField: "",
	Cc: Components.classes,
	Ci: Components.interfaces,

	//Save passwords in local encrypted file
	savePasswords: function() {
		var success = true;
		var passwords = this.getPasswords();
		if (passwords) {
			window.setCursor("wait");

			if (!SyncPlacesOptions.getPassword(SyncPlacesOptions.passwordUser, false)) {
				SyncPlaces.timedStatus('missing_password', true, true);
				SyncPlacesOptions.alert2(null, 'missing_password', null, false,
						"http://www.andyhalford.com/syncplaces/advanced.html#encryption");
				success = false;
			}
			else {
				SyncPlaces.timedStatus('encrypting_passwords', true, false);
				try {
					passwords = SyncPlacesEncrypt(passwords, SyncPlaces.PWD);
					SyncPlacesIO.saveFile(this.passwordsFile, passwords);
					SyncPlaces.timedStatus('passwords_saved', true, false);

				} catch(exception) {
					SyncPlacesOptions.alert2(exception, 'cant_save_passwords', null, true);
					success = false;
				}
			}
			window.setCursor("auto");
		}
		return success;
	},

	//Convert all the passwords into a JSON file
	getPasswords: function(ignoreSyncPlaces) {
		var passwords = "";
		var nodes = {};
		var children = [];

		//Retrieve any securely stored password
		try {
			var loginManager = this.Cc["@mozilla.org/login-manager;1"]
														 .getService(this.Ci.nsILoginManager);

			//Retrieve all logins
			//(may prompt user for master password - once per session)
			var logins = loginManager.getAllLogins({});

			//Add each login to the array
			for (var i = 0; i < logins.length; i++) {
				var hostname = logins[i].hostname;
				if (!ignoreSyncPlaces || !hostname.match(/^chrome:\/\/syncplaces/)) {
					var child = {};
					child.hostname = hostname;
					child.formSubmitURL = logins[i].formSubmitURL;
					child.httpRealm = logins[i].httpRealm;
					child.username = logins[i].username;
					child.password = logins[i].password;
					child.usernameField = logins[i].usernameField;
					child.passwordField = logins[i].passwordField;
					children.push(child);
				}
			}

			//Disabled hosts
			var disabledHosts = loginManager.getAllDisabledHosts({});

			//Convert to JSON string
			nodes.children = children;
			nodes.disabledhosts = disabledHosts;
			passwords = PlacesUtils.toJSONString(nodes);

//TODO save the file for debugging
//SyncPlacesIO.saveFile("passwords.json", passwords);

		} catch (exception) {
			SyncPlacesOptions.alert2(exception, 'couldnt_retrieve_password', null, false);
		}

		return passwords;
	},

	//Restore passwords from local encrypted file (replacing all existing ones)
	restorePasswords: function() {
		window.setCursor("wait");
		try {
			var filePath = SyncPlacesIO.getDefaultFolder();
			filePath.append(this.passwordsFile);
			var passwords = SyncPlacesIO.readFile(filePath);

			if (!SyncPlacesOptions.getPassword(SyncPlacesOptions.passwordUser, false)) {
				SyncPlaces.timedStatus('missing_password', true, true);
				SyncPlacesOptions.alert2(null, 'missing_password', null, false,
						"http://www.andyhalford.com/syncplaces/advanced.html#encryption");
				return;
			}

			SyncPlaces.timedStatus('decrypting_passwords', true, false);
			passwords = SyncPlacesDecrypt(passwords, SyncPlaces.PWD);

//TODO save the file for debugging
//SyncPlacesIO.saveFile("passwords_restored.json", passwords);

			//Overwrite existing passwords
			SyncPlaces.timedStatus('updating_passwords', true, false);
			var stats = {};
			stats.pwadded = 0;
			this.updatePasswords(passwords, true, false, stats);
			SyncPlaces.timedStatus(null, true, false, stats);

			//Now apply any changed syncplaces passwords
			SyncPlacesOptions.displayPasswords();

		} catch(exception) {
			SyncPlacesOptions.alert2(exception, 'cant_restore_passwords', null, true);
		}
		window.setCursor("auto");
	},

	//Restore all the passwords from a JSON file received
	processPasswords: function(passwords) {

//TODO save the file for debugging
//SyncPlacesIO.saveFile("passwords_received.json", passwords);

		var overwrite = !SyncPlacesOptions.prefs.getBoolPref("merge_pwd");
		try {
			var stats = {};
			stats.pwadded = 0;
			this.updatePasswords(passwords, overwrite, true, stats);
			SyncPlaces.timedStatus(null, true, false, stats);

		} catch (exception) {
			SyncPlacesOptions.alert2(exception, 'cant_update_passwords', null, false);
			return false;
		}
		return true;
	},

	updatePasswords: function(passwords, overwrite, preserveSyncPlaces, stats) {
		//Process all the passwords received
		var loginManager = this.Cc["@mozilla.org/login-manager;1"]
													 .getService(this.Ci.nsILoginManager);
		var JSON = this.Cc["@mozilla.org/dom/json;1"].createInstance(this.Ci.nsIJSON);
		var nodes = JSON.decode(passwords);

		//Anything restored?
		if (!nodes) return;

		//Any disabled hosts to restore?
		if (nodes.disabledhosts && nodes.disabledhosts.length > 0) {
			//If overwriting, delete existing first
			if (overwrite) {
				var disabledHosts = loginManager.getAllDisabledHosts({});
				for (var i = 0; i < disabledHosts.length; i++) {
					var host = disabledHosts[i];
					loginManager.setLoginSavingEnabled(host, true);
				}
			}

			//Add the ones received
			var hosts = nodes.disabledhosts;
			for (var i = 0; i < hosts.length; i++) {
				var host = hosts[i];
				loginManager.setLoginSavingEnabled(host, false);
			}
		}

		//Any passwords to do?
		if (!nodes.children || nodes.children.length == 0) return true;

		//If overwriting, delete existing first
		if (overwrite) {
			//If not preserving syncplaces ones then delete them all
			if (!preserveSyncPlaces) {
				loginManager.removeAllLogins();
			}

			//Else delete them individually, apart from syncplaces ones
			else {
				var logins = loginManager.getAllLogins({});
				for (var i = 0; i < logins.length; i++) {
					if (!logins[i].hostname.match(/^chrome:\/\/syncplaces/)) {
						loginManager.removeLogin(logins[i]);
					}
				}
			}
		}

		//Merge each login
		var nsLoginInfo = new Components.Constructor(
											"@mozilla.org/login-manager/loginInfo;1",
											this.Ci.nsILoginInfo, "init");
		var children = nodes.children;
		for (var i = 0; i < children.length; i++) {
			var child = children[i];

			//If not overwriting then merge them
			var noMatch = true;
			if (!overwrite) {
				//Does it already exist?
				var logins = loginManager.findLogins({}, child.hostname,
																						 child.formSubmitURL,
																						 child.httpRealm);

				//Find user from returned array of nsILoginInfo objects
				for (var j = 0; j < logins.length; j++) {
					//If same apart from password ...
					if (logins[j].username == child.username &&
							logins[j].usernameField == child.usernameField &&
							logins[j].passwordField == child.passwordField) {

						//Found a match
						noMatch = false;

						//If different passwords then prompt
						if (logins[j].password != child.password) {
							var params = {inn:{hostname:child.hostname,
														formSubmitURL:child.formSubmitURL,
														httpRealm:child.httpRealm,
														username:child.username,
														usernameField:child.usernameField,
														passwordField:child.passwordField,
														newPassword:child.password,
														oldPassword:logins[j].password}, out:null};

							//If replace existing then remove the old one
							window.openDialog('chrome://syncplaces/content/passwords.xul',
																'_blank', 'chrome,resizable,modal,centerscreen',
																params)
							if (params.out && params.out.keepNew) {
								loginManager.removeLogin(logins[j]);
								noMatch = true;	//So the remote one gets added
							}
						}
						break;
					}
				}
			}

			//Add it if no match
			if (noMatch) {
				if (stats) stats.pwadded++;
				var loginInfo = new nsLoginInfo(child.hostname, child.formSubmitURL, child.httpRealm,
																				child.username, child.password, child.usernameField, child.passwordField);
				try {
					loginManager.addLogin(loginInfo);

				} catch (exception) {
					//Try the bogus formSubmitURL fix
					var fakeLoginInfo = new nsLoginInfo(child.hostname, "http://andyhalford", child.httpRealm,
																							child.username, child.password, child.usernameField, child.passwordField);

					try {
//alert("BOGUS: " + child.hostname + ":" + child.formSubmitURL + ":" + child.httpRealm + ":" + child.username + ":" + child.password + ":" + child.usernameField + ":" + child.passwordField);
						loginManager.addLogin(fakeLoginInfo);
						loginManager.modifyLogin(fakeLoginInfo, loginInfo);

					} catch (exception) {
						//If this doesn't work then the entry really is bogus - so drop it
//alert(child.hostname + ":" + child.formSubmitURL + ":" + child.httpRealm + ":" + child.username + ":" + child.password + ":" + child.usernameField + ":" + child.passwordField);
					}
				}
			}
		}
	},

	onPasswordsLoad: function() {
		var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
										.getService(Components.interfaces.nsIStringBundleService)
										.createBundle("chrome://syncplaces/locale/syncplaces.properties");
		document.documentElement.getButton("extra2").label = bundle.GetStringFromName('pw_show');
		if (window.arguments) {
			document.getElementById('hostname').value = window.arguments[0].inn.hostname;
			document.getElementById('formSubmitURL').value = window.arguments[0].inn.formSubmitURL;
			document.getElementById('httpRealm').value = window.arguments[0].inn.httpRealm;
			document.getElementById('usernameField').value = window.arguments[0].inn.usernameField;
			this.passwordField = window.arguments[0].inn.passwordField;
			document.getElementById('passwordField').value = this.passwordField ? this.asterisks : "";
			document.getElementById('username').value = window.arguments[0].inn.username;
			this.oldPassword = window.arguments[0].inn.oldPassword;
			document.getElementById('oldPassword').value = this.asterisks;
			this.newPassword = window.arguments[0].inn.newPassword;
			document.getElementById('newPassword').value = this.asterisks;
		}
	},

	acceptNew: function() {
		window.arguments[0].out = {keepNew:true};
	},

	//Show or hide the passwords in case someone is peeking
	togglePasswords: function() {
		var stringsBundle = document.getElementById("string-bundle");
		if (document.getElementById('oldPassword').value == this.asterisks) {
			document.getElementById('passwordField').value = this.passwordField;
			document.getElementById('oldPassword').value = this.oldPassword;
			document.getElementById('newPassword').value = this.newPassword;
			document.documentElement.getButton("extra2").label = bundle.GetStringFromName('pw_hide');
		}
		else {
			document.getElementById('passwordField').value = this.passwordField ? this.asterisks : "";
			document.getElementById('oldPassword').value = this.asterisks;
			document.getElementById('newPassword').value = this.asterisks;
			document.documentElement.getButton("extra2").label = bundle.GetStringFromName('pw_show');
		}
	}
};