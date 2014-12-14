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

var SyncPlacesSend = {
	jsonSendFile: "syncplaces_send.json",
	htmlSendFile: "syncplaces_send.html",
	xbelSendFile: "syncplaces_send.xml",
	bmsHash: null,
	pwdHash: null,
	Cc: Components.classes,
	Ci: Components.interfaces,

	//Do sync from actions.xul
	manualSync: function() {
		SyncPlacesOptions.prefs.setBoolPref("send_safe", true);
		SyncPlacesOptions.prefs.setBoolPref("cache", true);
		SyncPlacesOptions.prefs.setBoolPref("cache_pwd", true);
		SyncPlacesOptions.prefs.setBoolPref("merge", true);
		SyncPlacesOptions.prefs.setBoolPref("merge_pwd", true);
		SyncPlacesOptions.prefs.setBoolPref("startManualSend", true);
		window.openDialog('chrome://syncplaces/content/transfer.xul', '_blank', 'chrome,resizable,modal,centerscreen', null);
		SyncPlacesOptions.lastTransferTimes();
	},

	//Launch the transfer dialog to send to server
	manualSend: function(changes) {
		SyncPlacesOptions.prefs.setBoolPref("send_safe", false);
		SyncPlacesOptions.prefs.setBoolPref("cache", changes);
		SyncPlacesOptions.prefs.setBoolPref("cache_pwd", changes);
		SyncPlacesOptions.prefs.setBoolPref("startManualSend", true);
		window.openDialog('chrome://syncplaces/content/transfer.xul', '_blank', 'chrome,resizable,modal,centerscreen', null);
		SyncPlacesOptions.lastTransferTimes();
	},

	//Send to server, taking a local backup first
	send: function(startupShutdown, checkSendSafe) {
		//If sending safely then do a receive first
		if (checkSendSafe && SyncPlacesOptions.prefs.getBoolPref("send_safe")) {
			//Check to see if last_send is blank - if so then warning
			if (SyncPlacesOptions.prefs.getCharPref("lastSend") != 0 ||
					SyncPlacesOptions.alert2(null, 'first_time', null, false,
						"http://www.andyhalford.com/syncplaces/use.html#tips", true))
			{
			SyncPlacesReceive.receive(startupShutdown, checkSendSafe);
			}
			else {
				SyncPlacesNetworking.closeSPDialog();
			}
			return;
		}

		//if sending passwords then send them first
		if (SyncPlacesOptions.prefs.getBoolPref("sync_passwords")) {
			this.sendPasswords(startupShutdown);
		}
		//Else send JSON or XBEL format file
		else {
			this.sendSyncFile();
		}
	},

	sendPasswords: function(startupShutdown) {
		//Has password been set
		if (!SyncPlacesOptions.getPassword(SyncPlacesOptions.passwordUser, false)) {
			SyncPlaces.timedStatus('missing_ppassword', false, true);
			SyncPlacesOptions.alert2(null, 'missing_ppassword', null, false,
									"http://www.andyhalford.com/syncplaces/advanced.html#encryption");
			return;
		}

		//Get the passwords
		var passwords = SyncPlacesPasswords.getPasswords(true);
		if (!passwords) {
			return;
		}

		//Compare checksums to see if changes
		this.pwdHash = SyncPlaces.computeHash(passwords);
		if (SyncPlacesOptions.prefs.getBoolPref("cache_pwd")) {
			//If hash not changed then just send the bookmarks
			var sendHash = SyncPlacesOptions.prefs.getCharPref("sendPwdHash");
			if (this.pwdHash == sendHash) {
				this.sendSyncFile();
				return;
			}
		}

		//Encrypt
		SyncPlaces.timedStatus('encrypting_passwords', false, false);
		var main = this.Cc["@mozilla.org/thread-manager;1"].getService(this.Ci.nsIThreadManager).mainThread;
		main.dispatch(new SyncPlacesEncryptThread(SyncPlaces.PWD, passwords, this.sendPasswordsCallBack, startupShutdown), main.DISPATCH_NORMAL);
	},

	sendPasswordsCallBack: function(errorData, channel, startupShutdown, ignoreMe, ignoreMe2, type) {
		//Check it worked
		if (!SyncPlacesSend.successfulSend(errorData, channel, startupShutdown, type)) {
			return;
		}

		//Save the hashes for next time
		try {
			SyncPlacesOptions.prefs.setCharPref("sendPwdHash", SyncPlacesSend.pwdHash);
			SyncPlacesOptions.prefs.setCharPref("receivePwdHash", SyncPlacesSend.pwdHash);

		} catch (exception) {
			SyncPlacesOptions.alert2(exception, 'cant_save_cache', null, false);
			return;
		}

		//Only send hash to server if required to prevent comms issues
		//Updated to always send SHA-1 (see 5.0.0 notes)
		SyncPlacesSend.sendPwdHash(false, startupShutdown, false);
	},

	/*
	 * Send the pwd hash to the server
	 *
	 * @param sendSafe - if true then do a full send() afterwards
	 * but it should only possibly be true if sendSafe did a receive which then called this cos it was missing
	 */
	sendPwdHash: function(sendSafe, startupShutdown, onlySendHash) {
		//Overwrite any existing success message
		SyncPlaces.timedStatus('in_progress', false, false);

		//Read the hash file
		var hash = SyncPlacesOptions.prefs.getCharPref("receivePwdHash");
		if (!hash) return;

		//Get the URL to send to
		var uri = SyncPlaces.getURI(SyncPlaces.PWD_HASH, false);
		if (!uri) {
			SyncPlaces.timedStatus('missing_path', false, true);
			return;
		}
		var fulluri = SyncPlaces.getURI(SyncPlaces.PWD_HASH, true);

		//Start send to server (asynchronous)
		try {
			SyncPlacesComms.init(true, uri, fulluri, hash, SyncPlaces.PWD_HASH, this.sendPwdHashCallBack, startupShutdown, sendSafe, onlySendHash);

		} catch (exception) {
			SyncPlacesOptions.alert2(exception, 'cant_send_hash', null, false);
		}
	},

	sendPwdHashCallBack: function(errorData, channel, startupShutdown, sendSafe, onlySendHash, type) {
		//Check it worked
		if (!SyncPlacesSend.successfulSend(errorData, channel, startupShutdown, type)) {
			return;
		}

		//If receive kicked this off because hash was missing then carry on with the rest of the receive
		if (onlySendHash) {
			//Receive hash before bookmarks
			//if okay this will go on to receive bookmarks as well
			if (SyncPlacesOptions.prefs.getBoolPref("cache"))
				SyncPlacesReceive.receiveHash(startupShutdown, sendSafe);
			else {
				SyncPlacesReceive.bmsHash = null;
				SyncPlacesReceive.receiveSyncFile(startupShutdown, sendSafe, false);
			}
		}

		//Send JSON or XBEL format file
		else
			SyncPlacesSend.sendSyncFile();
	},

	sendSyncFile: function(startupShutdown) {
		SyncPlaces.timedStatus('in_progress', false, false);

		//Sort first?
		if (SyncPlacesOptions.prefs.getBoolPref("auto_sort")) {
			try {
				SortPlacesSort.sortBookmarks(false);
			} catch(e) {
			}
		}

		//What type?
		var json = SyncPlacesOptions.prefs.getCharPref("sync_type") == 'sync_json';

		var bookmarks = this.getBookmarks(json ? this.jsonSendFile : this.xbelSendFile, json ? SyncPlaces.JSON : SyncPlaces.XBEL)
		if (!bookmarks) {
			return;
		}

		//Compare with cached version
		this.bmsHash = SyncPlaces.computeHash(bookmarks);
		if (SyncPlacesOptions.prefs.getBoolPref("cache")) {
			var sendHash = SyncPlacesOptions.prefs.getCharPref("sendHash");
			if (this.bmsHash == sendHash) {
				SyncPlaces.timedStatus('nothing_to_do', false, false);
				//Save the timestamp for merge processing (no this is wrong)
//				SyncPlacesOptions.prefs.setCharPref("lastSend", new Date().getTime() * 1000);
				SyncPlacesNetworking.closeSPDialog();
				return;
			}
		}

		//Encrypt first
		if (SyncPlacesOptions.prefs.getBoolPref("encrypt") && json && SyncPlacesOptions.getPassword(SyncPlacesOptions.passwordUser, false, null, 'send')) {
			SyncPlaces.timedStatus('encrypting_bookmarks', false, false);
			var main = this.Cc["@mozilla.org/thread-manager;1"].getService(this.Ci.nsIThreadManager).mainThread;
			main.dispatch(new SyncPlacesEncryptThread(json ? SyncPlaces.JSON : SyncPlaces.XBEL, bookmarks, this.sendSyncFileCallBack, startupShutdown), main.DISPATCH_NORMAL);
		}
		else {
			this.sendData(json ? SyncPlaces.JSON : SyncPlaces.XBEL, bookmarks, this.sendSyncFileCallBack, startupShutdown);
		}
	},

	getBookmarks: function(sendFile, type) {
		//Create the backup file in the profile folder
		var sendFilePath = SyncPlaces.saveBookmarks(false, type, true, sendFile);
		if (!sendFilePath) return null;

		//Read the backup file
		var bookmarks = null;
		try {
			bookmarks = SyncPlacesIO.readFile(sendFilePath);

		} catch (exception) {
			SyncPlacesOptions.alert2(exception, 'cant_read_bookmarks', null, false);
		}
		return bookmarks;
	},

	sendData: function(type, data, callBack, startupShutdown) {
		//Get the URL to send to
		var uri = SyncPlaces.getURI(type, false);
		if (!uri) {
			SyncPlaces.timedStatus('missing_path', false, true);
			return;
		}
		var fulluri = SyncPlaces.getURI(type, true);

		//Start send to server (asynchronous)
		try {
			SyncPlacesComms.init(true, uri, fulluri, data, type, callBack, startupShutdown, false, false);

		} catch (exception) {
			SyncPlacesOptions.alert2(exception, (type == SyncPlaces.PWD ? 'cant_send_passwords' : 'cant_send_bookmarks'), null, false);
		}
		return;
	},

	//Let them know it's done
	sendSyncFileCallBack: function(errorData, channel, startupShutdown, ignoreMe, ignoreMe2, type) {
		//Check it worked
		if (!SyncPlacesSend.successfulSend(errorData, channel, startupShutdown, type)) {
			return;
		}

		//If successful send then save the timestamp for merge processing
		SyncPlacesOptions.prefs.setCharPref("lastSend", new Date().getTime() * 1000);

		//Take backup for merge processing
		SyncPlaces.saveBookmarks(false, SyncPlaces.JSON, true, SyncPlaces.mergeFile);

		//Save the hashes for next time
		try {
			SyncPlacesOptions.prefs.setCharPref("sendHash", SyncPlacesSend.bmsHash);
			SyncPlacesOptions.prefs.setCharPref("receiveHash", SyncPlacesSend.bmsHash);

		} catch (exception) {
			SyncPlacesOptions.alert2(exception, 'cant_save_cache', null, false);
			return;
		}

		//Only send hash to server if required to prevent comms issues
		//Updated to always send SHA-1 (see 5.0.0 notes)
		SyncPlacesSend.sendHash(false, startupShutdown, false);
	},

	successfulSend: function(errorData, channel, startupShutdown, type) {
		//Did the connection fail?
		if (channel == null) {
			SyncPlaces.displayError(errorData, false);
			return false;
		}

		//Check the http response code
		var success = true;
		var protocol = SyncPlacesOptions.prefs.getCharPref("protocol");
		if ((protocol != "ftp") && (protocol != "file")) {
			try {
				var resCode = channel.QueryInterface(this.Ci.nsIHttpChannel).responseStatus;
				success = false;
				switch(resCode) {
					case 200:
					case 204:
						var message = 'sent_bookmarks';
						if (type == SyncPlaces.PWD) message = 'sent_passwords';
						else if (type == SyncPlaces.HASH || type == SyncPlaces.PWD_HASH) message = 'sent_hash';
						SyncPlaces.timedStatus(message, false, false);
						success = true;
						break;
					case 201:
						var message = 'new_bookmarks';
						if (type == SyncPlaces.PWD) message = 'new_passwords';
						else if (type == SyncPlaces.HASH || type == SyncPlaces.PWD_HASH) message = 'new_hash';
						SyncPlaces.timedStatus(message, false, false);
						success = true;
						break;
					case 401:
						SyncPlaces.timedStatus('unauthorised', false, true);
						break;
					case 405:
						SyncPlaces.timedStatus('server_cant_accept', false, true);
						break;
					case 407:
						SyncPlaces.timedStatus('proxy_unauthorised', false, true);
						break;
					case 502:
						SyncPlaces.timedStatus('bad_gateway', false, true);
						break;
					default:
						var message = 'cant_send_bookmarks';
						if (type == SyncPlaces.PWD) message = 'cant_send_passwords';
						else if (type == SyncPlaces.HASH || type == SyncPlaces.PWD_HASH) message = 'cant_send_hash';
						SyncPlacesOptions.alert2(null, message, resCode, false,
									"http://www.andyhalford.com/syncplaces/support.html#sending");
						break;
				}
			} catch(exception) {
				SyncPlacesOptions.alert2(exception, 'error_sending', null, false);
				return false;
			}
		}
		//For FTP some proxy servers (eg Microsoft's) may send back a web page when can't get through
		else if (errorData && SyncPlacesOptions.trim(errorData).length > 0 && SyncPlacesOptions.trim(errorData).charAt(0) == '<') {
			SyncPlaces.timedStatus('bad_gateway', false, true);
			success = false;
		}
		else {
			SyncPlaces.timedStatus('sent_bookmarks', false, false);
			//NB Aways pretend it's bookmarks even if sending a hash otherwise user confused by messages
		}

		//If not successful then bail out
		if (!success) {
			SyncPlaces.displayWebPage(errorData, startupShutdown);
			return false;
		}

		return true;
	},

	/*
	 * Send the hash to the server
	 *
	 * @param sendSafe - if true then do a full send() afterwards
	 * but it should only possibly be true if sendSafe did a receive which then called this cos it was missing
	 */
	sendHash: function(sendSafe, startupShutdown, onlySendHash) {
		//Overwrite any existing success message
		SyncPlaces.timedStatus('in_progress', false, false);

		//Read the hash file
		var hash = SyncPlacesOptions.prefs.getCharPref("receiveHash");
		if (!hash) return;

		//Get the URL to send to
		var uri = SyncPlaces.getURI(SyncPlaces.HASH, false);
		if (!uri) {
			SyncPlaces.timedStatus('missing_path', false, true);
			return;
		}
		var fulluri = SyncPlaces.getURI(SyncPlaces.HASH, true);

		//Start send to server (asynchronous)
		try {
			SyncPlacesComms.init(true, uri, fulluri, hash, SyncPlaces.HASH, this.sendHashCallBack, startupShutdown, sendSafe, onlySendHash);

		} catch (exception) {
			SyncPlacesOptions.alert2(exception, 'cant_send_hash', null, false);
		}
	},

	sendHashCallBack: function(errorData, channel, startupShutdown, sendSafe, onlySendHash, type) {
		//Check it worked
		if (!SyncPlacesSend.successfulSend(errorData, channel, startupShutdown, type)) {
			return;
		}

		//If send-safe kicked off a receive that then sent the hash cos it was missing then get to here!
		//So now do the send from the top
		if (sendSafe) {
			SyncPlacesSend.send(startupShutdown, false);
			return;
		}

		//If sending html as well then send it now
		//This will check for and send XBEL if required
		if (!onlySendHash) {
			if (SyncPlacesOptions.prefs.getBoolPref("sendhtml")) {
				SyncPlacesSend.sendHTML(startupShutdown);
				return;
			}
			//If just sending XBEL then send it now
			else if (SyncPlacesOptions.prefs.getBoolPref("sendxbel") && SyncPlacesOptions.prefs.getCharPref("sync_type") == 'sync_json') {
				SyncPlacesSend.sendXBEL(startupShutdown);
				return;
			}
		}

		SyncPlacesNetworking.closeSPDialog();
	},

	sendHTML: function(startupShutdown) {
		SyncPlaces.timedStatus('in_progress', false, false);

		var bookmarks = this.getBookmarks(this.htmlSendFile, SyncPlaces.HTML)
		if (!bookmarks) {
			return;
		}

		this.sendData(SyncPlaces.HTML, bookmarks, this.sendHTMLCallBack, startupShutdown);
	},

	sendHTMLCallBack: function(errorData, channel, startupShutdown, ignoreMe, ignoreMe2, type) {
		//Check it worked
		if (!SyncPlacesSend.successfulSend(errorData, channel, startupShutdown, type)) {
			return;
		}

		//If sending XBEL then send it now
		if (SyncPlacesOptions.prefs.getBoolPref("sendxbel") && SyncPlacesOptions.prefs.getCharPref("sync_type") == 'sync_json') {
			SyncPlacesSend.sendXBEL(startupShutdown);
			return;
		}

		SyncPlacesNetworking.closeSPDialog();
	},

	sendXBEL: function(startupShutdown) {
		SyncPlaces.timedStatus('in_progress', false, false);

		var bookmarks = this.getBookmarks(this.xbelSendFile, SyncPlaces.XBEL)
		if (!bookmarks) {
			return;
		}

		this.sendData(SyncPlaces.XBEL, bookmarks, this.sendXBELCallBack, startupShutdown);
	},

	sendXBELCallBack: function(errorData, channel, startupShutdown, ignoreMe, ignoreMe2, type) {
		//Check it worked
		if (!SyncPlacesSend.successfulSend(errorData, channel, startupShutdown, type)) {
			return;
		}

		SyncPlacesNetworking.closeSPDialog();
	}
};

