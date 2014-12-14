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

//Backup all local bookmarks into local file
function SyncPlacesXBELOut(backupFilePath, checkSubFolder, timeout) {
	//Add everything to top level
	function buildXbel(container, parentTag, smallXbel, syncFolderID) {
		function asContainer(container) {
			return container.QueryInterface(Components.interfaces
																						.nsINavHistoryContainerResultNode);
		}

		//START HERE
		var title = container.title;
		var id = container.itemId;
		var ignoreFolder = false;

		//Is it a real folder or a link?
		if (PlacesUtils.getConcreteItemId(container) != id) {
			addBookmark(container, parentTag, smallXbel, syncFolderID);
			return;
		}
		else if (id == PlacesUtils.bookmarksMenuFolderId ||
						 id == PlacesUtils.placesRootId || id == syncFolderID)
		{
			ignoreFolder = true;
		}
		else if (id == PlacesUtils.tagsFolderId) {
			//Ignore tagsFolder when exporting for non-SyncPlaces use
			if (smallXbel) return;
			title = PlacesUtils.bookmarks.getItemTitle(id);
		}
		else if (id == PlacesUtils.unfiledBookmarksFolderId)
			title = PlacesUtils.bookmarks.getItemTitle(id);
		else if (id == PlacesUtils.toolbarFolderId)
			title = PlacesUtils.bookmarks.getItemTitle(id);

		//Add the folder
		var folderTag = null;
		//Throw away BM/PlacesRoot folders - add it's subfolders directly to top level for BSS compat
		if (ignoreFolder) {
			folderTag = parentTag;
		}
		else {
			var folderTag = xbeloutDoc.createElement("folder");
			if (!smallXbel) {
				folderTag.setAttribute("id", 'row' + id);
				addTime(container.dateAdded, 'added', folderTag);
			}
			addTitle(title, folderTag);
			if (!smallXbel) {
				addAnnos(id, null, folderTag, syncFolderID, container.dateAdded, container.lastModified);
			}
			addDescription(id, folderTag);
			parentTag.appendChild(folderTag);
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
			//What type of item?
			var child = container.getChild(i);

			if (PlacesUtils.nodeIsQuery(child) || PlacesUtils.nodeIsBookmark(child) || PlacesUtils.nodeIsLivemarkContainer(child)) {
				addBookmark(child, folderTag, smallXbel, syncFolderID);
			}
			else if (PlacesUtils.nodeIsSeparator(child)) {
				var sep = xbeloutDoc.createElement("separator");
				folderTag.appendChild(sep);
			}
			else if (PlacesUtils.nodeIsFolder(child)) {
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
				buildXbel(child, folderTag, smallXbel, syncFolderID);
			}
		}

		//Close the current container
		asContainer(container).containerOpen = false;
	}

	function addBookmark(node, parentTag, smallXbel, syncFolderID) {
		//Ignore place: hrefs when exporting for other uses (including livemarks)
		if (smallXbel && node.uri.match(/^place:/)) return;

		var bookmark = xbeloutDoc.createElement('bookmark');
		if (!smallXbel) {
			bookmark.setAttribute('id', 'row' + node.itemId);
			addTime(node.dateAdded, 'added', bookmark);
			addTime(node.time, 'visited', bookmark);
			addTime(node.lastModified, 'modified', bookmark);
		}
		var uri = node.uri;
		addTitle(node.title, bookmark);
		if (!smallXbel) {
			uri = addAnnos(node.itemId, uri, bookmark, syncFolderID, node.dateAdded, node.lastModified);
		}
		bookmark.setAttribute('href', uri);
		addDescription(node.itemId, bookmark);
		parentTag.appendChild(bookmark);
	}

	function addTime(prtime, text, parentTag) {
		/*
		 * From http://www.w3.org/TR/NOTE-datetime
		 * YYYY-MM-DDThh:mm:ss.s
		 */
		function formatTime(prtime) {
			var date = new Date(prtime/1000);
			return date.getUTCFullYear() + "-" + pad(date.getMonth()+1, 2) + "-" + pad(date.getUTCDate(), 2) + "T" + pad(date.getUTCHours(), 2) + ":" + pad(date.getUTCMinutes(), 2) + ":" + pad(date.getUTCSeconds(), 2) + "." + pad(date.getUTCMilliseconds(), 3);

			function pad(datetime, numzeroes) {
				var padded = "" + datetime;
				while (padded.length < numzeroes) {
					padded = "0" + padded;
				}
				return padded;
			}
		}

		//START HERE
		if (prtime && prtime > 0) {
			parentTag.setAttribute(text, formatTime(prtime));
		}
	}

	function addTitle(text, parentTag) {
		var title = xbeloutDoc.createElement("title");
		var pcData = xbeloutDoc.createTextNode(text);
		title.appendChild(pcData);
		parentTag.appendChild(title);
	}

	function addDescription(id, parentTag) {
		var description = "";
		try {
			var annos = PlacesUtils.getAnnotationsForItem(id);
			if (annos) {
				annos.forEach(function(anno) {
					if (anno.name == SyncPlacesBookmarks.SP_DESCRIPTION_ANNO) {
						description = anno.value;
					}
				});
			}
		} catch(e) {
		}

		if (description && description.length > 0) {
			var desc = xbeloutDoc.createElement("desc");
			var pcData = xbeloutDoc.createTextNode(description);
			desc.appendChild(pcData);
			parentTag.appendChild(desc);
		}
	}

	function addAnnos(id, uri, parentTag, syncFolderID, dateAdded, lastModified) {
    function sortAnnos(a, b) {
			return a.name.localeCompare(b.name);
		};

		//START HERE
		try {
			var metadata = xbeloutDoc.createElement("metadata");
			metadata.setAttribute("owner", "Mozilla");

			//Add dates as annos (because lastModified not part of spec + can preserve microseconds)
			if (dateAdded && dateAdded > 0) {
				metadata.setAttribute("dateadded", dateAdded);
				if (lastModified && lastModified > 0)
					metadata.setAttribute("lastmodified", lastModified);
				//If there's an added date then there should be a positive lastModified date (except for separators)
				//Gets around some of them being negative
				else
					metadata.setAttribute("lastmodified", new Date().getTime() * 1000);
			}

			//If no date added then make one up and add to annotations
			if (dateAdded == 0) {
				try {
					PlacesUtils.annotations.getItemAnnotation(id, SyncPlacesBookmarks.SP_DATE_ADDED_ANNO);
				} catch (e) {
					PlacesUtils.annotations.setItemAnnotation(id, SyncPlacesBookmarks.SP_DATE_ADDED_ANNO, new Date().getTime() * 1000, 0, PlacesUtils.annotations.EXPIRE_NEVER)
				}
			}

			//Creating a guid will also add an anno, so do it here before dealing with annos
			if (uri	&& uri.match(/^place:/)) PlacesUtils.bookmarks.getItemGUID(id);

			//Annos
			var livemarkURI = null;
			var sidebarAnno = false;
			var annos = PlacesUtils.getAnnotationsForItem(id).filter(function(anno) {
				//Ignore descriptions cos already done
				if (anno.name == SyncPlacesBookmarks.SP_DESCRIPTION_ANNO) {
					return false;
				}
				//Helps cache hash calculations if we skip this
				else if (anno.name == "bookmarkPropertiesDialog/folderLastUsed") {
					return false;
				}
				return true;
      });
			if (annos && annos.length) {
				annos.sort(sortAnnos);	//Helps with hash calc

				var count = 1;
				annos.forEach(function(anno) {
					if (anno.name == SyncPlacesBookmarks.SP_LMANNO_FEEDURI) livemarkURI = anno.value;
					if (anno.name == SyncPlacesBookmarks.SP_LMANNO_SITEURI) uri = anno.value;
					if (anno.name == SyncPlacesBookmarks.SP_LOAD_IN_SIDEBAR_ANNO) sidebarAnno = true;

					metadata.setAttribute('name' + count, anno.name);
					metadata.setAttribute('flags' + count, anno.flags);
					metadata.setAttribute('expires' + count, anno.expires);
					metadata.setAttribute('mimeType' + count, anno.mimeType);
					metadata.setAttribute('type' + count, anno.type);
					metadata.setAttribute('value' + count, anno.value);
					count++;
				});
				metadata.setAttribute("count", count-1);
			}

			//Bookmark and not folder
			if (uri) {
				//Add keyword if exists
				var keyword = PlacesUtils.bookmarks.getKeywordForBookmark(id);
				if (keyword) {
					metadata.setAttribute("ShortcutURL", keyword);	//Use old name for backwards compat.
				}

				//Add any tags - only if syncing on subfolder - otherwise all the info is in the tagsFolder
				if (syncFolderID) {
					var tags = PlacesUtils.tagging.getTagsForURI(SyncPlacesIO.makeURI(uri), {});
					if (tags.length) {
						metadata.setAttribute("tags", tags);
					}
				}

				//Add favicon uri
				try {
					var faviconURL = PlacesUtils.favicons.getFaviconForPage(SyncPlacesIO.makeURI(uri));
					if (faviconURL && !faviconURL.spec.match(/^http:\/\/www.mozilla.org\/2005\/made-up-favicon/))
						metadata.setAttribute("favicon", faviconURL.spec);
				} catch(e) {
				}

				//For backwards compatibility
				if (livemarkURI) metadata.setAttribute("FeedURL" ,livemarkURI);
				if (sidebarAnno) metadata.setAttribute("WebPanel" , "true");

				//Add GUID for queries
				if (uri.match(/^place:/)) {
		    	metadata.setAttribute("guid", PlacesUtils.bookmarks.getItemGUID(id));
				}
			}

			var info = xbeloutDoc.createElement("info");
			info.appendChild(metadata);
			parentTag.appendChild(info);

		} catch(e) {
		}
		return uri;
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
	if (syncFolderID == PlacesUtils.placesRootId) {
		syncFolderID = null;
	}
	//If something wrong with the folder (eg doesnt exist) then abort
	else if (!SyncPlacesBookmarks.checkSyncFolder(syncFolderID, timeout)) {
		return false;
	}

	//Do the query
	var options = PlacesUtils.history.getNewQueryOptions();
	var query = PlacesUtils.history.getNewQuery();
	query.setFolders([syncFolderID ? syncFolderID : PlacesUtils.placesRootId], 1);
	var result = PlacesUtils.history.executeQuery(query, options);

	//Set up the xml document
	var doctype=document.implementation.createDocumentType("xbel", "+//IDN python.org//DTD XML Bookmark Exchange Language 1.0//EN//XML", "http://pyxml.sourceforge.net/topics/dtds/xbel-1.0.dtd");
	var xbeloutDoc = document.implementation.createDocument("", "xbel", doctype);
	var xbelElement = xbeloutDoc.documentElement;
	var smallXbel = SyncPlacesOptions.prefs.getBoolPref("small_xbel");

	if (!smallXbel) {
		var id = PlacesUtils.bookmarksMenuFolderId;
		if (syncFolderID) {
			id = syncFolderID;
			xbelElement.setAttribute("id", 'row' + id);
			addTime(PlacesUtils.bookmarks.getItemDateAdded(id), 'added', xbelElement);
			var metadata = xbeloutDoc.createElement("metadata");
			metadata.setAttribute("owner", "Mozilla");
			metadata.setAttribute("SyncPlaces", "true");
		}
		else {
			var metadata = xbeloutDoc.createElement("metadata");
			metadata.setAttribute("owner", "Mozilla");
			metadata.setAttribute("SyncPlaces", "true");
			metadata.setAttribute("BookmarksToolbarFolder", "row" + PlacesUtils.toolbarFolderId);	//Make it backwards compat. with BSS
			metadata.setAttribute("UnfiledBookmarksFolder", "row" + PlacesUtils.unfiledBookmarksFolderId);
			metadata.setAttribute("TagsFolder", "row" + PlacesUtils.tagsFolderId);
			metadata.setAttribute("dateadded", PlacesUtils.bookmarks.getItemDateAdded(id));
			metadata.setAttribute("lastmodified", PlacesUtils.bookmarks.getItemLastModified(PlacesUtils.bookmarksMenuFolderId));
		}
		var info = xbeloutDoc.createElement("info");
		info.appendChild(metadata);
		xbelElement.appendChild(info);
		addTitle(PlacesUtils.bookmarks.getItemTitle(id), xbelElement);
	}

	//Create the xml
	buildXbel(result.root, xbelElement, smallXbel, syncFolderID);

	//Check additional tags are valid
	var styleTags = SyncPlacesOptions.getComplex("style_tags");
	if (!SyncPlacesOptions.realCheckTags(styleTags)) styleTags = "";

	//Save locally
	var serializer= new XMLSerializer();
	var xbelData = '<?xml version="1.0" encoding="UTF-8"?>\n' + styleTags + serializer.serializeToString(xbeloutDoc);
	SyncPlacesIO.saveFilePath(backupFilePath, xbelData);
	xbeloutDoc = null;
	return true;
}