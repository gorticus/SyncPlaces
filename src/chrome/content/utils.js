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
 * The Original Code is the Places Command Controller.
 *
 * The Initial Developer of the Original Code is Google Inc.
 * Portions created by the Initial Developer are Copyright (C) 2005
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Andy Halford <andy@andyhalford.com>
 *   Ben Goodger <beng@google.com>
 *   Myk Melez <myk@mozilla.org>
 *   Asaf Romano <mano@mozilla.com>
 *   Sungjoon Steve Won <stevewon@gmail.com>
 *   Dietrich Ayala <dietrich@mozilla.com>
 *   Marco Bonardo <mak77@bonardo.net>
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

try {
	Components.utils.import("resource://gre/modules/PlacesUtils.jsm");
} catch(ex) {
	Components.utils.import("resource://gre/modules/utils.js");
}

var SyncPlacesUtils = {
	SP_TAG: "syncplaces/tag",

  /**
   * Import bookmarks from a JSON string in UTF-8 format
   */
	restoreBookmarksFromJSONString: function(nodes, addsDels, allowMergeAndSubFolder, timeout, xbelImport, stats) {
		function checkSyncFolderNodes(syncFolderID, nodes, timeout) {
			//Name check?
			if (!SyncPlacesOptions.prefs.getBoolPref('skip_name_check')) {
				var title1 = PlacesUtils.bookmarks.getItemTitle(syncFolderID);
				if (!title1) title1 = "";
				var title2 = nodes[0].title;
				if (!title2) title2 = "";

				if (!SyncPlacesBookmarks.sameValue(title1, title2, false)) {
					if (!title2)
						SyncPlacesOptions.alert2(null, 'all_places_not_expected', null, timeout,
							"http://www.andyhalford.com/syncplaces/options.html");
					else
						SyncPlacesOptions.alert2(null, 'wrong_title_subfolder', title1 + " != " + title2, timeout,
							"http://www.andyhalford.com/syncplaces/options.html");

					return false;
				}
			}

			//It's not the whole tree is it? (should never get here)
			if (nodes[0].children[0].root) {
				SyncPlacesOptions.alert2(null, 'all_places_not_expected', null, timeout,
					"http://www.andyhalford.com/syncplaces/options.html");
				return false;
			}
			return true;
		}

		//START HERE
    if (nodes.length == 0 || !nodes[0].children ||
        nodes[0].children.length == 0)
      return false; // nothing to restore

		//Are we merging?
		var merge = false;
		var mergeDeletes = false;
		var mergeComparison = "local";	//When not merging (and possibly syncing subfolder) then prefer the local folder by default
		var mergeMenu = false;
		var mergeBookmarks = false;
		var mergeToolbar = false;
		var mergeSeperators = false;
		var mergeQueries = false;
		var mergeLivemarks = false;
		var mergeUnsorted = false;
		if (allowMergeAndSubFolder) {
			merge = SyncPlacesOptions.prefs.getBoolPref("merge");
			if (merge) {
				var mergeAll = SyncPlacesOptions.prefs.getBoolPref("merge_all");
				//Always ignore merge_deletes for XBEL imports cos send/receive timestamps are meaningless
				mergeDeletes = xbelImport ? false : SyncPlacesOptions.prefs.getBoolPref("merge_deletes");
				mergeComparison = SyncPlacesOptions.prefs.getCharPref("comparison");
				mergeSeperators = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_seperators");
				mergeMenu = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_menu");
				mergeBookmarks = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_bookmarks");
				mergeToolbar = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_toolbar");
				mergeQueries = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_queries");
				mergeLivemarks = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_livemarks");
				mergeUnsorted = mergeAll ? true : SyncPlacesOptions.prefs.getBoolPref("merge_unsorted");
			}
		}
		var debug = SyncPlacesOptions.prefs.getBoolPref("debug");

		//Syncing on Subfolder?
		var syncFolderID = PlacesUtils.placesRootId;
		if (allowMergeAndSubFolder && !SyncPlacesOptions.prefs.getBoolPref("sendall")) {
			try {
				syncFolderID = SyncPlacesOptions.prefs.getIntPref("bookmarkFolderID");
				if (!syncFolderID || syncFolderID < 0) syncFolderID = PlacesUtils.placesRootId;

			} catch(exception) {
				syncFolderID = PlacesUtils.placesRootId;
			}
		}

		//If sync'ing on subfolder, check everything okay
		if (syncFolderID != PlacesUtils.placesRootId) {
			if (!SyncPlacesBookmarks.checkSyncFolder(syncFolderID, timeout) || !checkSyncFolderNodes(syncFolderID, nodes, timeout)) return false;
		}
		//Check you're not receiving a subfolder, when you're expecting everything
		else if (!nodes[0].children[0].root) {
			SyncPlacesOptions.alert2(null, 'restoring_subfolder_by_mistake', null, timeout,
				"http://www.andyhalford.com/syncplaces/options.html");
			return false;
		}

		//Tags folder must be processed last once everything else has been added/merged (or they may not exist!)
    nodes[0].children.sort(function sortRoots(aNode, bNode) {
      return (aNode.root && aNode.root == "tagsFolder") ? 1 :
              (bNode.root && bNode.root == "tagsFolder") ? -1 : 0;
		});

		//Define what you want to do such that it can be run in batch mode
		var batch = {
			nodes: nodes[0].children,
			containerTitle: nodes[0].title,

			runBatched: function() {
				//If no saved nodes then use lastSend processing (upgrade situation from old SyncPlaces)
				var useTimestamps = false;
				var oldNodes = [];
				if (addsDels.oldNodes.length == 0 || !addsDels.oldNodes[0].children ||
						addsDels.oldNodes[0].children.length == 0)
				{
					useTimestamps = true;
				}
				else {
					oldNodes = addsDels.oldNodes[0].children;
				}

				//If never received and never sent (first time use) then turn off mergeDeletes option, so you don't lose anything
				var lastSend = parseInt(SyncPlacesOptions.prefs.getCharPref("lastSend"), 10);
				var lastReceived = parseInt(SyncPlacesOptions.prefs.getCharPref("lastReceived"), 10);
				if (lastReceived == 0 && lastSend == 0) mergeDeletes = false;

				//If overwriting then delete the old stuff first
				if (!merge) {
					// Get roots excluded from the backup, we will not remove them
					// before restoring.
					var excludeItems = PlacesUtils.annotations
																 .getItemsWithAnnotation(SyncPlacesBookmarks.SP_EXCLUDE_FROM_BACKUP_ANNO, {});
					// delete existing children of the root node, excepting:
					// 1. special folders: delete the child nodes
					// 2. tags folder: untag via the tagging api

					//Get the root of the Places tree or the SyncFolder ready to delete the children
					var query = PlacesUtils.history.getNewQuery();
					query.setFolders([syncFolderID], 1);
					var options = PlacesUtils.history.getNewQueryOptions();
          options.expandQueries = false;
					var root = PlacesUtils.history.executeQuery(query, options).root;
					root.containerOpen = true;

					//Make a copy otherwise when start to delete the rowIDs may change and it may not work properly
					var childIds = [];
					for (var i = 0; i < root.childCount; i++) {
                      var childId = root.getChild(i).itemId;
                      if (excludeItems.indexOf(childId) == -1)
                        childIds.push(childId);
					}
					root.containerOpen = false;

					//Delete stuff
					for (var i = 0; i < childIds.length; i++) {
						var rootItemId = childIds[i];

						//Dont delete tags, remove using the tagging service
						if (rootItemId == PlacesUtils.tagsFolderId) {
							var tags = PlacesUtils.tagging.allTags;
              var bogusTagContainer = false;
              for (let j in tags) {
                var tagURIs = [];
                // skip empty tags since getURIsForTag would throw
                if (tags[j])
                  tagURIs = PlacesUtils.tagging.getURIsForTag(tags[j]);

                if (!tagURIs.length) {
                  // This is a bogus tag container, empty tags should be removed
                  // automatically, but this does not work if they contain some
                  // not-uri node, so we remove them manually.
                  // XXX this is a temporary workaround until we implement
                  // preventive database maintenance in bug 431558.
                  bogusTagContainer = true;
                }
                for (let k in tagURIs)
                  PlacesUtils.tagging.untagURI(tagURIs[k], [tags[j]]);
              }
              if (bogusTagContainer)
                PlacesUtils.bookmarks.removeFolderChildren(rootItemId);
						}
						//Don't delete the 'special' top level folders, just delete their kids
						else if ([PlacesUtils.toolbarFolderId,
											PlacesUtils.unfiledBookmarksFolderId,
											PlacesUtils.bookmarksMenuFolderId].indexOf(rootItemId) != -1)
							PlacesUtils.bookmarks.removeFolderChildren(rootItemId);

						//Delete everything else
						else
							PlacesUtils.bookmarks.removeItem(rootItemId);
					}
				}

				//These are to be returned for fixing up once you've finished
				var searchIds = [];
				var folderIdMap = [];

				//List of all IDs of all items received for mergeDeletes functionality
				var receivedIds = [];

				//Okay go through all the JSON nodes adding them in (if not already there)
				this.nodes.forEach(function(node) {

					//Is there anything to restore (when restoring subfolder the node may not be a container)
					if (syncFolderID == PlacesUtils.placesRootId && (!node.children || node.children.length == 0)) return;

					//Special Root nodes/folders don't need to be added (as they've not been deleted - see above)
					if (node.root) {
						//Start at the top folder (placesRootId or syncFolderID)
						var container = syncFolderID;
						switch (node.root) {
							case "bookmarksMenuFolder":
								if (merge && !mergeMenu) return;
								container = PlacesUtils.bookmarksMenuFolderId;
							break;

							case "tagsFolder":
								container = PlacesUtils.tagsFolderId;
							break;

							case "unfiledBookmarksFolder":
								if (merge && !mergeUnsorted) return;
								container = PlacesUtils.unfiledBookmarksFolderId;
							break;

							case "toolbarFolder":
								if (merge && !mergeToolbar) return;
								container = PlacesUtils.toolbarFolderId;
							break;
						}
						receivedIds.push(container);

						//Get the corresponding oldNodes children for these special root nodes
						var oldSubNodes = oldNodes;
						if (!useTimestamps) {
							oldNodes.forEach(function(oldNode) {
								if (oldNode.root) {
									switch (oldNode.root) {
										case "bookmarksMenuFolder":
											if (container == PlacesUtils.bookmarksMenuFolderId)
												oldSubNodes = oldNode.children;
										break;

										case "tagsFolder":
											if (container == PlacesUtils.tagsFolderId)
												oldSubNodes = oldNode.children;
										break;

										case "unfiledBookmarksFolder":
											if (container == PlacesUtils.unfiledBookmarksFolderId)
												oldSubNodes = oldNode.children;
										break;

										case "toolbarFolder":
											if (container == PlacesUtils.toolbarFolderId)
												oldSubNodes = oldNode.children;
										break;
									}
								}
							}, this);
						}

						//Okay now add the kids
						node.children.forEach(function(child) {
							var [folders, searches] = SyncPlacesUtils.importJSONNode(child, container, child.index, merge, mergeComparison, mergeBookmarks, mergeSeperators, mergeQueries, mergeLivemarks, mergeUnsorted, mergeDeletes, syncFolderID, lastSend, receivedIds, useTimestamps, oldSubNodes, addsDels.missingNodes, debug, node.title, stats, 0);
              for (var i = 0; i < folders.length; i++) {
                if (folders[i])
                  folderIdMap[i] = folders[i];
              }
							searchIds = searchIds.concat(searches);
						}, this);
					}
					//If not special then just add everything (that's not already there)
					else {
						SyncPlacesUtils.importJSONNode(node, syncFolderID, node.index, merge, mergeComparison, mergeBookmarks, mergeSeperators, mergeQueries, mergeLivemarks, mergeUnsorted, mergeDeletes, syncFolderID, lastSend, receivedIds, useTimestamps, oldNodes, addsDels.missingNodes, debug, this.containerTitle, stats, 0);
					}

				}, this);

				//Sort out imported "place:" uris that contain folders
				//ie correct the folder ID in the query to be the new one allocated and not the original one
				searchIds.forEach(function(id) {
					var oldURI = PlacesUtils.bookmarks.getBookmarkURI(id);
					var uri = SyncPlacesUtils.fixupQuery(PlacesUtils.bookmarks.getBookmarkURI(id), folderIdMap);
					if (!uri.equals(oldURI)) {
						PlacesUtils.bookmarks.changeBookmarkURI(id, uri);
					}
				}, this);

				//if merging deletes, then delete anything not received that is older than the last send
				if (merge && mergeDeletes && lastSend > 0) {

					//Get the root of the Places tree or the SyncFolder and recurse through them all deleting as appropriate
					var query = PlacesUtils.history.getNewQuery();
					query.setFolders([syncFolderID], 1);
					var options = PlacesUtils.history.getNewQueryOptions();
					var root = PlacesUtils.history.executeQuery(query, options).root;
					var itemsToDelete = [];
					var foldersToDelete = [];
					SyncPlacesBookmarks.deleteOldBookmarks(root, receivedIds, itemsToDelete, addsDels.matchingIds, foldersToDelete, lastSend,
																								 useTimestamps, mergeMenu, mergeBookmarks, mergeToolbar, mergeSeperators, mergeQueries,
																								 mergeLivemarks, mergeUnsorted, debug, stats);

					//Do the deletions outside of the query
					itemsToDelete.forEach(function(id) {
						PlacesUtils.bookmarks.removeItem(id);
					}, this);
					foldersToDelete.forEach(function(id) {
						try {
							PlacesUtils.bookmarks.removeFolder(id);	//Obsolete in FF4.0
						} catch(e) {
							PlacesUtils.bookmarks.removeItem(id);	//TODO - very inefficient way of doing this
						}
					}, this);
				}
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

		//Convert any special syncplaces annotations into real tags for backward compatibility
		var count = 0;
		while (true) {
			var items = PlacesUtils.annotations.getItemsWithAnnotation(SyncPlacesUtils.SP_TAG + count, {});
			if (items.length == 0) break;
			var lastModified;
			for (var i = 0; i < items.length; i++) {
				lastModified = PlacesUtils.bookmarks.getItemLastModified(items[i]);
				PlacesUtils.tagging.tagURI(PlacesUtils.bookmarks.getBookmarkURI(items[i]),
																	 [PlacesUtils.annotations.getItemAnnotation(items[i], SyncPlacesUtils.SP_TAG + count)]);
				PlacesUtils.annotations.removeItemAnnotation(items[i], SyncPlacesUtils.SP_TAG + count);
				PlacesUtils.bookmarks.setItemLastModified(items[i], lastModified);
			}
			count++;
		}

		return true;
	},

  /**
   * Replaces imported folder ids with their local counterparts in a place: URI.
   *
   * @param   aURI
   *          A place: URI with folder ids.
   * @param   aFolderIdMap
   *          An array mapping old folder id to new folder ids.
   * @returns the fixed up URI if all matched. If some matched, it returns
   *          the URI with only the matching folders included. If none matched it
   *          returns the input URI unchanged.
   */
  fixupQuery: function(aQueryURI, aFolderIdMap) {
    function convert(str, p1, offset, s) {
      return "folder=" + aFolderIdMap[p1];
    }
    var stringURI = aQueryURI.spec.replace(/folder=([0-9]+)/g, convert);
    return PlacesUtils._uri(stringURI);
  },

  /**
   * Takes a JSON-serialized node and inserts it into the db.
   *
   * @param   node
   *          The unwrapped data blob of dropped or pasted data.
   * @param   container
   *          The container the data was dropped or pasted into
   * @param   index
   *          The index within the container the item was dropped or pasted at
   * @returns an array containing of maps of old folder ids to new folder ids,
   *          and an array of saved search ids that need to be fixed up.
   *          eg: [[[oldFolder1, newFolder1]], [search1]]
   */
	importJSONNode: function(node, container, index, merge, mergeComparison, mergeBookmarks, mergeSeperators, mergeQueries, mergeLivemarks,
													 mergeUnsorted, mergeDeletes, syncFolderID, lastSend, receivedIds, useTimestamps, oldNodes, missingNodes, debug,
													 containerTitle, stats, aGrandParentId)
	{
		var folderIdMap = [];
		var searchIds = [];
		var id = -1;
		var update = false;	//set to true if updating an existing item
		if (!index) index = 0;
		switch (node.type) {
			case PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER:
				//Tags (which are done last)
				if (container == PlacesUtils.tagsFolderId) {
					if (node.children) {
						node.children.forEach(function(child) {
							try {
								PlacesUtils.tagging.tagURI(SyncPlacesIO.makeURI(child.uri), [node.title]);
							} catch (ex) {
								// invalid tag child, skip it
							}
						}, this);
						return [folderIdMap, searchIds];
					}
				}

				//Livemarks
				else if (node.livemark && node.annos) {
					if (merge && !mergeLivemarks) break;

					//Remove livemark annos so don't get added at the end
					var feedURI = null;
					var siteURI = null;
					node.annos = node.annos.filter(function(anno) {
            switch (anno.name) {
              case SyncPlacesBookmarks.SP_LMANNO_FEEDURI:
                feedURI = SyncPlacesIO.makeURI(anno.value);
                return false;
              case SyncPlacesBookmarks.SP_LMANNO_SITEURI:
                siteURI = SyncPlacesIO.makeURI(anno.value);
                return false;
              case SyncPlacesBookmarks.SP_LMANNO_EXPIRATION:
              case SyncPlacesBookmarks.SP_LMANNO_LOADING:
              case SyncPlacesBookmarks.SP_LMANNO_LOADFAILED:
                return false;
              default:
                return true;
            }
					}, this);

					if (feedURI) {
					
						if (merge) {
							var existingID = SyncPlacesBookmarks.existingLivemark(container, node.title, feedURI);
							//If exists then deal with duplicates
							if (existingID != null) {
								var modifiedDate = node.lastModified;
								if (!modifiedDate) modifiedDate = node.dateAdded;
								if (!SyncPlacesBookmarks.dealWithDuplicates(existingID, mergeComparison, modifiedDate, index, false, debug)) {
									receivedIds.push(existingID);
									break;
								}
								else {
									update = true;
								}
							}
							//If doesn't exist has it been deleted locally, more recently than last send or not in list of oldNodes
							else if (mergeDeletes) {
								if (useTimestamps) {
									if (SyncPlacesBookmarks.deletedLocally(lastSend, node))
										break;
								}
								else if (SyncPlacesMerge.deletedLivemark(oldNodes, missingNodes, node.title, feedURI))
									break;
							}
							if (update) 
								SyncPlacesBookmarks.updStats(stats, SyncPlacesBookmarks.LIVEMARK, node.title, containerTitle, index);
							else 
								SyncPlacesBookmarks.addStats(stats, SyncPlacesBookmarks.LIVEMARK, node.title, containerTitle, index);
						}
						else {
							if (update) stats.updated.livemarks++;
							else stats.added.livemarks++;
						}
						id = PlacesUtils.livemarks.createLivemarkFolderOnly(container, node.title, siteURI, feedURI, index);
						receivedIds.push(id);
						
					}
				}

				//Normal folders
				else {
					//Ignore the untitled internal stuff when merging otherwise get problems due to duplicate containers
					if (merge && container == PlacesUtils.placesRootId && !node.title) {
						if (node.annos) {
							var skip = false;
							node.annos.forEach(function(anno) {
								if (anno.name == SyncPlacesBookmarks.SP_READ_ONLY_ANNO) skip = true;
							});
							if (skip) break;
						}
					}

					//If merging (or syncing subfolder) and duplicate folder then merge into the existing folder
					var containerID = -1;	//I want "id==-1" if there's an existing folder, so use another variable
					if (merge || syncFolderID != PlacesUtils.placesRootId) {
						containerID = SyncPlacesBookmarks.existingFolder(container, node, index, mergeComparison, debug);
					}

					//If doesn't exist then create it
					var mergeChildren = merge;
					var oldSubNodes = [];
					if (containerID == -1) {
						//Don't create it if it has been deleted locally
						//ie remote folder is older than last send time or not in list of oldNodes
						if (merge && mergeDeletes) {
							if (useTimestamps) {
								if (SyncPlacesBookmarks.deletedLocally(lastSend, node))
									break;
							}
							else if (SyncPlacesMerge.deletedFolder(oldNodes, missingNodes, node.title))
								break;
						}

						containerID = PlacesUtils.bookmarks.createFolder(container, node.title, index);
						if (merge) SyncPlacesBookmarks.addStats(stats, SyncPlacesBookmarks.FOLDER, node.title, containerTitle, index);
						else stats.added.folders++;
						id = containerID;

						//Because you've created this folder, its children don't need to be 'merged' at all
						mergeChildren = false;
					}
					//Get matching oldNode folder
					else {
						oldSubNodes = SyncPlacesMerge.matchingFolder(oldNodes, node.title);
					}
					receivedIds.push(containerID);
          folderIdMap[node.id] = containerID;

					//Do the kids
					if (node.children) {
						node.children.forEach(function(child, index) {
							var [folders, searches] = this.importJSONNode(child, containerID, index, mergeChildren, mergeComparison,
																														mergeBookmarks, mergeSeperators, mergeQueries, mergeLivemarks, mergeUnsorted,
																														mergeDeletes, syncFolderID, lastSend, receivedIds, useTimestamps, oldSubNodes,
																														missingNodes, debug, node.title, stats, container);
              for (var i = 0; i < folders.length; i++) {
                if (folders[i]) folderIdMap[i] = folders[i];
              }
							searchIds = searchIds.concat(searches);
						}, this);
					}
				}
			break;

			case PlacesUtils.TYPE_X_MOZ_PLACE:
				if (merge) {
					var modifiedDate = node.lastModified;
					if (!modifiedDate) modifiedDate = node.dateAdded;

					//Deal with queries
					var query = (node.uri.substr(0, 6) == "place:");
					if (query) {
						//Skip queries?
						if (!mergeQueries) break;

						if (node.annos) {
							node.annos.forEach(function(anno) {
								//Queries dont have a dateAdded or lastModified - so use my own annotation to store it
								if (anno.name == SyncPlacesBookmarks.SP_DATE_ADDED_ANNO && !modifiedDate) modifiedDate = anno.value;
							});
						}

						//None-guid scenario - guids are now deprecated
						var existingID = SyncPlacesBookmarks.existingPlace(container, node);
						if (existingID != null) {
							if (!SyncPlacesBookmarks.dealWithDuplicates(existingID, mergeComparison, modifiedDate, index, true, debug)) {
								receivedIds.push(existingID);
								break;
							}
							else {
							  update = true;
							}
						}
						else if (mergeDeletes) {
							if (useTimestamps) {
								//Stop deletions of new queries with no "date added" by fixing the last send date
								var lastSendDate = (modifiedDate != 0) ? lastSend : -1;

								//If doesn't exist - has it been deleted locally, more recently than last send?
								if (modifiedDate < lastSendDate) break;
							}
							else if (SyncPlacesMerge.deletedPlace(oldNodes, missingNodes, node)) {
								break;
							}
						}
					}

					//Deal with bookmarks
					else {
						//Skip bookmarks?
						if (!mergeBookmarks) break;

						var existingID = SyncPlacesBookmarks.existingPlace(container, node);
						if (existingID != null) {
							if (!SyncPlacesBookmarks.dealWithDuplicates(existingID, mergeComparison, modifiedDate, index, false, debug)) {
								receivedIds.push(existingID);
								break;
							}
							else {
							  update = true;
							}
						}
						//If doesn't already exist then don't create it if it has been deleted locally
						//(ie remote bookmark is older than last send time or not in list of oldNodes)
						else if (mergeDeletes) {
							if (useTimestamps) {
								if (modifiedDate < lastSend) break;
							}
							else if (SyncPlacesMerge.deletedPlace(oldNodes, missingNodes, node))
								break;
						}
					}
				}

				//Add the bookmark
				id = PlacesUtils.bookmarks.insertBookmark(container, SyncPlacesIO.makeURI(node.uri), index, node.title);
				if (merge) {
					if (update)
						SyncPlacesBookmarks.updStats(stats, query ? SyncPlacesBookmarks.QUERY : SyncPlacesBookmarks.BOOKMARK,
							 													 node.title, containerTitle, index);
					else 
						SyncPlacesBookmarks.addStats(stats, query ? SyncPlacesBookmarks.QUERY : SyncPlacesBookmarks.BOOKMARK,
							 													 node.title, containerTitle, index);
				}
				else {
					if (query) {
						if (update) stats.updated.query++;
						else stats.added.query++;
					}
					else {
						if (update) stats.updated.places++;
						else stats.added.places++;
					}
				}
				receivedIds.push(id);

				if (node.keyword) PlacesUtils.bookmarks.setKeywordForBookmark(id, node.keyword);

				if (node.tags) {
					var tags = node.tags.split(", ");
					if (tags.length)
						PlacesUtils.tagging.tagURI(SyncPlacesIO.makeURI(node.uri), tags);
				}

				if (node.charset) PlacesUtils.history.setCharsetForURI(SyncPlacesIO.makeURI(node.uri), node.charset);

				if (query) {
					searchIds.push(id);
				}
				else if (node.favicon &&
								 SyncPlacesOptions.prefs.getBoolPref("sync_icons") &&
								 !node.favicon.match(/^http:\/\/www.mozilla.org\/2005\/made-up-favicon/))
				{
					try {
						PlacesUtils.favicons.setAndLoadFaviconForPage(SyncPlacesIO.makeURI(node.uri), SyncPlacesIO.makeURI(node.favicon), false);
					} catch(e) {
					}
				}
			break;

			case PlacesUtils.TYPE_X_MOZ_PLACE_SEPARATOR:
				//If merging, would the new separator be next to an existing one? - if so then don't add
				if (merge) {
					if (!mergeSeperators) break;
					var existingSep1 = false;
					var existingSep2 = false;
					var existingSep3 = false;

					//Note that I MUST run checks on both index and index-1 otherwise mergeDeletes may accidentally delete an existing sep because no longer have GUIDs
					//Hence the weird logic here - it still has flaws though because no GUID
					existingSep1 = SyncPlacesBookmarks.existingSeparator(container, index, node, mergeDeletes, lastSend, receivedIds,
																																useTimestamps, oldNodes, missingNodes);
					existingSep2 = SyncPlacesBookmarks.existingSeparator(container, index-1, node, mergeDeletes, lastSend, receivedIds,
																																useTimestamps, oldNodes, missingNodes);
					existingSep3 = SyncPlacesBookmarks.existingSeparator(container, index+1, node, mergeDeletes, lastSend, receivedIds,
																																useTimestamps, oldNodes, missingNodes);

					//If conflict then abort
				  if (existingSep1 || existingSep2 || existingSep3) break;
					SyncPlacesBookmarks.addStats(stats, SyncPlacesBookmarks.SEPARATOR, null, containerTitle, index);
				}
				else {
					stats.added.separator++;
				}

				//Add the sep
				id = PlacesUtils.bookmarks.insertSeparator(container, index);
				receivedIds.push(id);
				break;

      default:
      // Unknown node type
		}

    	// set generic properties, valid for all nodes
    if (id != -1 &&
        container != PlacesUtils.tagsFolderId &&
        aGrandParentId != PlacesUtils.tagsFolderId)
		{
			if (node.annos && node.annos.length) {
				PlacesUtils.setAnnotationsForItem(id, node.annos);
			}
			//Setting annos will change the lastModified date so do this afterwards
			if (node.dateAdded && node.dateAdded > 0) PlacesUtils.bookmarks.setItemDateAdded(id, node.dateAdded);
			if (node.lastModified && node.lastModified > 0) PlacesUtils.bookmarks.setItemLastModified(id, node.lastModified);
		}

		return [folderIdMap, searchIds];
	},

  /**
   * Serializes the given node (and all its descendents) as JSON
   * and writes the serialization to the given output stream.
   *
   * @param   aNode
   *          An nsINavHistoryResultNode
   * @param   aStream
   *          An nsIOutputStream. NOTE: it only uses the write(str, len)
   *          method of nsIOutputStream. The caller is responsible for
   *          closing the stream.
   * @param   aIsUICommand
   *          Boolean - If true, modifies serialization so that each node self-contained.
   *          For Example, tags are serialized inline with each bookmark.
   * @param   aResolveShortcuts
   *          Converts folder shortcuts into actual folders.
   * @param   aExcludeItems
   *          An array of item ids that should not be written to the backup.
   */
  serializeNodeAsJSONToOutputStream: function(aNode, aStream, aIsUICommand,
                                              aResolveShortcuts,
                                              aExcludeItems) {
    function addGenericProperties(aPlacesNode, aJSNode) {
      aJSNode.title = aPlacesNode.title;
      aJSNode.id = aPlacesNode.itemId;
      if (aJSNode.id != -1) {
        var parent = aPlacesNode.parent;
        if (parent)
          aJSNode.parent = parent.itemId;
        var dateAdded = aPlacesNode.dateAdded;
        if (dateAdded)
          aJSNode.dateAdded = dateAdded;
        //If no date added then make one up and add to annotations (should be for queries only)
				else if (!PlacesUtils.nodeIsSeparator(aPlacesNode)) {
					try {
						PlacesUtils.annotations.getItemAnnotation(aJSNode.id, SyncPlacesBookmarks.SP_DATE_ADDED_ANNO);
					} catch (e) {
						PlacesUtils.annotations.setItemAnnotation(aJSNode.id, SyncPlacesBookmarks.SP_DATE_ADDED_ANNO, new Date().getTime() * 1000, 0, PlacesUtils.annotations.EXPIRE_NEVER);
					}
				}
        var lastModified = aPlacesNode.lastModified;
        if (lastModified) {
					//Fixes some weird problem where they become negative
					if (lastModified < 0)
						aJSNode.lastModified = new Date().getTime() * 1000;
					else
          	aJSNode.lastModified = lastModified;
				}

        // XXX need a hasAnnos api
        var annos = [];
        try {
          annos = PlacesUtils.getAnnotationsForItem(aJSNode.id).filter(function(anno) {
            // XXX should whitelist this instead, w/ a pref for
            // backup/restore of non-whitelisted annos
            // XXX causes JSON encoding errors, so utf-8 encode
            //anno.value = unescape(encodeURIComponent(anno.value));
            if (anno.name == SyncPlacesBookmarks.SP_LMANNO_FEEDURI)
              aJSNode.livemark = 1;
            else if (anno.name == SyncPlacesBookmarks.SP_READ_ONLY_ANNO && aResolveShortcuts) {
              // When copying a read-only node, remove the read-only annotation.
              return false;
						}
            //Helps cache hash calculations
            else if (anno.name == "bookmarkPropertiesDialog/folderLastUsed") {
							return false;
            }
            return true;
          });
        } catch(ex) {
          LOG(ex);
        }
        if (annos.length != 0) {
					annos.sort(sortAnnos);	//Helps with hash calc
          aJSNode.annos = annos;
				}
      }
      // XXXdietrich - store annos for non-bookmark items
    }

    function sortAnnos(a, b) {
			return a.name.localeCompare(b.name);
		}

    function addURIProperties(aPlacesNode, aJSNode) {
      aJSNode.type = PlacesUtils.TYPE_X_MOZ_PLACE;
      aJSNode.uri = aPlacesNode.uri;
      if (aJSNode.id && aJSNode.id != -1) {
        // harvest bookmark-specific properties
        var keyword = PlacesUtils.bookmarks.getKeywordForBookmark(aJSNode.id);
        if (keyword)
          aJSNode.keyword = keyword;
				//Add favicon uri
				try {
					var faviconURL = PlacesUtils.favicons.getFaviconForPage(SyncPlacesIO.makeURI(aJSNode.uri));
					if (faviconURL && !faviconURL.spec.match(/^http:\/\/www.mozilla.org\/2005\/made-up-favicon/)) aJSNode.favicon = faviconURL.spec;
				} catch(e) {
				}
      }

      var tags = aIsUICommand ? aPlacesNode.tags : null;
      if (tags)
        aJSNode.tags = tags;

      // last character-set
      var uri = PlacesUtils._uri(aPlacesNode.uri);
      var lastCharset = PlacesUtils.getCharsetForURI(uri);
      if (lastCharset)
        aJSNode.charset = lastCharset;
    }

    function addSeparatorProperties(aPlacesNode, aJSNode) {
      aJSNode.type = PlacesUtils.TYPE_X_MOZ_PLACE_SEPARATOR;

      //Tidy up corrupt entries
      if (!aJSNode.dateAdded || aJSNode.dateAdded <= 0)
      	aJSNode.dateAdded = new Date().getTime() * 1000;
      if (aJSNode.lastModified)
      	delete aJSNode.lastModified;
    }

    function addContainerProperties(aPlacesNode, aJSNode) {
      // saved queries
      var concreteId = PlacesUtils.getConcreteItemId(aPlacesNode);
      if (concreteId != -1) {
        // This is a bookmark or a tag container.
				if (PlacesUtils.nodeIsQuery(aPlacesNode) ||
						(concreteId != aPlacesNode.itemId && !aResolveShortcuts)) {
					aJSNode.type = PlacesUtils.TYPE_X_MOZ_PLACE;
					aJSNode.uri = aPlacesNode.uri;
					// folder shortcut
					if (aIsUICommand)
						aJSNode.concreteId = concreteId;
				}
				else { // Bookmark folder or a shortcut we should convert to folder.
					aJSNode.type = PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER;

					// Mark root folders.
					if (aJSNode.id == PlacesUtils.bookmarks.placesRoot)
						aJSNode.root = "placesRoot";
					else if (aJSNode.id == PlacesUtils.bookmarks.bookmarksMenuFolder)
						aJSNode.root = "bookmarksMenuFolder";
					else if (aJSNode.id == PlacesUtils.bookmarks.tagsFolder)
						aJSNode.root = "tagsFolder";
					else if (aJSNode.id == PlacesUtils.bookmarks.unfiledBookmarksFolder)
						aJSNode.root = "unfiledBookmarksFolder";
					else if (aJSNode.id == PlacesUtils.bookmarks.toolbarFolder)
						aJSNode.root = "toolbarFolder";
				}
			}
      else {
        // This is a grouped container query, generated on the fly.
        aJSNode.type = self.TYPE_X_MOZ_PLACE;
        aJSNode.uri = aPlacesNode.uri;
      }
    }

    function writeScalarNode(aStream, aNode, aPrevWritten) {
      // serialize to json
      var jstr = JSON.stringify(aNode);

			// AndyH fix to prevent trailing comma
			if (aPrevWritten) jstr = "," + jstr;

      // write to stream
      aStream.write(jstr, jstr.length);
    }

		// AndyH contains my fixes to prevent trailing comma
		// See note in PlacesUtils.jsm - should really upgrade to latest way of doing things
    function writeComplexNode(aStream, aNode, aSourceNode, aPrevWritten) {
			function asContainer(container) {
				return container.QueryInterface(Components.interfaces.nsINavHistoryContainerResultNode);
			}

      var escJSONStringRegExp = /(["\\])/g;
      // write prefix
      var properties = [];
      for (let [name, value] in Iterator(aNode)) {
        if (name == "annos")
          value = JSON.stringify(value);
        else if (typeof value == "string")
          value = "\"" + value.replace(escJSONStringRegExp, '\\$1') + "\"";
        properties.push("\"" + name.replace(escJSONStringRegExp, '\\$1') + "\":" + value);
      }
      var jStr = "{" + properties.join(",") + ",\"children\":[";
			if (aPrevWritten) jStr = "," + jStr;
      aStream.write(jStr, jStr.length);

      // write child nodes
      if (!aNode.livemark) {
        asContainer(aSourceNode);
        var wasOpen = aSourceNode.containerOpen;
        if (!wasOpen)
          aSourceNode.containerOpen = true;
        var cc = aSourceNode.childCount;
				var prevWritten = false;
        for (var i = 0; i < cc; ++i) {
          var childNode = aSourceNode.getChild(i);
          if (aExcludeItems && aExcludeItems.indexOf(childNode.itemId) != -1)
            continue;
          if (serializeNodeToJSONStream(childNode, i, prevWritten)) prevWritten = true;
        }
        if (!wasOpen)
          aSourceNode.containerOpen = false;
      }

      // write suffix
      aStream.write("]}", 2);
    }

    function serializeNodeToJSONStream(bNode, aIndex, aPrevWritten) {
      var node = {};

      // set index in order received
      // XXX handy shortcut, but are there cases where we don't want
      // to export using the sorting provided by the query?
      if (aIndex)
        node.index = aIndex;

      addGenericProperties(bNode, node);

      var parent = bNode.parent;
      var grandParent = parent ? parent.parent : null;

      if (PlacesUtils.nodeIsURI(bNode)) {
        // Tag root accept only folder nodes
        if (parent && parent.itemId == PlacesUtils.tagsFolderId)
          return false;
        // Check for url validity, since we can't halt while writing a backup.
        // This will throw if we try to serialize an invalid url and it does
        // not make sense saving a wrong or corrupt uri node.
        try {
          PlacesUtils._uri(bNode.uri);
        } catch (ex) {
          return false;
        }
        addURIProperties(bNode, node);
      }
      else if (PlacesUtils.nodeIsContainer(bNode)) {
        // Tag containers accept only uri nodes
        if (grandParent && grandParent.itemId == PlacesUtils.tagsFolderId)
          return false;
        addContainerProperties(bNode, node);
			}
      else if (PlacesUtils.nodeIsSeparator(bNode)) {
        // Tag root accept only folder nodes
        // Tag containers accept only uri nodes
        if ((parent && parent.itemId == PlacesUtils.tagsFolderId) ||
            (grandParent && grandParent.itemId == PlacesUtils.tagsFolderId))
          return false;

        addSeparatorProperties(bNode, node);
			}

      if (!node.feedURI && node.type == PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER)
        writeComplexNode(aStream, node, bNode, aPrevWritten);
      else
        writeScalarNode(aStream, node, aPrevWritten);
      return true;
    }

    // serialize to stream
    serializeNodeToJSONStream(aNode, null, false);
  }
};
