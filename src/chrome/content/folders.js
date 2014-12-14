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

var SyncPlacesFolders = {
	onFolderLoad: function() {
		//Get the currently selected Folder ID
		var currentID = null;
		if (window.arguments) {
			currentID = window.arguments[0].inn.currentID;
		}

		//Populate the browser tree
		var options = PlacesUtils.history.getNewQueryOptions();
		options.excludeItems = true;
		options.excludeQueries = true;
		options.excludeReadOnlyFolders = true;
		var query = PlacesUtils.history.getNewQuery();
		query.setFolders([PlacesUtils.placesRootId], 1);

		//Populate the tree
		var tree = document.getElementById("folders");
		tree.place = PlacesUtils.history.queriesToQueryString([query], 1, options);

		//Highlight the current selection
		if (currentID && currentID > 0) {
			//Get the path to the current selection
			var parents = [];
			var parent = currentID;
			try {
				do {
					parent = PlacesUtils.bookmarks.getFolderIdForItem(parent);
					parents.push(parent);
				} while (parent != PlacesUtils.placesRootId);
			} catch(e) {} //getFolderIdForItem() fails when swap top level folders??

			//Go down the tree opening up the parent folders
			var currentRow = 0;
			for (var i = 0; i < tree.view.rowCount; i++) {
				//Select the row so I can get at it's id to see if it's a parent
				tree.view.selection.select(i);
				var id = tree.selectedNode.itemId;

				//If it's the final thing, save it
				if (id == currentID) currentRow = i;

				//If it's a parent open it
				var isParent = false;
				for (var j=0; j<parents.length; j++) {
					if (id == parents[j]) isParent = true;
				}
				if (isParent && !tree.view.isContainerOpen(i)) tree.view.toggleOpenState(i);
				else if (!isParent && tree.view.isContainerOpen(i)) tree.view.toggleOpenState(i);
			}

			//Select after messing around otherwise the selection gets changed
			tree.view.selection.select(currentRow);
		}
	},

	//Check for tags folder or child of tags folder
	tagsFolderItem: function(id) {
		while (id != PlacesUtils.placesRootId) {
			if (id == PlacesUtils.tagsFolderId) return true;
			id = PlacesUtils.bookmarks.getFolderIdForItem(id);
		}
		return false;
	},

	//Return the newly selected folder (if any)
	newFolder: function() {
		var selectedNode = document.getElementById("folders").selectedNode;

		//Tags cannot be used
		if (this.tagsFolderItem(selectedNode.itemId)) {
			return false;
		}

		//Save the ID in a preference (folder name as well or else may get out of sync)
		SyncPlacesOptions.prefs.setIntPref("bookmarkFolderID", selectedNode.itemId);
		SyncPlacesOptions.setComplex("selected_folder", selectedNode.title);

		//Return the node so can display it on the main dialog
		window.arguments[0].out = {selectedNode:selectedNode};
		return true;
	}
};
