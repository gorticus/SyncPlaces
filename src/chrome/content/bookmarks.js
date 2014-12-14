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

var SyncPlacesBookmarks = {
	SP_LOAD_IN_SIDEBAR_ANNO: "bookmarkProperties/loadInSidebar",
	SP_DESCRIPTION_ANNO: "bookmarkProperties/description",
	SP_READ_ONLY_ANNO: "placesInternal/READ_ONLY",
	SP_LMANNO_FEEDURI: "livemark/feedURI",
	SP_LMANNO_SITEURI: "livemark/siteURI",
	SP_LMANNO_EXPIRATION: "livemark/expiration",
	SP_LMANNO_LOADFAILED: "livemark/loadfailed",
	SP_LMANNO_LOADING: "livemark/loading",
	SP_EXCLUDE_FROM_BACKUP_ANNO: "places/excludeFromBackup",
	SP_DATE_ADDED_ANNO: "syncplaces/dateAdded",
	SP_TAG: "syncplaces/tag",
	faviconsFile: "syncplaces_favicons.json",
	oneDay: 24*60*60,
	Cc: Components.classes,
	Ci: Components.interfaces,
	QUERY: "query",
	FOLDER: "folder",
	SEPARATOR: "separator",
	BOOKMARK: "bookmark",
	LIVEMARK: "livemark",

	//Save bookmarks in JSON format in UTF-8 format
	backupJSON: function(backupFilePath, checkSubFolder, timeout) {
		function addTagAnnotation(syncFolderID) {
			//Retrieve just the folder you're syncing on
			var options = PlacesUtils.history.getNewQueryOptions();
			var query = PlacesUtils.history.getNewQuery();
			query.setFolders([syncFolderID], 1);
			var result = PlacesUtils.history.executeQuery(query, options).root;

			//Search for tags for each URI
			addTags(result);
		}

		//Run through the results looking for tags and adding an annotation
		function addTags(container) {
			function asContainer(container) {
				return container.QueryInterface(Components.interfaces
																						.nsINavHistoryContainerResultNode);
			}

			if (container.itemId != -1) {
				//Is it a real folder or a link?
				if (PlacesUtils.getConcreteItemId(container) != container.itemId) {
					addTagAnno(container);
					return;
				}
			}

			//Sometimes the container doesn't open (maybe it's not real)
			//In which case skip it
			asContainer(container).containerOpen = true;
			try {
				if (container.childCount > 0) var tested = true;
			} catch (e) {
					try {
						asContainer(container).containerOpen = false;
					} catch(e1) {
					}
					return;
			}

			//Recurse down the tree
			for (var i = 0; i < container.childCount; i++) {
				var child = container.getChild(i);

				if (true /* CW !PlacesUtils.nodeIsLivemarkContainer(child)*/) {
					if (PlacesUtils.nodeIsBookmark(child)) {
						addTagAnno(child);
					}
					else if (PlacesUtils.nodeIsFolder(child) /*&& !PlacesUtils.nodeIsLivemarkContainer(child)*/)
					{
						//Ignore the untitled internal stuff
						if (container.itemId == PlacesUtils.placesRootId && !child.title) {
							try {
								PlacesUtils.annotations
													 .getItemAnnotation(child.itemId,
													 										SyncPlacesBookmarks.SP_READ_ONLY_ANNO);
								continue;
							} catch (e) {
							}
						}
						addTags(child);
					}
				}
			}

			//Close the current container again when finished
			asContainer(container).containerOpen = false;
		}

		function addTagAnno(child) {
			var tags = PlacesUtils.tagging
														.getTagsForURI(SyncPlacesIO.makeURI(child.uri),
																					 {});
			var lastModified = child.lastModified;
			var count = 0;
			tags.forEach(function(tag) {
				PlacesUtils.annotations.setItemAnnotation(child.itemId,
													SyncPlacesBookmarks.SP_TAG + count, tag, 0,
													SyncPlacesBookmarks.Ci.nsIAnnotationService.EXPIRE_SESSION);
				count++;
			}, this);

			//Restore the lastModified date (adding annos changes it)
			if (count > 0 && lastModified)
				PlacesUtils.bookmarks.setItemLastModified(child.itemId, lastModified);
		}

		function removeTagAnnotation() {
			var count = 0;
			var lastModified;
			while (true) {
				var items = PlacesUtils.annotations
												.getItemsWithAnnotation(SyncPlacesBookmarks.SP_TAG + count, {});
				if (!items.length) break;
				for (var i = 0; i < items.length; i++) {
					lastModified = PlacesUtils.bookmarks.getItemLastModified(items[i]);
					PlacesUtils.annotations
										 .removeItemAnnotation(items[i], SyncPlacesBookmarks.SP_TAG + count);

					//Restore the lastModified date (removing annos changes it)
					if (lastModified) PlacesUtils.bookmarks.setItemLastModified(items[i], lastModified);
				}
				count++;
			}
		}

		//START HERE
		//Saving just Subfolder?
		var syncFolderID = PlacesUtils.placesRootId;
		if (checkSubFolder && !SyncPlacesOptions.prefs.getBoolPref("sendall")) {
			try {
				syncFolderID = SyncPlacesOptions.prefs.getIntPref("bookmarkFolderID");
				if (!syncFolderID || syncFolderID < 0) syncFolderID = PlacesUtils.placesRootId;

			} catch(exception) {
				syncFolderID = PlacesUtils.placesRootId;
			}
		}
		//If sync'ing on subfolder, check everything okay
		if (syncFolderID != PlacesUtils.placesRootId &&
				!this.checkSyncFolder(syncFolderID, timeout)) return false;

		//Write out as UTF-8
		var fos = this.Cc["@mozilla.org/network/file-output-stream;1"]
									.createInstance(this.Ci.nsIFileOutputStream);
		fos.init(backupFilePath, 0x02 | 0x08 | 0x20, 0600, 0);
		var os = this.Cc["@mozilla.org/intl/converter-output-stream;1"]
								 .createInstance(this.Ci.nsIConverterOutputStream);
		os.init(fos, "UTF-8", 0, "?".charCodeAt(0));
		var converter = {
			nos: os,
			write: function(str, len) {
				this.nos.writeString(str);
			}
		};

		//Add temporary annotation to denote any tags (only if doing a subfolder)
		if (syncFolderID != PlacesUtils.placesRootId)
			addTagAnnotation(syncFolderID);

		try {
			//Retrieve all Places or just the folder you're syncing on
			var options = PlacesUtils.history.getNewQueryOptions();
			var query = PlacesUtils.history.getNewQuery();
			query.setFolders([syncFolderID], 1);
			var result = PlacesUtils.history.executeQuery(query, options).root;
			result.containerOpen = true;

			//Get itemIds to be exluded from the backup
			var excludeItems = PlacesUtils.annotations
                         .getItemsWithAnnotation(this.SP_EXCLUDE_FROM_BACKUP_ANNO, {});
			//Write out
			SyncPlacesUtils.serializeNodeAsJSONToOutputStream(result, converter, false, false, excludeItems);
			result.containerOpen = false;

		} finally {
			//Close streams
			os.close();
			fos.close();

			//Remove the tag annotation (only if doing a subfolder)
			if (syncFolderID != PlacesUtils.placesRootId) removeTagAnnotation();
		}
		return true;
	},

	checkSyncFolder: function(syncFolderID, timeout) {
		//Does the folder still exist, and is of the right type?
		var type = null;
		try {
			type = PlacesUtils.bookmarks.getItemType(syncFolderID);

		} catch(exception) {
			SyncPlacesOptions.alert2(null, 'missing_subfolder', null, timeout,
				"http://www.andyhalford.com/syncplaces/options.html");
			return false;
		}

		//Type check
		if (type != PlacesUtils.bookmarks.TYPE_FOLDER) {
			SyncPlacesOptions.alert2(null, 'wrong_type_subfolder', null, timeout,
				"http://www.andyhalford.com/syncplaces/options.html");
			return false;
		}
		return true;
	},

	//Is there a separator that would be next to this one if we were to add it
	//If so then dont add it
	existingSeparator: function(container, index, node, mergeDeletes,
															lastSend, receivedIds, useTimestamps,
															oldNodes, missingNodes)
	{
		var existingID = -1;
		try {
			existingID = PlacesUtils.bookmarks.getIdForItemAt(container, index);

		} catch(exception) {
			//if index out of range
		}

		//If something there and it's a separator then don't add received one
		if (existingID != -1 && PlacesUtils.bookmarks.getItemType(existingID) ==
						 PlacesUtils.bookmarks.TYPE_SEPARATOR)
		{
			receivedIds.push(existingID);
			return true;
		}
		//If nothing there (ie folder is empty) or it's not a separator
		//Check to see if it has been deleted since last send
		else if (mergeDeletes) {
			if (useTimestamps)
				return this.deletedLocally(lastSend, node);
			else {
				return SyncPlacesMerge.deletedSeparator(oldNodes, missingNodes, index);
			}
		}

		return false;
	},

	//Does livemark already exist?
	existingLivemark: function(container, title, feedURI) {
		var options = PlacesUtils.history.getNewQueryOptions();
		var query = PlacesUtils.history.getNewQuery();
		query.setFolders([container], 1);
		var result = PlacesUtils.history.executeQuery(query, options).root;
		result.containerOpen = true;
		//Check all the kids for matches
		for (var i = 0; i < result.childCount; i++) {
			var child = result.getChild(i);
			var existingID = child.itemId;

			/*	CW
			if (PlacesUtils.livemarks.isLivemark(existingID)) {
				if ( this.sameValue(title, child.title, false) &&
						 this.sameValue(feedURI,
						 								PlacesUtils.livemarks.getFeedURI(existingID),
						 								true) )
				{
					result.containerOpen = false;
					return existingID;
				}
			}
			*/
		}
		result.containerOpen = false;
		return null;
	},

	//Match folders on parent and title
	//(if more then one matching then match on index)
	existingFolder: function(container, node, index, mergeComparison, debug) {
		//Look for folder(s) with the same parent and the same title
		var options = PlacesUtils.history.getNewQueryOptions();
		options.excludeItems = true;		//folders only
		options.excludeQueries = true;	//folders only
		var query = PlacesUtils.history.getNewQuery();
		query.setFolders([container], 1);
		var result = PlacesUtils.history.executeQuery(query, options).root;
		result.containerOpen = true;
		//Check all the kids for matches
		var count = 0;
		var existingID = -1;
		for (var i = 0; i < result.childCount; i++) {
			var child = result.getChild(i);
// CW			if (PlacesUtils.nodeIsLivemarkContainer(child)) continue;
			var folderID = child.itemId;
			if (this.sameValue(node.title,
												 PlacesUtils.bookmarks.getItemTitle(folderID),
												 false)) {
				count++;
				//If more than one folder with the same title, then compare indexes
				if (count > 1) {
					result.containerOpen = false;
					return this.matchOnIndex(container, node, index, mergeComparison, debug);
				}
				existingID = folderID;
			}
		}
		result.containerOpen = false;

		//Update the description if already exists & change the index if necc.
		if (existingID != -1) {
			this.duplicateFolder(node, existingID, mergeComparison, index, debug);
		}

		return existingID;
	},

	matchOnIndex: function(container, node, index, mergeComparison, debug) {
		//Look at the place you're thinking of adding it
		var existingID = -1;
		try {
			existingID = PlacesUtils.bookmarks.getIdForItemAt(container, index);

		} catch(exception) {
			//if index is too big!
		}
		if (existingID != -1 && this.sameValue(node.title,
				PlacesUtils.bookmarks.getItemTitle(existingID), false) &&
				(PlacesUtils.bookmarks.getItemType(existingID) ==
				PlacesUtils.bookmarks.TYPE_FOLDER) 
// CW				&& !PlacesUtils.livemarks.isLivemark(existingID)
				)
		{
			//Use the appropriate description and index
			this.duplicateFolder(node, existingID, mergeComparison, index, debug);
			return existingID;
		}
		return -1;
	},

	//When the received folder already exists ...
	duplicateFolder: function(node, existingID, mergeComparison, index, debug) {
		var lastModified = node.lastModified;
		if (!lastModified) lastModified = node.dateAdded;

		if (mergeComparison == "timestamps") {
			var existingDate = PlacesUtils.bookmarks.getItemLastModified(existingID);
			if (!existingDate) existingDate = PlacesUtils.bookmarks.getItemDateAdded(existingID);

			//Update the existing if older first
			if (existingDate < lastModified) {
				//Set the description, date and index to be the remote's
				this.setDescription(existingID, node, lastModified);
				try {
					PlacesUtils.bookmarks.setItemIndex(existingID, index);
				} catch(e) {
					if (debug) SyncPlacesIO.log("WARNING A: Failed to set index for " + existingID + " to " + index);
				}
			}
			//If same age then use the remote's index and description
			//cos lastModified doesn't get updated
			else if (existingDate == lastModified) {
				this.setDescription(existingID, node, lastModified);
 				if (index != PlacesUtils.bookmarks.getItemIndex(existingID)) {
					try {
						PlacesUtils.bookmarks.setItemIndex(existingID, index);
					} catch(e) {
						if (debug) SyncPlacesIO.log("WARNING B: Failed to set index for " + existingID + " to " + index);
					}
				}
			}
		}
		else if (mergeComparison == "remote") {
			this.setDescription(existingID, node, lastModified);
		}
	},

	setDescription: function(existingID, node, lastModified) {
		var description = "";
		if (node.annos) {
			node.annos.forEach(function(anno) {
				if (anno.name == SyncPlacesBookmarks.SP_DESCRIPTION_ANNO) {
					description = anno.value;
				}
			});
		}
		if (description && description.length > 0) {
			PlacesUtils.annotations
								 .setItemAnnotation(existingID, this.SP_DESCRIPTION_ANNO,
										description, 0, PlacesUtils.annotations.EXPIRE_NEVER);
		}
		else {
			//Get rid of any existing blanks
			try {
				description = PlacesUtils.annotations.getItemAnnotation(existingID, this.SP_DESCRIPTION_ANNO);
			} catch (exception) {
			}
			if (description.length == 0) {
				PlacesUtils.annotations
									 .removeItemAnnotation(existingID, this.SP_DESCRIPTION_ANNO);
			}
		}

		//Set the date to remote whatever happens
		PlacesUtils.bookmarks.setItemLastModified(existingID, lastModified);
	},

	existingPlace: function(container, node) {
		var uri = SyncPlacesIO.makeURI(node.uri);
		var options = PlacesUtils.history.getNewQueryOptions();
		var query = PlacesUtils.history.getNewQuery();
		query.setFolders([container], 1);
		var result = PlacesUtils.history.executeQuery(query, options).root;

		result.containerOpen = true;
		//Check all the kids for matches
		for (var i = 0; i < result.childCount; i++) {
			var child = result.getChild(i);
			var existingID = child.itemId;
			//Ignore non-bookmarks
			if (PlacesUtils.nodeIsBookmark(child) || PlacesUtils.nodeIsQuery(child)) {
				var oldURI = PlacesUtils.bookmarks.getBookmarkURI(existingID);
				if (this.sameValue(uri, oldURI, true) && this.sameValue(node.title,
																																child.title,
																																false))
				{
					result.containerOpen = false;
					return existingID;
				}
			}
		}
		result.containerOpen = false;
		return null;
	},

	//Check two items are the same (either both null or both same value)
	sameValue: function(item1, item2, isURI) {
		if (isURI) {
			return ((!item1 && !item2) ||
							(item1 && item2 && item1.spec == item2.spec));
		}
		else {
			return ((!item1 && !item2) ||
							(item1 && item2 && item1 == item2));
		}
	},

	//When the received item already exists, delete it and return true
	dealWithDuplicates: function(existingID, mergeComparison, lastModified, index, query, debug) {
		if (mergeComparison == "timestamps") {
			var existingDate = PlacesUtils.bookmarks.getItemLastModified(existingID);
			if (!existingDate) existingDate = PlacesUtils.bookmarks.getItemDateAdded(existingID);
			if (!existingDate) {
				try {
					existingDate = PlacesUtils.annotations.getItemAnnotation(existingID,
																											this.SP_DATE_ADDED_ANNO);
				} catch (exception) {
				}
			}

			//Delete the existing if older first
			if (existingDate < lastModified) {
				PlacesUtils.bookmarks.removeItem(existingID);
			}
			//If same age and different index, then use the remote's index
			//Always do this for queries cos SP_DATE_ADDED_ANNO can be different?
			else {
				if ((query || existingDate == lastModified) &&
						index != PlacesUtils.bookmarks.getItemIndex(existingID))
				{
					try {
						PlacesUtils.bookmarks.setItemIndex(existingID, index);
					} catch(e) {
						if (debug) SyncPlacesIO.log("WARNING C: Failed to set index for " + existingID + " to " + index);
					}
				}
				return false;
			}
		}
		//Keep local in preference
		else if (mergeComparison == "local") {
			return false;
		}
		//Use remote in preference, so delete the local one
		else if (mergeComparison == "remote") {
			PlacesUtils.bookmarks.removeItem(existingID);
		}
		return true;
	},

	//Check to see if it's been deleted locally - if so then don't add it
	deletedLocally: function(lastSend, node) {
		var lastModifiedTime = node.lastModified;
		if (!lastModifiedTime) lastModifiedTime = node.dateAdded;
		return lastModifiedTime < lastSend;
	},

	//Update the stats object with add
	addStats: function(stats, type, title, parent, index) {
		var addedItem = {};
		addedItem.type = type;
		if (title) addedItem.title = title;
		addedItem.parent = parent;
		addedItem.index = index;
		stats.addedItems.push(addedItem);
	},

	//Update the stats object with update
	updStats: function(stats, type, title, parent, index) {
		var updatedItem = {};
		updatedItem.type = type;
		if (title) updatedItem.title = title;
		updatedItem.parent = parent;
		updatedItem.index = index;
		stats.updatedItems.push(updatedItem);
	},

	//Recurse down the bookmarks tree
	//Delete anything not received (ie not in receivedIds)
	//that is older than the last send
	deleteOldBookmarks: function(container, receivedIds, itemsToDelete, matchingIds,
															 foldersToDelete, lastSend, useTimestamps, mergeMenu,
															 mergeBookmarks, mergeToolbar, mergeSeperators,
															 mergeQueries, mergeLivemarks, mergeUnsorted, debug, stats)
	{
		//Update the stats object with delete
		function deleteStats(stats, type, title, parent, usedTimestamps) {
			var deletedItem = {};
			deletedItem.type = type;
			deletedItem.title = title;
			deletedItem.parent = parent;
			deletedItem.timestamps = usedTimestamps;
			stats.deletedItems.push(deletedItem);
		}

		function removeOldItem(child, doIt, title, type) {
			if (doIt && receivedIds.indexOf(child.itemId) == -1) {
				if (useTimestamps) {
					var lastModifiedTime = child.lastModified;
					if (!lastModifiedTime) lastModifiedTime = child.dateAdded;
					if (lastModifiedTime < lastSend) {
						itemsToDelete.push(child.itemId);
						deleteStats(stats, type, child.title, title, true);
					}
				}
				else {
					//If its in the list then delete it because it has been deleted remotely
					if (matchingIds.indexOf(child.itemId) != -1) {
						itemsToDelete.push(child.itemId);
						deleteStats(stats, type, child.title, title, false);
					}
				}
			}
		}

		function removeOldQuery(child, doIt, title) {
			if (doIt && receivedIds.indexOf(child.itemId) == -1) {
				if (useTimestamps) {
					var lastModifiedTime = child.lastModified;
					if (!lastModifiedTime) lastModifiedTime = child.dateAdded;
					if (!lastModifiedTime) {
						try {
							lastModifiedTime = PlacesUtils.annotations
																	 .getItemAnnotation(child.itemId,
																			SyncPlacesBookmarks.SP_DATE_ADDED_ANNO);
						} catch (exception) {
						}
					}

						//Dont delete if hasn't got a timestamp
					if (lastModifiedTime != 0 && lastModifiedTime < lastSend) {
						itemsToDelete.push(child.itemId);
						deleteStats(stats, SyncPlacesBookmarks.QUERY, child.title, title, true);
					}
				}
				else {
					if (matchingIds.indexOf(child.itemId) != -1) {
						itemsToDelete.push(child.itemId);
						deleteStats(stats, SyncPlacesBookmarks.QUERY, child.title, title, false);
					}
				}
			}
		}

		function asContainer(container) {
			return container.QueryInterface(Components.interfaces
																						.nsINavHistoryContainerResultNode);
		}

		//START HERE
		//Sometimes the container doesn't open (maybe it's not real)
		//In which case skip it
		asContainer(container).containerOpen = true;
		try {
			if (container.childCount > 0) var tested = true;
		} catch (e) {
				try {
					asContainer(container).containerOpen = false;
				} catch(e1) {
				}
				return;
		}

		//Delete old stuff not received
		for (var i = 0; i < container.childCount; i++) {
			var child = container.getChild(i);

			//Skip tags folder
			if (PlacesUtils.tagsFolderId == child.itemId) continue;

			//Ignore the untitled internal folder
			if (container.itemId == PlacesUtils.placesRootId && !child.title) {
				try {
					PlacesUtils.annotations
										 .getItemAnnotation(child.itemId,
																				SyncPlacesBookmarks.SP_READ_ONLY_ANNO);
					continue;
				} catch (e) {
				}
			}

			if (PlacesUtils.nodeIsSeparator(child))
				removeOldItem(child, mergeSeperators, container.title, SyncPlacesBookmarks.SEPARATOR);
			else if (PlacesUtils.nodeIsQuery(child))
				removeOldQuery(child, mergeQueries, container.title);
// CW			else if (PlacesUtils.nodeIsLivemarkContainer(child))
//				removeOldItem(child, mergeLivemarks, container.title, SyncPlacesBookmarks.LIVEMARK);
			else if (PlacesUtils.nodeIsBookmark(child))
				removeOldItem(child, mergeBookmarks, container.title, SyncPlacesBookmarks.BOOKMARK);

			else if (PlacesUtils.nodeIsFolder(child)) {
				//Don't delete the 'special' top level folders, just their kids
				if ([PlacesUtils.toolbarFolderId,
						 PlacesUtils.unfiledBookmarksFolderId,
						 PlacesUtils.bookmarksMenuFolderId].indexOf(child.itemId) == -1)
				{
					//Remove folder if not received and older than last send
					if (receivedIds.indexOf(child.itemId) == -1) {
						if (useTimestamps) {
							var lastModifiedTime = child.lastModified;
							if (!lastModifiedTime) lastModifiedTime = child.dateAdded;
							if (lastModifiedTime < lastSend) {
								foldersToDelete.push(child.itemId);
								deleteStats(stats, SyncPlacesBookmarks.FOLDER, child.title, container.title, true);
							}
						}
						else {
							//If its in the list then delete it because it has been deleted remotely
							if (matchingIds.indexOf(child.itemId) != -1) {
								foldersToDelete.push(child.itemId);
								deleteStats(stats, SyncPlacesBookmarks.FOLDER, child.title, container.title, false);
							}
						}
						//Continue around the loop - ie dont recurse it if not received
						continue;
					}
				}

				//Skip the toolbar,menu,unsorted if not merging them
				if ((PlacesUtils.bookmarksMenuFolderId == child.itemId && !mergeMenu)
						|| (PlacesUtils.toolbarFolderId == child.itemId && !mergeToolbar)
						|| (PlacesUtils.unfiledBookmarksFolderId == child.itemId &&
								!mergeUnsorted))
				{
					continue;
				}

				//Skip links (ie not proper folders)
				else if (PlacesUtils.getConcreteItemId(child) != child.itemId)
					continue;

				//Recurse down into the folder
				else
					this.deleteOldBookmarks(child, receivedIds, itemsToDelete, matchingIds,
																	foldersToDelete, lastSend, useTimestamps,
																	mergeMenu, mergeBookmarks, mergeToolbar,
																	mergeSeperators, mergeQueries,
																	mergeLivemarks, mergeUnsorted, debug, stats);
			}
		}

		//Close the container and continue
		asContainer(container).containerOpen = false;
	},

	//Save favicons to file so can restore them if they ever get lost
	saveFavicons: function() {
		try {
			function getFavicons(container, favicons) {
				function asContainer(container) {
					return container.QueryInterface(Components.interfaces.nsINavHistoryContainerResultNode);
				}

				//Ignore links and other non-folders
				if (container.itemId == -1 ||
						PlacesUtils.getConcreteItemId(container) != container.itemId)
				{
					return;
				}

				//Ignore the tags folder
				if (container.itemId == PlacesUtils.tagsFolderId)	return;

				//Sometimes the container doesn't open (maybe it's not real)
				//In which case skip it
				asContainer(container).containerOpen = true;
				try {
					if (container.childCount > 0) var tested = true;
				} catch (e) {
						try {
							asContainer(container).containerOpen = false;
						} catch(e1) {
						}
						return;
				}

				//Open the folder
				for (var i = 0; i < container.childCount; i++) {
					var node = container.getChild(i);
					if (PlacesUtils.nodeIsQuery(node)
// CW					|| PlacesUtils.nodeIsLivemarkContainer(node)
					) {
						//Do nothing
					}
					else if (PlacesUtils.nodeIsFolder(node)) {
						//Ignore the untitled internal folder
						if (container.itemId == PlacesUtils.placesRootId && !node.title) {
							try {
								PlacesUtils.annotations
													 .getItemAnnotation(node.itemId,
													 										SyncPlacesBookmarks.SP_READ_ONLY_ANNO);
								continue;
							} catch (e) {
							}
						}
						getFavicons(node, favicons);
					}
					else if (node.itemId && node.itemId != -1 && PlacesUtils.nodeIsURI(node)) {
						try {
							var faviconURL = PlacesUtils.favicons.getFaviconForPage(SyncPlacesIO.makeURI(node.uri));
							if (faviconURL && !faviconURL.spec.match(/^http:\/\/www.mozilla.org\/2005\/made-up-favicon/)) {
								var mimeType = {};
								var length = {};
								var data = {};
								data = PlacesUtils.favicons.getFaviconData(faviconURL, mimeType, length, data);
								if (length) {
									var favicon = {};
									favicon.uri = node.uri;
									favicon.faviconuri = faviconURL.spec;
									favicon.mimeType = mimeType;
									favicon.data = data;
									favicons.push(favicon);
								}
							}
						} catch(e2) {
						}
					}
				}
				asContainer(container).containerOpen = false;
			}

			//START HERE
			var options = PlacesUtils.history.getNewQueryOptions();
			var query = PlacesUtils.history.getNewQuery();
			query.setFolders([PlacesUtils.placesRootId], 1);
			var result = PlacesUtils.history.executeQuery(query, options);

			//Trawl through the results looking for favicons
			var favicons = {};
			favicons.iconData = [];
			getFavicons(result.root, favicons.iconData);

			//Save the results
			SyncPlacesIO.saveFile(this.faviconsFile, JSON.stringify(favicons));

		} catch (e) {
			Components.utils.reportError(e);
			SyncPlacesIO.log("ERROR 1: "+ e);
		}
	},

	//Restore any missing favicons from the cache
	restoreFavicons: function() {
		try {
			//Run it in batch mode cos updating a lot of bookmarks
			var batch = {
				runBatched: function() {
					var options = PlacesUtils.history.getNewQueryOptions();
					var query = PlacesUtils.history.getNewQuery();
					query.setFolders([PlacesUtils.placesRootId], 1);
					var result = PlacesUtils.history.executeQuery(query, options);

					//Trawl through the results looking for favicons
					this.getFavicons(result.root);
				},

				getFavicons: function(container) {
					function asContainer(container) {
						return container.QueryInterface(Components.interfaces.nsINavHistoryContainerResultNode);
					}

					//Ignore links and other non-folders
					if (container.itemId == -1 ||
							PlacesUtils.getConcreteItemId(container) != container.itemId)
					{
						return;
					}

					//Ignore the tags folder
					if (container.itemId == PlacesUtils.tagsFolderId)	return;

					//Sometimes the container doesn't open (maybe it's not real)
					//In which case skip it
					asContainer(container).containerOpen = true;
					try {
						if (container.childCount > 0) var tested = true;
					} catch (e) {
							try {
								asContainer(container).containerOpen = false;
							} catch(e1) {
							}
							return;
					}

					//Open the folder
					for (var i = 0; i < container.childCount; i++) {
						var node = container.getChild(i);
						if (PlacesUtils.nodeIsQuery(node)
// CW						|| PlacesUtils.nodeIsLivemarkContainer(node)
						) {
							//Do nothing
						}
						else if (PlacesUtils.nodeIsFolder(node)) {
							//Ignore the untitled internal folder
							if (container.itemId == PlacesUtils.placesRootId && !node.title) {
								try {
									PlacesUtils.annotations
														 .getItemAnnotation(node.itemId,
																								SyncPlacesBookmarks.SP_READ_ONLY_ANNO);
									continue;
								} catch (e) {
								}
							}
							this.getFavicons(node);
						}
						else if (node.itemId && node.itemId != -1 && PlacesUtils.nodeIsURI(node)) {
							var nodeURI = SyncPlacesIO.makeURI(node.uri);
							var faviconURL;
							try {
								faviconURL = PlacesUtils.favicons.getFaviconForPage(nodeURI);
							} catch(e2) {}
							if (!faviconURL || faviconURL.spec.match(/^http:\/\/www.mozilla.org\/2005\/made-up-favicon/)) {
								//Is there a cached favicon?
								for (var j=0; j<favicons.iconData.length; j++) {
									if (favicons.iconData[j].uri == node.uri) {

										//Add the favicon
										var expiry = (new Date().getTime() + SyncPlacesBookmarks.oneDay)* 1000;  //today plus one day - as per spec
										var faviURL = SyncPlacesIO.makeURI(favicons.iconData[j].faviconuri);
										PlacesUtils.favicons.setFaviconData(faviURL, favicons.iconData[j].data,
											favicons.iconData[j].data.length, favicons.iconData[j].mimeType, expiry);

										//Note that this may override the existing faviconURL if it is different
										PlacesUtils.favicons.setFaviconUrlForPage(nodeURI, faviURL);
									}
								}
							}
						}
					}
					asContainer(container).containerOpen = false;
				}
			}

			//Run it in batch mode cos potentially updating a lot of bookmarks
			if (SyncPlacesOptions.prefs.getBoolPref("sync_icons")) {
				//Read in the icon cache
				var filePath = SyncPlacesIO.getDefaultFolder();
				filePath.append(this.faviconsFile);
				var jstr = SyncPlacesIO.readFile(filePath);
				if (filePath.exists()) {
					var favicons;
					try {
						favicons = JSON.parse(jstr);
					} catch (exception) {
						//Old FF
						var nativeJSON = this.Cc["@mozilla.org/dom/json;1"].createInstance(this.Ci.nsIJSON);
						favicons = nativeJSON.decode(jstr);
					}

					//Now restore any missing ones
					PlacesUtils.bookmarks.runInBatchMode(batch, null);
				}
			}

		} catch (e) {
			Components.utils.reportError(e);
			SyncPlacesIO.log("ERROR 2: "+ e);
		}
	}
};
