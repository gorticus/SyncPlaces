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
 * Portions created by the Initial Developer are Copyright (C) 2009-2010
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

var SyncPlacesWizard = {
	prefs: Components.classes["@mozilla.org/preferences-service;1"]
									 .getService(Components.interfaces.nsIPrefService)
									 .getBranch("extensions.syncplaces."),

	//Save the results of the Wizard
	onWizardFinish: function() {
		this.prefs.setCharPref("protocol", document.getElementById("protocol").selectedItem.id);
		this.setComplex("host", SyncPlacesOptions.trim(document.getElementById("host").value));
		this.setComplex("userid", SyncPlacesOptions.trim(document.getElementById("userid").value));
		this.prefs.setCharPref("sync_type", document.getElementById("sync_type").selectedItem.id);
		this.setComplex("path", document.getElementById("jsonpath").value);
		this.setComplex("xbelpath", document.getElementById("xbelpath").value);
		this.prefs.setBoolPref("sync_passwords", document.getElementById("sync_passwords").selectedItem.id == "pwd_yes");
		this.setComplex("passwordpath", document.getElementById("passwordpath").value);
		this.prefs.setBoolPref("encrypt", document.getElementById("encrypt_json").selectedItem.id == "enc_yes");
		this.prefs.setBoolPref("gzip", document.getElementById("gzip").selectedItem.id == "gzip_yes");
		SyncPlacesOptions.savePasswords(false);
	},

	//Reset to defaults?
	//Set all the defaults for the wizard as well
	checkReset: function() {
		var reset = document.getElementById("reset").selectedItem.id;
		if (reset == 'reset_yes') {
			//Iterate over the prefs setting them back to defaults
			var prefList = this.prefs.getChildList("", {});
			for (var i = 0 ; i < prefList.length ; i++) {
				try {
					this.prefs.clearUserPref(prefList[i]);
				} catch(e) { //If already at default then this fails for some reason unknown to me
				}
			}
		}

		this.loadPrefs();
	},

	loadPrefs: function() {
		//protocolpg
		var radioItem = document.getElementById(this.prefs.getCharPref("protocol"));
		document.getElementById("protocol").selectedItem = radioItem;
		radioItem.selected;

		//hostpg
		document.getElementById("host").value = this.getComplex("host");

		//loginpg
		var userid = this.getComplex("userid");
		document.getElementById("userid").value = userid;
		document.getElementById("password").value = SyncPlacesOptions.getPassword(userid);

		//syncpg
		radioItem = document.getElementById(this.prefs.getCharPref("sync_type"));
		document.getElementById("sync_type").selectedItem = radioItem;
		radioItem.selected;

		//pathpg
		document.getElementById("jsonpath").value = this.getComplex("path");
		document.getElementById("xbelpath").value = this.getComplex("xbelpath");

		//encryptpg
		radioItem = document.getElementById(this.prefs.getBoolPref("encrypt") ? "enc_yes" : "enc_no");
		document.getElementById("encrypt_json").selectedItem = radioItem;
		radioItem.selected;

		//compresspg
		radioItem = document.getElementById(this.prefs.getBoolPref("gzip") ? "gzip_yes" : "gzip_no");
		document.getElementById("gzip").selectedItem = radioItem;
		radioItem.selected;

		//passwordspg
		radioItem = document.getElementById(this.prefs.getBoolPref("sync_passwords") ? "pwd_yes" : "pwd_no");
		document.getElementById("sync_passwords").selectedItem = radioItem;
		radioItem.selected;

		//passwordpg
		document.getElementById("passwordpath").value = this.getComplex("passwordpath");

		//enpwdpg
		document.getElementById("password_password").value = SyncPlacesOptions.getPassword(SyncPlacesOptions.passwordUser);
	},

	//Set unichar strings
	setComplex: function(name, value) {
		var str = Components.classes["@mozilla.org/supports-string;1"]
      									.createInstance(Components.interfaces.nsISupportsString);
		str.data = value;
		this.prefs.setComplexValue(name, Components.interfaces.nsISupportsString, str);
	},

	//Get unichar strings
	getComplex: function(name) {
		return this.prefs.getComplexValue(name, Components.interfaces.nsISupportsString);
	},

	checkProtocol: function() {
		var protocol = document.getElementById("protocol").selectedItem.id;
		document.getElementById("protocolpg").next="host";

		//No host required if file://
		if (protocol == 'file') {
			document.getElementById("protocolpg").next="sync";
		}
		//Prompt for login if ftp selected
		else if (protocol == 'ftp') {
			document.getElementById("hostpg").next="login";
		}
		else {
			document.getElementById("hostpg").next="sync";
		}
	},

	//Can advance
	//Also use this to test for the first page showing
	//And to set the initial values
	canAdvance: function(reset) {
		var wizard = document.getElementById('syncplacesWizard');
		wizard.canAdvance = true;

		if (reset) {
			this.loadPrefs();
			if (!this.prefs.getBoolPref('run_wizard'))
				wizard.goTo('protocol');
		}
	},

	//Check a host has been entered
	checkHost: function() {
		var host = SyncPlacesOptions.trim(document.getElementById("host").value);
		document.getElementById('syncplacesWizard').canAdvance = host;
	},

	//Set up the XBEL/JSON for the path page
	checkSync: function() {
		var json = (document.getElementById("sync_type").selectedItem.id == 'sync_json');
		document.getElementById("jsonpath").hidden = !json;
		document.getElementById("xbelpath").hidden = json;
		document.getElementById("pathpg").next = json ? "encrypt" : "passwords";
	},

	//Check a path value has been entered
	checkPathValue: function() {
		var pathId = (document.getElementById("sync_type").selectedItem.id == 'sync_json') ? "jsonpath" : "xbelpath";
		var path = SyncPlacesOptions.trim(document.getElementById(pathId).value);
		document.getElementById('syncplacesWizard').canAdvance = path;
	},

	//Check a path has been entered
	checkPath: function() {
		var pathId = (document.getElementById("sync_type").selectedItem.id == 'sync_json') ? "jsonpath" : "xbelpath";
		SyncPlacesOptions.checkPath(true, pathId);
		var path = SyncPlacesOptions.trim(document.getElementById(pathId).value);
		if (!path) {
			document.getElementById('syncplacesWizard').canAdvance = false;
			return false;
		}
		return true;
	},

	//Check if encryption chosen
	checkEncrypt: function() {
		if (document.getElementById('encrypt_json').selectedItem.id == "enc_yes") {
			document.getElementById("encryptpg").next="passwords";
		}
		else {
			document.getElementById("encryptpg").next="compress";
		}
	},

	//Are we syncing passwords?
	checkPasswords: function() {
		if (document.getElementById('sync_passwords').selectedItem.id == "pwd_yes") {
			document.getElementById("passwordspg").next= "password";
		}
		else {
			document.getElementById("passwordspg").next = "encpwd";
		}
	},

	//Check a path value has been entered
	checkPwdValue: function() {
		var path = SyncPlacesOptions.trim(document.getElementById("passwordpath").value);
		document.getElementById('syncplacesWizard').canAdvance = path;
	},

	checkPassword: function() {
		SyncPlacesOptions.checkPath(true, "passwordpath");
		var path = SyncPlacesOptions.trim(document.getElementById("passwordpath").value);
		if (!path) {
			document.getElementById('syncplacesWizard').canAdvance = false;
			return false;
		}
		return true;
	},

	//Check a password has been entered
	checkEncPwd: function() {
		var path = SyncPlacesOptions.trim(document.getElementById("password_password").value);
		document.getElementById('syncplacesWizard').canAdvance = path;
	}
}