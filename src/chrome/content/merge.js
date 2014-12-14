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

var SyncPlacesMerge = {
	compare: function(addsDels) {
		//Read in the saved file - if doesn't exist then just return
		var savedData = null;
		try {
			var filePath = SyncPlacesIO.getDefaultFolder();
			filePath.append(SyncPlaces.mergeFile);
			savedData = SyncPlacesIO.readFile(filePath);

		} catch (exception) {
			return addsDels;
		}
		addsDels.oldNodes = PlacesUtils.unwrapNodes(savedData, PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER);

		//Syncing on Subfolder?
		var syncFolderID = PlacesUtils.placesRootId;
		if (!SyncPlacesOptions.prefs.getBoolPref("sendall")) {
			try {
				syncFolderID = SyncPlacesOptions.prefs.getIntPref("bookmarkFolderID");
				if (!syncFolderID || syncFolderID < 0) syncFolderID = PlacesUtils.placesRootId;

			} catch(exception) {
				syncFolderID = PlacesUtils.placesRootId;
			}
		}

		//Check it's valid
		if (syncFolderID != PlacesUtils.placesRootId) {
			var type = null;
			try {
				type = PlacesUtils.bookmarks.getItemType(syncFolderID);

			} catch(exception) {
				return addsDels;
			}

			//Type check
			if (type != PlacesUtils.bookmarks.TYPE_FOLDER) return addsDels;
		}

		var mergeAll = SyncPlacesOptions.prefs.getBoolPref("merge_all");
		var mergeSeperators = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_seperators");
		var mergeMenu = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_menu");
		var mergeBookmarks = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_bookmarks");
		var mergeToolbar = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_toolbar");
		var mergeQueries = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_queries");
		var mergeLivemarks = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_livemarks");
		var mergeUnsorted = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_unsorted");

		//Define what you want to do such that it can be run in batch mode
		var batch = {
			nodes: addsDels.oldNodes[0].children,

			runBatched: function() {
				//Go through all the JSON nodes comparing with current bookmarks
				this.nodes.forEach(function(node) {
					//Is there anything to compare (when syncing subfolder the node may not be a container)
					if (syncFolderID == PlacesUtils.placesRootId && (!node.children || node.children.length == 0)) return;

					//Special Root nodes/folders don't need to be considered
					if (node.root) {
						//Start at the top folder (placesRootId or syncFolderID)
						var container = syncFolderID;
						switch (node.root) {
							case "bookmarksMenuFolder":
								if (!mergeMenu) return;
								container = PlacesUtils.bookmarksMenuFolderId;
							break;

							case "tagsFolder":
								container = PlacesUtils.tagsFolderId;
							break;

							case "unfiledBookmarksFolder":
								if (!mergeUnsorted) return;
								container = PlacesUtils.unfiledBookmarksFolderId;
							break;

							case "toolbarFolder":
								if (!mergeToolbar) return;
								container = PlacesUtils.toolbarFolderId;
							break;
						}

						//Okay now add the kids
						node.children.forEach(function(child) {
							SyncPlacesMerge.getChanges(addsDels.missingNodes, child, container, child.index, mergeBookmarks,
																				 mergeSeperators, mergeQueries, mergeLivemarks, addsDels.matchingIds);
						}, this);

					}
					//If not special then just add everything (that's not already there)
					else {
						SyncPlacesMerge.getChanges(addsDels.missingNodes, node, syncFolderID, node.index, mergeBookmarks,
																			 mergeSeperators, mergeQueries, mergeLivemarks, addsDels.matchingIds);
					}

				}, this);
			}
		};

		//Now run it in batch mode
		try {
			PlacesUtils.bookmarks.runInBatchMode(batch, null);

		} catch(e) {
			//Report the original error just in case
			Components.utils.reportError(e);

			//If fails then run it in non-batch mode to trap the error better
			batch.runBatched();
		}

		return addsDels;
	},

	getChanges: function(missingNodes, node, container, index, mergeBookmarks, mergeSeperators, mergeQueries, mergeLivemarks, matchingIds) {
		switch (node.type) {
			case PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER:
				//Ignore Tags
				if (container == PlacesUtils.tagsFolderId) {
					return;
				}

				//Livemarks
				else if (node.livemark && node.annos) {
					if (!mergeLivemarks) break;

					var feedURI = null;
					node.annos.forEach(function(anno) {
						if (anno.name == SyncPlacesBookmarks.SP_LMANNO_FEEDURI) {
              feedURI = SyncPlacesIO.makeURI(anno.value);
						}
					}, this);

					if (feedURI) {
						var existingID = SyncPlacesBookmarks.existingLivemark(container, node.title, feedURI);
						if (existingID != null)
							matchingIds.push(existingID);
						else
							missingNodes.push(node.id);
					}
				}

				//Normal folders
				else {
					//Skip special 'no title' folder when merging otherwise get problems due to duplicate container
					if (node.title == "" && container == PlacesUtils.placesRootId) {
						break;
					}

					//If merging (or syncing subfolder) and duplicate folder then merge into the existing folder
					var containerID = SyncPlacesBookmarks.existingFolder(container, node, index, "local");

					//If doesn't exist then add to missingNodes list
					if (containerID == -1) {
						missingNodes.push(node.id);
					}

					//Else do the kids
					else if (node.children) {
						matchingIds.push(containerID);
						node.children.forEach(function(child, index) {
							this.getChanges(missingNodes, child, node.id, index, mergeBookmarks, mergeSeperators,
													 		mergeQueries, mergeLivemarks, matchingIds);
						}, this);
					}
				}
			break;

			case PlacesUtils.TYPE_X_MOZ_PLACE:
				var existingID = null;

				//Deal with queries
				var query = (node.uri.substr(0, 6) == "place:");
				if (query) {
					//Skip queries?
					if (!mergeQueries) break;

					//If guid then this can be a proper match
					if (node.guid && (PlacesUtils.bookmarks.getItemIdForGUID(node.guid) != -1)) {
						existingID = SyncPlacesBookmarks.existingGuid(container, node.guid, "query");
					}
					//None-guid scenario (one or t'other guid missing)
					else {
						existingID = SyncPlacesBookmarks.existingPlace(container, node);
					}
				}

				//Deal with bookmarks
				else {
					//Skip bookmarks?
					if (!mergeBookmarks) break;

					existingID = SyncPlacesBookmarks.existingPlace(container, node);
				}

				if (existingID != null)
					matchingIds.push(existingID);
				else
					missingNodes.push(node.id);
			break;

			case PlacesUtils.TYPE_X_MOZ_PLACE_SEPARATOR:
				if (!mergeSeperators) break;

				//If guid received and have a local guid as well then this can be a proper match
				if (node.guid && (PlacesUtils.bookmarks.getItemIdForGUID(node.guid) != -1)) {
					var existingID = SyncPlacesBookmarks.existingGuid(container, node.guid, "sep");
					if (existingID != null)
						matchingIds.push(existingID);
					else {
						missingNodes.push(node.id);
					}
				}

				//None-guid scenario (one or t'other guid missing)
				else {
					var existingID = SyncPlacesMerge.existingSeparator(container, index, node);
				  if (existingID != -1)
				  	matchingIds.push(existingID);
				  else {
						existingID = SyncPlacesMerge.existingSeparator(container, index-1, node);
						if (existingID != -1)
							matchingIds.push(existingID);
						else {
							existingID = SyncPlacesMerge.existingSeparator(container, index+1, node);
							if (existingID != -1)
								matchingIds.push(existingID);
							else
								missingNodes.push(node.id);
						}
					}
				}
			break;
		}
	},

	//Is there a seperator that would be next to this one if we were to add it
	//If so then dont add it
	existingSeparator: function(container, index, node) {
		var existingID = -1;
		try {
			existingID = PlacesUtils.bookmarks.getIdForItemAt(container, index);

		} catch(exception) {
			//if index is too big!
		}

		//If something there and it's not a separator then ignore it
		if ((existingID != -1) && (PlacesUtils.bookmarks.getItemType(existingID) !=
						 								   PlacesUtils.bookmarks.TYPE_SEPARATOR))
		{
			existingID = -1;
		}

		return existingID;
	},

	deletedLivemark: function(oldNodes, missingNodes, title, feedURI) {
		//Check all the oldNodes for matches
		for (var i = 0; i < oldNodes.length; i++) {
			var oldNode = oldNodes[i];
			var oldID = oldNode.id;
			if (oldNode.type == PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER &&
					oldNode.livemark && oldNode.annos)
			{
				var oldFeedURI = null;
				oldNode.annos.forEach(function(anno) {
					if (anno.name == SyncPlacesBookmarks.SP_LMANNO_FEEDURI) {
						oldFeedURI = SyncPlacesIO.makeURI(anno.value);
					}
				}, this);

				if (oldFeedURI &&
						SyncPlacesBookmarks.sameValue(title, oldNode.title, false) &&
						SyncPlacesBookmarks.sameValue(feedURI, oldFeedURI, true) )
				{
					//Found a match - but has this been deleted?
					//If in the oldNodes then yes it has
					if (missingNodes.indexOf(oldID) != -1) {
						return true;
					}
				}
			}
		}
		//If get to here then no match in the oldNodes
		//so must have been added remotely
		return false;
	},

	deletedFolder: function(oldNodes, missingNodes, title) {
		//Check all the oldNodes for matches
		for (var i = 0; i < oldNodes.length; i++) {
			var oldNode = oldNodes[i];
			var oldID = oldNode.id;

			if (oldNode.type == PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER &&
					!oldNode.livemark &&
					SyncPlacesBookmarks.sameValue(title, oldNode.title, false))
			{
				//Found a match - but has this been deleted?
				//If in the oldNodes then yes it has
				if (missingNodes.indexOf(oldID) != -1) {
					return true;
				}
			}
		}
		//If get to here then no match in the oldNodes
		//so must have been added remotely
		return false;
	},

	deletedPlace: function(oldNodes, missingNodes, node) {
		//Check all the oldNodes for matches
		for (var i = 0; i < oldNodes.length; i++) {
			var oldNode = oldNodes[i];
			var oldID = oldNode.id;

			if (oldNode.type == PlacesUtils.TYPE_X_MOZ_PLACE &&
					oldNode.uri &&
					SyncPlacesBookmarks.sameValue(node.uri, oldNode.uri, false) &&
					SyncPlacesBookmarks.sameValue(node.title, oldNode.title, false))
			{
				//Found a match - but has this been deleted?
				//If in the oldNodes then yes it has
				if (missingNodes.indexOf(oldID) != -1) {
					return true;
				}
			}
		}
		//If get to here then no match in the oldNodes
		//so must have been added remotely
		return false;
	},

	matchingFolder: function(oldNodes, title) {
		//Check all the oldNodes for matches
		for (var i = 0; i < oldNodes.length; i++) {
			var oldNode = oldNodes[i];
			var oldID = oldNode.id;

			if (oldNode.type == PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER &&
					!oldNode.livemark &&
					SyncPlacesBookmarks.sameValue(title, oldNode.title, false))
			{
				return oldNode.children;
			}
		}
		var oldSubNodes = [];
		return oldSubNodes;
	},

	//If has been deleted locally then return true
	deletedSeparator: function(oldNodes, missingNodes, index) {
		if (index+1 > oldNodes.length || index < 0) return false;
		var oldNode = oldNodes[index];
		var oldID = oldNode.id;

		if (oldNode.type == PlacesUtils.TYPE_X_MOZ_PLACE_SEPARATOR) {
				//Found a match - but has this been deleted?
				//If in the oldNodes then yes it has
				if (missingNodes.indexOf(oldID) != -1) {
					return true;
				}
		}
		return false;
	}
};
