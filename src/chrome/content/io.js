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

var SyncPlacesIO = {
	Cc: Components.classes,
	Ci: Components.interfaces,
	log: null,

	//Create URI from a string spec
	makeURI: function(uriString) {
		var ioService = this.Cc["@mozilla.org/network/io-service;1"]
												.getService(this.Ci.nsIIOService);
		return ioService.newURI(uriString, null, null);
	},

	//Default folder for storing files
	getDefaultFolder: function() {
		var userFolder;
		var defaultFolder = this.Cc["@mozilla.org/file/directory_service;1"]
														.getService(this.Ci.nsIProperties)
														.get("ProfD", this.Ci.nsIFile);
		try {
			userFolder = SyncPlacesOptions.prefs
																		.getComplexValue("backupfolder",
																										 this.Ci.nsILocalFile);

		} catch(exception) {
			userFolder = defaultFolder;
		}

		//Migrate settings into dedicated syncplaces folder
		try {
			if (userFolder.equals(defaultFolder)) {
				userFolder.append("syncplaces");
				//If exists check permissions (because I set it to 0600 in 3.0.1)
				if (userFolder.exists()) {
					if (userFolder.isDirectory()) {
						//448 == 0700 in octal
						if (!userFolder.isExecutable()) userFolder.permissions = 448;
					}
					//If file with this name then abort this whole idea
					else
						userFolder = defaultFolder;
				}
				//Create it and move all the files
				else {
					userFolder.create(this.Ci.nsILocalFile.DIRECTORY_TYPE, 0700);

					//Move all files starting with 'syncplaces' into new location
					var enumerator = defaultFolder.directoryEntries;
					while (enumerator.hasMoreElements()) {
						var file = enumerator.getNext().QueryInterface(this.Ci.nsIFile);
						if (file.leafName.match(/syncplaces./)) {
							file.moveTo(userFolder, null);
						}
					}
				}
			}
		} catch(exception) {
			SyncPlacesOptions.alert2(exception, null, null, false);
			userFolder = defaultFolder;
		}

		return userFolder;
	},

	//Read in a file's contents
	readFile: function(pathName) {
		if (!pathName.exists()) {
			throw Components.results.NS_ERROR_FILE_NOT_FOUND;
		}
		var fis = this.Cc["@mozilla.org/network/file-input-stream;1"]
									.createInstance(this.Ci.nsIFileInputStream);
		fis.init(pathName, -1, 0, 0);

		//Read in as UTF-8
		var is = this.Cc["@mozilla.org/intl/converter-input-stream;1"]
								 .createInstance(this.Ci.nsIConverterInputStream);
		is.init(fis, "UTF-8", 8192,
						this.Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
		var data = "";
		var str = {};
		while (is.readString(8192, str) != 0) {
			data += str.value;
		}

		is.close();
		fis.close();

		return data;
	},

	//Save string to a local file
	saveFile: function(fileToSave, data) {
		var filePath = this.getDefaultFolder();
		filePath.append(fileToSave);

		this.saveFilePath(filePath, data, false);
	},

	//Save string to a uniquely named local file using the suggested name
	saveUniqueFile: function(suggestedName, data) {
		var filePath = this.getDefaultFolder();
		filePath.append(suggestedName);

		return this.saveFilePath(filePath, data, true);
	},

	saveFilePath: function(filePath, data, unique, append) {
		//Create the output file
		if (unique) {
			filePath.createUnique(this.Ci.nsILocalFile.NORMAL_FILE_TYPE, 0600);
		}
		else if (!filePath.exists()) {
			filePath.create(this.Ci.nsILocalFile.NORMAL_FILE_TYPE, 0600);
		}

		//Save the data
		var fos = this.Cc["@mozilla.org/network/file-output-stream;1"]
									.createInstance(this.Ci.nsIFileOutputStream);
		//0x02 = open for writing, 0x08 = create if doesn't exist
		//0x10 = append
		//0x20 = overwrite if does exist
		//0666 = rw-rw-rw-
		if (append)
			fos.init(filePath, 0x02 | 0x08 | 0x10, 0666, 0);
		else
			fos.init(filePath, 0x02 | 0x08 | 0x20, 0666, 0);

		//In UTF-8
		var os = this.Cc["@mozilla.org/intl/converter-output-stream;1"]
								 .createInstance(this.Ci.nsIConverterOutputStream);
		os.init(fos, "UTF-8", 0, "?".charCodeAt(0));
		os.writeString(data);

		os.close();
		fos.close();

		return filePath.leafName;	//Return the real file path
	},

	//Get the last modified timestamp of a file and delete it
	lastModifiedAndDelete: function(fileName) {
		var lastModified = 0;
		try {
			var filePath = this.getDefaultFolder();
			filePath.append(fileName);
			if (filePath.exists()) {
				lastModified = filePath.lastModifiedTime;
				filePath.remove(false);
			}
		} catch(e) {
		}
		//Convert into microseconds to be compatible with PRTime
		return lastModified * 1000;
	},

	//Get the contents of a file and delete it
	contentsAndDelete: function(fileName) {
		var contents = "";
		try {
			var filePath = this.getDefaultFolder();
			filePath.append(fileName);
			if (filePath.exists()) {
				contents = this.readFile(filePath);
				filePath.remove(false);
			}
		} catch(e) {
		}
		return contents;
	},

	//Delete a file
	deleteFile: function(fileName) {
		try {
			var filePath = this.getDefaultFolder();
			filePath.append(fileName);
			if (filePath.exists()) filePath.remove(false);
		} catch(e) {
		}
	},

	//Folder check
	isFolder: function(fileName) {
		try {
			var file = this.Cc["@mozilla.org/file/local;1"]
										 .createInstance(this.Ci.nsILocalFile);
			file.initWithPath(fileName);
			return file.exists() && file.isDirectory();
		} catch(e) {
		}
		return false;
	},

	//Create a log for the current transaction
	createLog: function() {
		this.logFilePath = SyncPlacesIO.getDefaultFolder();
		this.logFilePath.append("logs");
		var nextLogNo = SyncPlacesOptions.prefs.getIntPref('next_log_no');

		//Delete any existing log with the same log number
/*		var files = this.logFilePath.directoryEntries;
		while(files.hasMoreElements()) {
			var entry = files.getNext();
			entry.QueryInterface(this.Ci.nsIFile);
			if (entry.leafName.indexOf("." + nextLogNo + ".log") != -1) {
				try {
					entry.remove(false);
				} catch(e) {
				}
				break;
			}
		} */

		//Now set the log for subsequent access and save the current timestamp to ensure old one overwritten
		this.logFilePath.append("log" + "." + nextLogNo + ".txt");
		this.saveFilePath(this.logFilePath, new Date().toLocaleString() + "\n");

		//Increment/Rollover and Save the next log number
		if (++nextLogNo > SyncPlacesOptions.prefs.getCharPref('max_log_no')) nextLogNo = 0;
		SyncPlacesOptions.prefs.setIntPref('next_log_no', nextLogNo);
	},

	//Append to the current log
	log: function(data) {
		if (!this.logFilePath) this.createLog();
		this.saveFilePath(this.logFilePath, new Date().toLocaleString() + " " + data + "\n", false, true);
	}
}
