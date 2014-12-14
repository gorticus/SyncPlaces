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

function SyncPlacesXBELIn(filePath, timeout) {
	function makeTopNodes(nodes, bmnode, dateAdded, lastModified) {
		//Create my own placesRoot
		nodes.id = PlacesUtils.placesRootId;
		nodes.title = "";
		nodes.type = PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER;
		nodes.root = "placesRoot";

		//And my own bookmarksMenu node to put everything in
		bmnode.id = PlacesUtils.bookmarksMenuFolderId;
		bmnode.title = "";
		bmnode.type = PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER;
		bmnode.root = "bookmarksMenuFolder";
		bmnode.parent = nodes.id;
		if (dateAdded) bmnode.dateAdded = parseInt(dateAdded, 10);
		if (lastModified) bmnode.lastModified = parseInt(lastModified, 10);
		return bmnode.id;
	}

	function validSubFolder(nodes, syncFolderID, timeout) {
		//Not a BSS/PlaceSync subfolder
		if (!nodes.id) {
			//So default to adding everything into subfolder
			if (syncFolderID) {
				nodes.id = syncFolderID;
				if (!nodes.title) nodes.title = PlacesUtils.bookmarks.getItemTitle(syncFolderID);
				nodes.type = PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER;
			}
			else {
				SyncPlacesOptions.alert2(null, 'select_subfolder', null, timeout,
					"http://www.andyhalford.com/syncplaces/options.html#general");
				return null;
			}
		}
		return nodes.id;
	}

	function validXbel(dom) {
		try {
			return (dom.documentElement &&
	        		dom.documentElement.nodeName != "parsererror" &&
	        		dom.documentElement.nodeName.toLowerCase() == "xbel");

		} catch (exception) {
			return false;
		}
	}

	function unwrapXBEL(jsnode, folder, folderID, syncplaces) {
		unwrapFolder(jsnode, folder, folderID, syncplaces);

		var childNodes = folder.childNodes;
		if (childNodes.length) {
			var children = [];
			var index = 0;
			for (var i = 0; i < childNodes.length; i++) {
				var element = childNodes[i];
				if (element.nodeType == 1) {
					var childJSNode = {};
					childJSNode.index = index;
					if (folderID) childJSNode.parent = folderID;
					switch (element.nodeName.toLowerCase()) {
						case "separator":
							childJSNode.title = "";
							childJSNode.type = PlacesUtils.TYPE_X_MOZ_PLACE_SEPARATOR;
	 						childJSNode.dateAdded = new Date().getTime() * 1000;	//Set to 'now'
							children.push(childJSNode);
							index++;
						break;

						case "bookmark":
							if (syncplaces) childJSNode.id = element.getAttribute("id").substr(3);
							unwrapBookmark(childJSNode, element, syncplaces);
							children.push(childJSNode);
							index++;
						break;

						case "folder":
							if (syncplaces) childJSNode.id = element.getAttribute("id").substr(3);
							unwrapXBEL(childJSNode, element, syncplaces ? childJSNode.id : null, syncplaces);
							children.push(childJSNode);
							index++;
						break;
					}
				}
			}
			jsnode.children = children;
		}
	}

	function unwrapFolder(jsnode, element, id, syncplaces) {
		addCommonProperties(jsnode, element, syncplaces, null);

		jsnode.type = PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER;

		//Special folders
		if (id) {
			if (id == PlacesUtils.placesRootId) {
				jsnode.root = "placesRoot";
				jsnode.title = "";
			}
			else if (jsnode.id == PlacesUtils.bookmarksMenuFolderId) {
				jsnode.root = "bookmarksMenuFolder";
			}
			else if (jsnode.id == PlacesUtils.tagsFolderId) {
				jsnode.root = "tagsFolder";
			}
			else if (jsnode.id == PlacesUtils.unfiledBookmarksFolderId) {
				jsnode.root = "unfiledBookmarksFolder";
			}
			else if (jsnode.id == PlacesUtils.toolbarFolderId) {
				jsnode.root = "toolbarFolder";
			}
		}
	}

	function unwrapBookmark(jsnode, element, syncplaces) {
		jsnode.type = PlacesUtils.TYPE_X_MOZ_PLACE;	//Do it before common, cos livemark is a container!

		//if no href then it's invalid XBEL (will throw exception here)
		jsnode.uri = element.getAttribute("href");
		var uri = SyncPlacesIO.makeURI(jsnode.uri);

		addCommonProperties(jsnode, element, syncplaces, uri);
	}

	function addCommonProperties(jsnode, element, syncplaces, uri) {
	  var childNodes = element.childNodes;
		var annos = [];
		for (var i = 0; i < childNodes.length; i++) {
			var childElement = childNodes[i];
			if (childElement.nodeType == 1) {
				switch (childElement.nodeName.toLowerCase()) {
					case "title":
						jsnode.title = getPCDATA(childElement);
					break;

					case "desc":
						var description = getPCDATA(childElement);
						if (description && description.length > 0) {
							var anno = {};
							anno.name = SyncPlacesBookmarks.SP_DESCRIPTION_ANNO;
							anno.flags = 0;
							anno.expires = Ci.nsIAnnotationService.EXPIRE_NEVER;
							anno.mimeType = null;
							anno.type = Ci.nsIAnnotationService.TYPE_STRING;
							anno.value = description;
							annos.push(anno);
						}
					break;

					case "info":
						var metadata = getMetaData(childElement);
						if (metadata) {
							if (syncplaces) {
								var count = parseInt(metadata.getAttribute("count"), 10);
								for (var j = 1; j < count+1; j++) {
									var anno = {};
									anno.name = metadata.getAttribute("name" + j);
									if (anno.name == SyncPlacesBookmarks.SP_LMANNO_FEEDURI) {
										jsnode.livemark = 1;
										jsnode.type = PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER;
										jsnode.children = [];
									}
									if (anno.name == SyncPlacesBookmarks.SP_DESCRIPTION_ANNO) continue;	//skip the description - already got it
									anno.flags = parseInt(metadata.getAttribute("flags" + j), 10);
									anno.expires = parseInt(metadata.getAttribute("expires" + j), 10);
									anno.mimeType = metadata.getAttribute("mimeType" + j);
									anno.type = parseInt(metadata.getAttribute("type" + j), 10);
									anno.value = metadata.getAttribute("value" + j);
									annos.push(anno);
								}

								var keyword = metadata.getAttribute("ShortcutURL");
								if (keyword) jsnode.keyword = keyword;
								var dateAdded = metadata.getAttribute("dateadded");
								if (dateAdded) jsnode.dateAdded = parseInt(dateAdded, 10);
								var lastModified = metadata.getAttribute("lastmodified");
								if (lastModified) jsnode.lastModified = parseInt(lastModified, 10);
								var tags = metadata.getAttribute("tags");	//For subfolders only
								if (tags) {
									var tagArray = tags.split(",");
									for (var j = 0; j < tagArray.length; j++) {
										var anno = {};

										anno.name = SyncPlacesBookmarks.SP_TAG + j;
										anno.flags = 0;
										anno.expires = Ci.nsIAnnotationService.EXPIRE_SESSION;	//Going to get rid asap
										anno.mimeType = null;
										anno.type = Ci.nsIAnnotationService.TYPE_STRING;
										anno.value = tagArray[j];
										annos.push(anno);
									}
								}

								if (SyncPlacesOptions.prefs.getBoolPref("sync_icons")) {
									var faviconURL = metadata.getAttribute("favicon");
									if (faviconURL) {
										try {
											PlacesUtils.favicons.setAndLoadFaviconForPage(uri, SyncPlacesIO.makeURI(faviconURL), false);
										} catch(e) {
										}
									}
								}

								//Set GUID for queries
								var guid = metadata.getAttribute("guid");
								if (guid && jsnode.uri && jsnode.uri.substr(0, 6) == "place:")
									jsnode.guid = guid;
							}

							//BSS/PlaceSync
							else if (metadata.getAttribute("owner") == "Mozilla") {
								var keyword = metadata.getAttribute("ShortcutURL");
								if (keyword) jsnode.keyword = keyword;

								//Livemark
								var feedURL = metadata.getAttribute("FeedURL");
								if (feedURL) {
									jsnode.livemark = 1;
									jsnode.type = PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER;
									jsnode.children = [];
									var anno1 = {};
									anno1.name = SyncPlacesBookmarks.SP_LMANNO_SITEURI;
									anno1.flags = 0;
									anno1.expires = Ci.nsIAnnotationService.EXPIRE_NEVER;
									anno1.mimeType = null;
									anno1.type = Ci.nsIAnnotationService.TYPE_STRING;
									anno1.value = element.getAttribute("href");
									annos.push(anno1);
									var anno2 = {};
									anno2.name = SyncPlacesBookmarks.SP_LMANNO_FEEDURI;
									anno2.flags = 0;
									anno2.expires = Ci.nsIAnnotationService.EXPIRE_NEVER;
									anno2.mimeType = null;
									anno2.type = Ci.nsIAnnotationService.TYPE_STRING;
									anno2.value = feedURL;
									annos.push(anno2);
									var anno3 = {};
									anno3.name = "placesInternal/READ_ONLY";
									anno3.flags = 0;
									anno3.expires = Ci.nsIAnnotationService.EXPIRE_NEVER;
									anno3.mimeType = null;
									anno3.type = Ci.nsIAnnotationService.TYPE_INT32;
									anno3.value = 1;
									annos.push(anno3);
									var anno4 = {};
									anno4.name = "livemark/loadfailed";
									anno4.flags = 0;
									anno4.expires = Ci.nsIAnnotationService.EXPIRE_NEVER;
									anno4.mimeType = null;
									anno4.type = Ci.nsIAnnotationService.TYPE_INT32;
									anno4.value = 1;
									annos.push(anno4);
								}

								//Sidebar anno
								var sidebarAnno = metadata.getAttribute("WebPanel");
								if (sidebarAnno) {
									var anno = {};
									anno.name == SyncPlacesBookmarks.SP_LOAD_IN_SIDEBAR_ANNO;
									anno.flags = 0;
									anno.expires = Ci.nsIAnnotationService.EXPIRE_NEVER;
									anno.mimeType = null;
									anno.type = Ci.nsIAnnotationService.TYPE_INT32;
									anno.value = 1;
									annos.push(anno);
								}
							}
						}
					break;
				}
			}
		}
		if (annos.length) jsnode.annos = annos;

		//If no metadata date, then get dates from attributes
		//Except if query cos queries don't have dates
		if (!jsnode.dateAdded && !(uri && (uri.spec.substr(0, 6) == "place:"))) {
			var addedTime = addDate(jsnode, element, "added");
			addDate(jsnode, element, "modified", addedTime);
		}
	}

	function getMetaData(element) {
		var metadata = null;
		var childNodes = element.childNodes;
		if (childNodes) {
			for (var i = 0; i < childNodes.length; i++) {
				var element = childNodes[i];
				if (element.nodeType == 1 && element.nodeName.toLowerCase() == "metadata") {
					metadata = element;
					break;
				}
			}
		}
		return metadata;
	}

	function getPCDATA(element) {
		var pcdata = "";
		var childNodes = element.childNodes;
		for (var i = 0; i < childNodes.length; i++) {
			if (childNodes[i].nodeType != 1)
				pcdata += childNodes[i].nodeValue;
		}
		return pcdata;
	}

	//Always adds a date: from element, or defaultTime provided, or current time
	function addDate(jsnode, element, type, defaultTime) {
		var dateStr = element.getAttribute(type);
		var prtime;
		if (dateStr) {
			var theDate = new Date();
			theDate.setUTCFullYear(parseInt(dateStr.substring(0,4), 10), parseInt(dateStr.substring(5,7), 10) - 1, parseInt(dateStr.substring(8,10), 10));
			theDate.setUTCHours(parseInt(dateStr.substring(11,13), 10), parseInt(dateStr.substring(14,16), 10), parseInt(dateStr.substring(17,19), 10), parseInt(dateStr.substring(20), 10));
			prtime = theDate.getTime() * 1000;
		}
		else if (defaultTime) {
			prtime = defaultTime;
		}
		else {
			prtime = new Date().getTime() * 1000;	//Use current timestamp
		}

		if (type == "added")
			jsnode.dateAdded = prtime
		else
			jsnode.lastModified = prtime;

		return prtime;
	}

	//START HERE
	var Ci = Components.interfaces;

	//Read in the file
	var bookmarks = null;
	try {
		bookmarks = SyncPlacesIO.readFile(filePath);

	} catch (exception) {
		SyncPlacesOptions.alert2(exception, 'cant_read_bookmarks', null, timeout);
		return false;
	}

	//Parse it and check that it's XML/XBEL
	var domParser=new DOMParser();
	var dom = domParser.parseFromString(bookmarks, "text/xml");
	if (!validXbel(dom)) {
		SyncPlacesOptions.alert2(null, 'invalid_xml', null, timeout,
						"http://www.andyhalford.com/syncplaces/support.html#bookmarks");
		return false;
	}

	//If importing into a subfolder then get the folder ID
	var syncFolderID = null;
	if (!SyncPlacesOptions.prefs.getBoolPref("sendall")) {
		try {
			syncFolderID = SyncPlacesOptions.prefs.getIntPref("bookmarkFolderID");

		} catch(exception) {
			syncFolderID = null;
		}
	}

	//If sync'ing on subfolder, check everything okay
	if (syncFolderID && !SyncPlacesBookmarks.checkSyncFolder(syncFolderID, timeout)) return false;

	//Now convert the xml doc into nodes and then run the normal import so get all merge, subfolder etc features for free
	var nodes = {};
	try {
		var childNodes = dom.documentElement.childNodes;
		if (childNodes.length) {
			var toolbarID = "";
			var unfiledID = "";
			var tagsID = "";
			var bmnode = {};
			var nodesChildren = [];
			var syncplaces = false;
			var parentID = null;
			var children = [];
			var index = 0;
			for (var i = 0; i < childNodes.length; i++) {
				var element = childNodes[i];
				if (element.nodeType == 1) {
					var childJSNode = {};
					childJSNode.index = index;
					switch (element.nodeName.toLowerCase()) {
						case "desc":
						case "alias":
						break;

						case "title":
							//Don't test for "" because makeTopNodes() uses ""
							if (nodes.title == null) nodes.title = getPCDATA(element);
						break;

						case "separator":
							parentID = validSubFolder(nodes, syncFolderID, timeout);
							if (!parentID) return false;
							childJSNode.title = "";
							childJSNode.type = PlacesUtils.TYPE_X_MOZ_PLACE_SEPARATOR;
 						  childJSNode.dateAdded = new Date().getTime() * 1000;	//Set to 'now'
							childJSNode.parent = parentID;
							children.push(childJSNode);
							index++;
						break;

						//Look for SyncPlaces/BSS/PlaceSync XBEL to decide how to parse it
						case "info":
							var metadata = getMetaData(element);
							if (metadata) {
								var owner = metadata.getAttribute("owner");
								if (owner && owner == "Mozilla") {
									toolbarID = metadata.getAttribute("BookmarksToolbarFolder");
									unfiledID = metadata.getAttribute("UnfiledBookmarksFolder");

									//SyncPlaces
									if (metadata.getAttribute("SyncPlaces")) {
										syncplaces = true;

										//If only subfolder, then the toolbarID will be missing
										//Otherwise pick up the rest of the info
										if (toolbarID) {
											tagsID = metadata.getAttribute("TagsFolder");

											//Dates of BMMenu folder
											var dateAdded = metadata.getAttribute("dateadded");
											var lastModified = metadata.getAttribute("lastmodified");

											//Create rest of top level nodes
											parentID = makeTopNodes(nodes, bmnode, dateAdded, lastModified);
										}
									}

									//BSS/PlaceSync
									else {
										toolbarID = toolbarID.replace(/:/g,"%3A");	//Colons not allowed in ids so BSS encoded them
										if (unfiledID) unfiledID = unfiledID.replace(/\%3A/g,":");

										//Create top level nodes
										parentID = makeTopNodes(nodes, bmnode);
									}
								}

								//Else an ordinary XBEL file with a different info
								//So default to adding everything into subfolder
								else if (!validSubFolder(nodes, syncFolderID, timeout)) {
									return false;
								}
							}
						break;

						case "folder":
							//If importing all bookmarks
							if (toolbarID) {
								var folderID = element.getAttribute("id");
								if (toolbarID == folderID) {
									childJSNode.id = PlacesUtils.toolbarFolderId;
									unwrapXBEL(childJSNode, element, childJSNode.id, syncplaces);
									childJSNode.parent = nodes.id;
									nodesChildren.push(childJSNode);
								}
								else if (unfiledID && unfiledID == folderID) {
									childJSNode.id = PlacesUtils.unfiledBookmarksFolderId;
									unwrapXBEL(childJSNode, element, childJSNode.id, syncplaces);
									childJSNode.parent = nodes.id;
									nodesChildren.push(childJSNode);
								}
								else if (tagsID && tagsID == folderID) {
									childJSNode.id = PlacesUtils.tagsFolderId;
									unwrapXBEL(childJSNode, element, childJSNode.id, syncplaces);
									childJSNode.parent = nodes.id;
									nodesChildren.push(childJSNode);
								}
								//Bookmarks Menu subfolder
								else {
									if (syncplaces) childJSNode.id = element.getAttribute("id").substr(3);
									unwrapXBEL(childJSNode, element, syncplaces ? childJSNode.id : null, syncplaces);
									childJSNode.parent = parentID;
									children.push(childJSNode);
								}
							}
							//If just importing a subfolder
							else {
								parentID = validSubFolder(nodes, syncFolderID, timeout);
								if (!parentID) return false;
								unwrapXBEL(childJSNode, element, syncplaces ? nodes.id : null, syncplaces);
								childJSNode.parent = parentID;
								children.push(childJSNode);
							}
						index++;
						break;

						case "bookmark":
							parentID = validSubFolder(nodes, syncFolderID, timeout);
							if (!parentID) return false;
							unwrapBookmark(childJSNode, element, syncplaces);
							childJSNode.parent = parentID;
							children.push(childJSNode);
							index++;
						break;
					}
				}
			}

			//Whose kids?
			if (toolbarID && !syncFolderID) {
				bmnode.children = children;
				nodesChildren.push(bmnode);
				nodes.children = nodesChildren;
			}
			else {
				nodes.children = children;
			}
		}
		else {
			SyncPlacesOptions.alert2(null, 'nothing_to_import', null, timeout,
						"http://www.andyhalford.com/syncplaces/support.html#bookmarks");
			return false;
		}

	} catch (exception) {
		SyncPlacesOptions.alert2(exception, 'invalid_xbel', null, timeout);
		return false;
	}

	//Write out the json file so can import it properly
	var jstr = PlacesUtils.toJSONString(nodes);
	SyncPlacesIO.saveFile(SyncPlaces.xbelJsonFile, jstr);
	return true;
}
