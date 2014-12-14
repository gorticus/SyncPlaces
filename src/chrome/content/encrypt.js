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
 * Portions created by the Initial Developer are Copyright (C) 2008-2012
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

var SyncPlacesEncryptThread = function(type, data, callBack, startupShutdown) {
  this.type = type;
  this.data = data;
  this.callBack = callBack;
  this.startupShutdown = startupShutdown;
};

SyncPlacesEncryptThread.prototype = {
  run: function() {
    try {
    	this.data = SyncPlacesEncrypt(this.data, this.type);

			SyncPlaces.timedStatus('in_progress', false, false);
			SyncPlacesSend.sendData(this.type, this.data, this.callBack,
															this.startupShutdown);

    } catch(exception) {
			SyncPlacesNetworking.running = false;
      Components.utils.reportError(exception);
			SyncPlacesIO.log(exception);
    }
  },

  QueryInterface: function(iid) {
    if (iid.equals(Components.interfaces.nsIRunnable) ||
    		iid.equals(Components.interfaces.nsISupports))
    {
    	return this;
    }
    throw Components.results.NS_ERROR_NO_INTERFACE;
  }
};

function SyncPlacesEncrypt(data, type) {
	var result = "";
	//Be careful - assumes if encrypting json/xbel then must be sending
	var password = SyncPlacesOptions.getPassword(SyncPlacesOptions.passwordUser,
										false, null, (type == SyncPlaces.PWD ? null : 'send'));
	if (SyncPlacesOptions.prefs.getCharPref("encryption") == "AES") {
		var bits = 128;
		if (SyncPlacesOptions.prefs.getCharPref("bits") == 'b192') bits = 192;
		else if (SyncPlacesOptions.prefs.getCharPref("bits") == 'b256') bits = 256;

		result = SyncPlacesAES.AESEncryptCtr(data, password, bits);
	}
	else {
		//Prep the password first (must be at least 16 chars
		//and within ISO-8859-1 with Unicode code-point < 256)
		password = escape(password);
		while (password.length < 16) password += password;
		result = SyncPlacesEncryptUtils.encodeBase64(SyncPlacesTEA.TEAencrypt(data, password));
	}
	return result;
}

var SyncPlacesDecryptThread = function(data, type, startupShutdown, sendSafe,
																			 doHash)
{
  this.data = data;
  this.type = type;
  this.startupShutdown = startupShutdown;
  this.sendSafe = sendSafe;
  this.doHash = doHash;
};

SyncPlacesDecryptThread.prototype = {
  run: function() {
    try {
    	this.data = SyncPlacesDecrypt(this.data, this.type);

			if (this.type == SyncPlaces.PWD)
				SyncPlacesReceive.retrievePasswords(this.data, this.startupShutdown,
																						this.sendSafe, this.doHash);
			else
				SyncPlacesReceive.completeTheRestore(this.data, this.type,
																						 this.startupShutdown, this.sendSafe,
																						 this.doHash);

    } catch(exception) {
			SyncPlacesNetworking.running = false;
      Components.utils.reportError(exception);
			SyncPlacesIO.log(exception);
    }
  },

  QueryInterface: function(iid) {
    if (iid.equals(Components.interfaces.nsIRunnable) ||
    		iid.equals(Components.interfaces.nsISupports))
    {
    	return this;
    }
    throw Components.results.NS_ERROR_NO_INTERFACE;
  }
};

function SyncPlacesDecrypt(data, type) {
	var result = "";
	//Be careful - assumes if decrypting json then must be receiving
	var password = SyncPlacesOptions.getPassword(SyncPlacesOptions.passwordUser,
										false, null, (type == SyncPlaces.PWD ? null : 'receive'));
	if (SyncPlacesOptions.prefs.getCharPref("encryption") == "AES") {
		var bits = 128;
		if (SyncPlacesOptions.prefs.getCharPref("bits") == 'b192') bits = 192;
		else if (SyncPlacesOptions.prefs.getCharPref("bits") == 'b256') bits = 256;

		result = SyncPlacesAES.AESDecryptCtr(data, password, bits);
	}
	else {
		//Prep the password first (must be at least 16 chars
		//and within ISO-8859-1 with Unicode code-point < 256)
		password = escape(password);
		while (password.length < 16) password += password;
		result = SyncPlacesTEA.TEAdecrypt(SyncPlacesEncryptUtils.decodeBase64(data), password);
	}
	return result;
}
