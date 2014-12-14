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

var SyncPlacesReceive = {
	jsonReceivedFile: "syncplaces_received.json",
	xbelReceivedFile: "syncplaces_received.xml",
	bmsHash: null,
	pwdHash: null,
	Cc: Components.classes,
	Ci: Components.interfaces,

	//Launch the transfer dialog to receive from server from menu/button
	menuReceive: function(merge) {
		SyncPlacesOptions.prefs.setBoolPref("send_safe", false);
		SyncPlacesOptions.prefs.setBoolPref("cache", merge);
		SyncPlacesOptions.prefs.setBoolPref("cache_pwd", merge);
		SyncPlacesOptions.prefs.setBoolPref("merge", merge);
		SyncPlacesOptions.prefs.setBoolPref("merge_pwd", merge);
		SyncPlacesOptions.prefs.setBoolPref("startManualReceive", true);
		window.openDialog('chrome://syncplaces/content/transfer.xul', '_blank',
											'chrome,resizable,modal,centerscreen', null);
	},

	//Receive from actions.xul
	manualReceive: function(merge) {
		this.menuReceive(merge);
		SyncPlacesOptions.lastTransferTimes();
	},

	//Receive from server, taking a backup first
	receive: function(startupShutdown, sendSafe) {
		SyncPlaces.timedStatus('in_progress', false, false);

		//Receive passwords first
		//This will go on to receive the additional passwords+hash+bookmarks later
		if (SyncPlacesOptions.prefs.getBoolPref("sync_passwords")) {
			if (SyncPlacesOptions.prefs.getBoolPref("cache_pwd"))
				this.receivePwdHash(startupShutdown, sendSafe);
			else {
				this.pwdHash = null;
				this.receivePasswords(startupShutdown, sendSafe, false);
			}
		}
		//Receive hash before bookmarks
		//if okay this will go on to receive bookmarks as well
		else if (SyncPlacesOptions.prefs.getBoolPref("cache"))
			this.receiveHash(startupShutdown, sendSafe);
		else {
			this.bmsHash = null;
			this.receiveSyncFile(startupShutdown, sendSafe, false);
			}
	},

	//Receive the password hash
	receivePwdHash: function(startupShutdown, sendSafe) {
		//Get the URL to receive from
		var uri = SyncPlaces.getURI(SyncPlaces.PWD_HASH, false);
		if (!uri) {
			SyncPlaces.timedStatus('missing_path', false, true);
			return;
		}
		var fulluri = SyncPlaces.getURI(SyncPlaces.PWD_HASH, true);

		//Start receive from server (asynchronous)
		try {
			SyncPlacesComms.init(false, uri, fulluri, null, SyncPlaces.PWD_HASH,
													 SyncPlacesReceive.receivePwdHashCallBack,
													 startupShutdown, sendSafe, false);

		} catch (exception) {
			SyncPlacesOptions.alert2(exception, 'cant_receive_hash', null, false);
		}
	},

	//Let them know it's done
	receivePwdHashCallBack: function(data, channel, startupShutdown,
																	 sendSafe, ignoreMe, type)
	{
		//Check it worked
		var resCode = SyncPlacesReceive.successfulReceive(data, channel,
																										  startupShutdown,
																						 					true, type);
		if (resCode == 0) return;

		//If no hash then it's probably because it hasn't been sent yet
		if (resCode == 404 || !data || SyncPlacesOptions.trim(data) == "") {
			//If no hash then get Passwords anyway
			//but tell it to send the hash after it's done
			SyncPlacesReceive.pwdHash = null;
			SyncPlacesReceive.receivePasswords(startupShutdown, sendSafe, true);
			return;
		}

		//Read in the local copy of the remote hash to compare
		var receivedHash = SyncPlacesOptions.prefs.getCharPref("receivePwdHash");

		//Up to date
		if (data == receivedHash) {
			//Receive hash before bookmarks
			//if okay this will go on to receive bookmarks as well
			if (SyncPlacesOptions.prefs.getBoolPref("cache"))
				SyncPlacesReceive.receiveHash(startupShutdown, sendSafe);
			else {
				SyncPlacesReceive.bmsHash = null;
				SyncPlacesReceive.receiveSyncFile(startupShutdown, sendSafe, false);
			}
		}
		//Receive the passwords
		else {
			SyncPlacesReceive.pwdHash = data;	//Store for later comparison
			SyncPlacesReceive.receivePasswords(startupShutdown, sendSafe, false);
		}
	},

	//Receive the passwords
	receivePasswords: function(startupShutdown, sendSafe, doHash) {
		//Has password been set
		if (!SyncPlacesOptions.getPassword(SyncPlacesOptions.passwordUser, false))
		{
			SyncPlaces.timedStatus('missing_ppassword', false, true);
			SyncPlacesOptions.alert2(null, 'missing_ppassword', null, false,
						"http://www.andyhalford.com/syncplaces/advanced.html#encryption");
			return;
		}

		//Get the URL to send to
		var uri = SyncPlaces.getURI(SyncPlaces.PWD, false);
		if (!uri) {
			SyncPlaces.timedStatus('missing_path', false, true);
			return;
		}
		var fulluri = SyncPlaces.getURI(SyncPlaces.PWD, true);

		//Always backup passwords first
		if (SyncPlacesPasswords.savePasswords()) {
			//Start receive from server (asynchronous)
			try {
				SyncPlacesComms.init(false, uri, fulluri, null, SyncPlaces.PWD,
														 this.receivePasswordCallBack, startupShutdown,
														 sendSafe, doHash);

			} catch (exception) {
				SyncPlacesOptions.alert2(exception, 'cant_receive_passwords', null,
																 false);
			}
		}
	},

	//Let them know it's done
	receivePasswordCallBack: function(data, channel, startupShutdown,
																		sendSafe, doHash, type)
	{
		//Check it worked
		var resCode = SyncPlacesReceive.successfulReceive(data, channel,
																										  startupShutdown,
																						 					sendSafe, type);
		if (resCode == 0) return;

		if (resCode == 404 || !data || SyncPlacesOptions.trim(data) == "") {
			//If no SyncFile and sendSafe kicked this off
			//it's probably because it hasn't been sent yet, so ignore
			if (sendSafe) {
				//Receive hash before bookmarks
				//if okay this will go on to receive bookmarks as well
				if (SyncPlacesOptions.prefs.getBoolPref("cache"))
					SyncPlacesReceive.receiveHash(startupShutdown, sendSafe);
				else {
					SyncPlacesReceive.bmsHash = null;
					SyncPlacesReceive.receiveSyncFile(startupShutdown, sendSafe, false);
				}
			}
			//Normal receive with no data
			else {
				SyncPlaces.timedStatus('no_file_found', false, true);
			}
			return;
		}

		//Decrypt
		SyncPlaces.timedStatus('decrypting_passwords', false, false);
		var main = SyncPlacesReceive.Cc["@mozilla.org/thread-manager;1"]
														.getService(SyncPlacesReceive.Ci.nsIThreadManager)
														.mainThread;
		main.dispatch(new SyncPlacesDecryptThread(data, SyncPlaces.PWD,
									startupShutdown, sendSafe, doHash), main.DISPATCH_NORMAL);
	},

	retrievePasswords: function(passwords, startupShutdown, sendSafe, doHash) {
		SyncPlaces.timedStatus('updating_passwords', false, false);

		//Check they have been received correctly
		var hash = SyncPlaces.computeHash(passwords);
		if (this.pwdHash && this.pwdHash != hash) {
			SyncPlacesOptions.alert2(null, 'invalid_passwords', null, false,
									"http://www.andyhalford.com/syncplaces/support.html#receiving");
			return;
		}

		//If can't process passwords, then stop here
		if (SyncPlacesPasswords.processPasswords(passwords)) {
			//Hash and cache
			//(even if not got option turned on for potential future use)
			//Note cache what's received and not what's merged
			//(see done.txt for bookmarks use of hash)
			try {
				//Save, so don't receive unnecc. next time
				SyncPlacesOptions.prefs.setCharPref("receivePwdHash", hash);

				//If no hash received then send it (and nothing else)
				if (doHash) {
					SyncPlacesSend.sendPwdHash(false, startupShutdown, true);
					return;
				}

			} catch (exception) {
				SyncPlacesOptions.alert2(exception, 'cant_save_cache', null, false);
				return;
			}

			//Receive hash before bookmarks
			//if okay this will go on to receive bookmarks as well
			if (SyncPlacesOptions.prefs.getBoolPref("cache"))
				this.receiveHash(startupShutdown, sendSafe);
			else {
				this.bmsHash = null;
				this.receiveSyncFile(startupShutdown, sendSafe, false);
			}
		}
	},

	//Receive the hash
	receiveHash: function(startupShutdown, sendSafe) {
		//Get the URL to receive from
		var uri = SyncPlaces.getURI(SyncPlaces.HASH, false);
		if (!uri) {
			SyncPlaces.timedStatus('missing_path', false, true);
			return;
		}
		var fulluri = SyncPlaces.getURI(SyncPlaces.HASH, true);

		//Start receive from server (asynchronous)
		try {
			SyncPlacesComms.init(false, uri, fulluri, null, SyncPlaces.HASH,
													 this.receiveHashCallBack, startupShutdown,
													 sendSafe, false);

		} catch (exception) {
			SyncPlacesOptions.alert2(exception, 'cant_receive_hash', null, false);
		}
	},

	//Let them know it's done
	receiveHashCallBack: function(data, channel, startupShutdown, sendSafe,
															  ignoreMe, type)
	{
		//Check it worked
		var resCode = SyncPlacesReceive.successfulReceive(data, channel,
																										  startupShutdown,
																						 					true, type);
		if (resCode == 0) return;

		//If no hash then it's probably because it hasn't been sent yet
		if (resCode == 404 || !data || SyncPlacesOptions.trim(data) == "") {
			//If no hash then get SyncFile anyway,
			//but tell it to send the hash after it's done
			SyncPlacesReceive.bmsHash = null;
			SyncPlacesReceive.receiveSyncFile(startupShutdown, sendSafe, true);
			return;
		}

		//Read in the local copy of the remote hash to compare
		var receivedHash = SyncPlacesOptions.prefs.getCharPref("receiveHash");

		//Up to date
		if (data == receivedHash) {
			//Save the timestamp for merge processing - no, just record physical receives
//			SyncPlacesOptions.prefs.setCharPref("lastReceived", new Date().getTime() * 1000);

			//If send-safe kicked off this receive then do the send()
			if (sendSafe) {
				SyncPlacesSend.send(startupShutdown, false);
				return;
			}

			SyncPlaces.timedStatus('nothing_to_do', false, false);
			SyncPlacesNetworking.closeSPDialog();
		}
		//Receive the bookmarks
		else {
			SyncPlacesReceive.bmsHash = data;	//Store for later comparison
			SyncPlacesReceive.receiveSyncFile(startupShutdown, sendSafe, false);
		}
	},

	//Return true if successful or ignore404 and "404" was sent back
	successfulReceive: function(data, channel, startupShutdown, ignore404, type)
	{
		var resCode = 200;
		var protocol = SyncPlacesOptions.prefs.getCharPref("protocol");
		var ftpOrFile = (protocol == "ftp") || (protocol == "file");

		//Did the connection fail?
		if (!channel) {
			if (SyncPlaces.displayError(data, ftpOrFile && ignore404))
				return 0;
			else
				resCode = 404;
		}

		//Check the http response code
		if (!ftpOrFile) {
			try {
				resCode = channel.QueryInterface(this.Ci.nsIHttpChannel)
												 .responseStatus;
				if (resCode != 200) {
					var errorMessage = null;
					switch(resCode) {
						case 401:
							errorMessage = 'unauthorised';
							break;
						case 404:
							if (!ignore404)	errorMessage = 'no_file_found';
							break;
						case 407:
							errorMessage = 'proxy_unauthorised';
							break;
						case 502:
							errorMessage = 'bad_gateway';
							break;
						default:
							errorMessage = 'no_file_found';
							SyncPlacesOptions.alert2(null, errorMessage, resCode, false,
									"http://www.andyhalford.com/syncplaces/support.html#receiving");
							break;
					}
					//If error then abort
					if (errorMessage) {
						SyncPlaces.displayWebPage(data, startupShutdown);
						SyncPlaces.timedStatus(errorMessage, false, true);
						resCode = 0;
					}
				}

			} catch(e) {
				SyncPlacesOptions.alert2(e, 'error_receiving', null, false);
				resCode = 0;
			}
		}
		//For FTP some proxy servers (eg Microsoft's)
		//may send back a web page when can't get through
		else if (data && resCode != 404 &&
						 SyncPlacesOptions.trim(data).length > 0 &&
						 SyncPlacesOptions.trim(data).charAt(0) == '<' &&
						 !data.match(/<xbel/))
		{
			SyncPlaces.displayWebPage(data, startupShutdown);
			SyncPlaces.timedStatus('bad_gateway', false, true);
			resCode = 0;
		}
		return resCode;
	},

	receiveSyncFile: function(startupShutdown, sendSafe, doHash) {
		//What type?
		var type = SyncPlacesOptions.prefs.getCharPref("sync_type") == 'sync_json'
										? SyncPlaces.JSON : SyncPlaces.XBEL;

		//Get the URL to receive from
		var uri = SyncPlaces.getURI(type, false);
		if (!uri) {
			SyncPlaces.timedStatus('missing_path', false, true);
			return;
		}
		var fulluri = SyncPlaces.getURI(type, true);

		//Always backup using JSON even if syncing on XBEL
		//Ensure you take a full backup
		if (!SyncPlaces.saveBookmarks(false, SyncPlaces.JSON, false, null))
			return;

		//Start receive from server (asynchronous)
		try {
			SyncPlacesComms.init(false, uri, fulluri, null, type,
													 this.receiveSyncFileCallBack,
													 startupShutdown, sendSafe, doHash);

		} catch (exception) {
			SyncPlacesOptions.alert2(exception, 'cant_receive_bookmarks', null,
															false);
		}
	},

	receiveSyncFileCallBack: function(data, channel, startupShutdown, sendSafe,
																		doHash, type)
	{
		//Check it worked
		var resCode = SyncPlacesReceive.successfulReceive(data, channel,
																										  startupShutdown,
																						 					sendSafe, type);
		if (resCode == 0) return;

		if (resCode == 404 || !data || SyncPlacesOptions.trim(data) == "") {
			//If no SyncFile and sendSafe kicked this off
			//it's probably because it hasn't been sent yet, so ignore
			if (sendSafe) {
				SyncPlacesSend.send(startupShutdown, false);
			}
			//Normal receive with no data
			else {
				SyncPlaces.timedStatus('no_file_found', false, true);
			}
			return;
		}

		//What type?
		var json = SyncPlacesOptions.prefs.getCharPref("sync_type") == 'sync_json';

		//Decrypt
		if (SyncPlacesOptions.prefs.getBoolPref("encrypt") && json &&
				SyncPlacesOptions.getPassword(SyncPlacesOptions.passwordUser, false, null, 'receive'))
		{
			SyncPlaces.timedStatus('decrypting_bookmarks', false, false);
			var main = SyncPlacesReceive.Cc["@mozilla.org/thread-manager;1"]
														.getService(SyncPlacesReceive.Ci.nsIThreadManager)
														.mainThread;
			main.dispatch(new SyncPlacesDecryptThread(data, json, startupShutdown,
										sendSafe, doHash), main.DISPATCH_NORMAL);
		}
		else {
			SyncPlacesReceive.completeTheRestore(data, json, startupShutdown,
																					 sendSafe, doHash);
		}
	},

	completeTheRestore: function(data, json, startupShutdown, sendSafe, doHash) {
		SyncPlaces.timedStatus('restoring_bookmarks', false, false);

		//Save the data to local file
		try {
			SyncPlacesIO.saveFile(((json ? this.jsonReceivedFile :
																		this.xbelReceivedFile)),	data);

		} catch (exception) {
			SyncPlacesOptions.alert2(exception, 'cant_save_bookmarks', null, false);
			return;
		}

		//XBEL Sync
		var xbelFilePath = null;
		if (!json) {
			var xbelFilePath = SyncPlacesIO.getDefaultFolder();
			xbelFilePath.append(this.xbelReceivedFile);
		}

		//Check they have been received correctly
		var hash = SyncPlaces.computeHash(data);
		if (this.bmsHash && this.bmsHash != hash) {
			SyncPlacesOptions.alert2(null, 'invalid_bookmarks', null, false,
									"http://www.andyhalford.com/syncplaces/support.html#receiving");
			return;
		}

		//Restore the bookmarks
		if (SyncPlaces.restoreBookmarks((json ? this.jsonReceivedFile :
																						SyncPlaces.xbelJsonFile),
																		xbelFilePath, false, false))
		{
			SyncPlaces.timedStatus('received_bookmarks', false, false);

			//Sort after receive
			if (SyncPlacesOptions.prefs.getBoolPref("auto_sort")) {
				try {
					SortPlacesSort.sortBookmarks(false);
				} catch(e) {
				}
			}

			//If successful receive then save the timestamp for merge processing
			SyncPlacesOptions.prefs.setCharPref("lastReceived", new Date().getTime() * 1000);

			//Hash and cache
			//(even if not got option turned on for potential future use)
			//Note cache what's received and not what's merged (see done.txt)
			try {
				//Save, so don't receive unnecc. next time
				SyncPlacesOptions.prefs.setCharPref("receiveHash", hash);

				//If no hash received then send it (and nothing else)
				if (doHash) {
					SyncPlacesSend.sendHash(sendSafe, startupShutdown, true);
					return;
				}

			} catch (exception) {
				SyncPlacesOptions.alert2(exception, 'cant_save_cache', null, false);
				return;
			}

			//If send-safe kicked off this receive then now do the send()
			if (sendSafe) {
				SyncPlacesSend.send(startupShutdown, false);
				return;
			}
			SyncPlacesNetworking.closeSPDialog();
		}
	}
};
