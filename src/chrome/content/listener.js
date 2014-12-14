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

var SyncPlacesListener = {
	Ci: Components.interfaces,
	Cc: Components.classes,
	Cr: Components.results,
	prefs: Components.classes["@mozilla.org/preferences-service;1"]
									 .getService(Components.interfaces.nsIPrefService)
									 .getBranch("extensions.syncplaces."),
	bookmarks: Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"]
                   .getService(Components.interfaces.nsINavBookmarksService),
	ignore: false,
	timer: null,
	interval: 60000,
	timed_timer: null,
	timed_interval: 300000,
	sync_timer: null,

	init: function() {
		//cancel any existing timers
		if (this.timer) this.timer.cancel();
		if (this.timed_timer) this.timed_timer.cancel();

		//Regular safe sends
		if (this.prefs.getBoolPref("regular_transfer")) {
			this.timer = this.Cc["@mozilla.org/timer;1"]
											 .createInstance(this.Ci.nsITimer);
			this.interval = this.getInterval();
			this.timer.init(this, this.interval,
											this.Ci.nsITimer.TYPE_REPEATING_SLACK);
		}

		//Timed safe sends (check every 5 mins to see if ready to fire)
		if (this.prefs.getBoolPref("timed_transfer")) {
			this.timed_timer = this.Cc["@mozilla.org/timer;1"]
														 .createInstance(this.Ci.nsITimer);
			this.timed_timer.init(this, this.interval,
														this.Ci.nsITimer.TYPE_REPEATING_SLACK);
		}
	},

  observe: function(subject, topic, data) {
  	if (topic == "timer-callback") { //Triggered by nsiTimer events
  		//These two timers get mixed up so need to treat together
			if (subject == this.sync_timer && this.prefs.getBoolPref("autosync") &&
					!this.ignore && !SyncPlaces.anySPDialogs())
			{
					this.sync();
			}

  		else if (subject == this.timer) {
				if (this.prefs.getBoolPref("regular_transfer")) {
					//If interval changes then reset the timer to the new interval
					var newInterval = this.getInterval();
					if (newInterval != this.interval) {
						this.timer.delay = newInterval;
						this.interval = newInterval;
					}

					//Don't launch if a SP window already open
					if (!SyncPlaces.anySPDialogs()) {
						this.sync();
					}
				}

				//If unticked the checkbox then turn the timer off
				else if (this.timer) {
					this.timer.cancel();
				}
			}

			//Must be a scheduled event ...
			else if (this.prefs.getBoolPref("timed_transfer")) {
				//Is it time yet?
				var scheduledTime = this.prefs.getCharPref("transfer_time").split(":", 3);
				var transferTime = new Date();
				transferTime.setHours(scheduledTime[0]);
				transferTime.setMinutes(scheduledTime[1]);
				var difference = new Date() - transferTime;

				//Activate if after the scheduled time
				//But by no more than one interval
				if (difference >= 0 && difference <= (2 * this.timed_interval)) {
					//Don't launch if a SP window already open
					//But keep timer going until you can do it
					if (!SyncPlaces.anySPDialogs()) {
						this.sync();

						//Cancel the timer when finished
						this.timed_timer.cancel();
					}
				}
			}

			//If unticked the checkbox then turn the timer off
			else if (this.timed_timer) {
				this.timed_timer.cancel();
			}
  	}
	},

  sync: function() {
		this.prefs.setBoolPref("startManualSend", true);
		SyncPlacesNetworking.onTransferLoad();
	},

	getInterval: function() {
		var measure = this.prefs.getCharPref("transfer_measure");
		var size = 1000;
		if (measure == 'minutes') size = size * 60;
		else if (measure == 'hours') size = size * 60 * 60;
		return this.prefs.getCharPref("transfer_interval") * size;
	},

	//Bookmark events
	//Ignore events generated during batch processing
	//eg When SyncPlaces itself does some bookmark manipulation
  onBeginUpdateBatch: function() {
		this.ignore = true;
	},
  onEndUpdateBatch: function() {
		this.ignore = false;
	},
	onBeforeItemRemoved: function(aItemId, aItemType) {
		//Just here to stop Firefox 3.6 whining
	},
	onItemAdded: function(aItemId, aFolder, aIndex) {
		this.startTimer();
	},
  onItemRemoved: function(aItemId, aFolder, aIndex) {
		this.startTimer();
	},
  onItemChanged: function(aBookmarkId, aProperty, aIsAnnotationProperty, aValue) {
		this.startTimer();
  },
  onItemVisited: function(aBookmarkId, aVisitID, time) {
		this.startTimer();
	},
  onItemMoved: function(aItemId, aOldParent, aOldIndex, aNewParent, aNewIndex) {
		this.startTimer();

		//Ensure the update date gets changed so I can track moved items when
		//other browsers receive them otherwise they will not get added back
		//into the other browsers bookmarks
		if (aNewParent != aOldParent) {
			this.bookmarks.setItemLastModified(aItemId, new Date().getTime() * 1000);
		}
	},
	//Wait before syncing in case any other events happen
	startTimer: function() {
		//cancel any existing timer
		if (this.sync_timer) this.sync_timer.cancel();

		//Create a timer to set off an auto-sync
		if (!this.ignore && this.prefs.getBoolPref("autosync")) {
			try {
				this.sync_timer = this.Cc["@mozilla.org/timer;1"]
															.createInstance(this.Ci.nsITimer);
				this.sync_timer.init(this, this.prefs.getCharPref("delay") * 1000,
														 this.Ci.nsITimer.TYPE_ONE_SHOT);
			} catch(e) {
			}
		}
	},

  QueryInterface: function(iid) {
    if (iid.equals(this.Ci.nsIObserver) ||
    		iid.equals(this.Ci.nsINavBookmarkObserver) ||
    		iid.equals(this.Ci.nsISupports)) {
      return this;
    }
    throw this.Cr.NS_ERROR_NO_INTERFACE;
  }
};

