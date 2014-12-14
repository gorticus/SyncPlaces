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

function spObserver() {
	this.register();
}

spObserver.prototype = {
	Ci: Components.interfaces,
	Cc: Components.classes,
	Cr: Components.results,

  get wrappedJSObject() {
    return this;
  },

  observe: function(subject, topic, data) {
		var prefs = this.Cc["@mozilla.org/preferences-service;1"]
										 .getService(this.Ci.nsIPrefService)
										 .getBranch("extensions.syncplaces.");

		//General event for application startup.
  	if (topic == "app-startup") {
			var observer = this.Cc["@mozilla.org/observer-service;1"]
												 .getService(this.Ci.nsIObserverService);
			observer.addObserver(this, "final-ui-startup", false);
	    observer.addObserver(this, "quit-application-requested", false);
	    observer.removeObserver(this, "app-startup");
    }

    //Triggered just before the first window for the application is displayed
  	else if (topic == "final-ui-startup") {
			var observer = this.Cc["@mozilla.org/observer-service;1"]
												 .getService(this.Ci.nsIObserverService);
	    observer.removeObserver(this, "final-ui-startup");
			prefs.setBoolPref("started", false);
			prefs.setBoolPref("startAutoSend", false);
			prefs.setBoolPref("startAutoReceive", false);

			if (prefs.getBoolPref("auto_receive") &&
					prefs.getCharPref("autostart_detection") != "autostart_crude")
			{
				prefs.setBoolPref("startAutoReceive", true);
				prefs.setBoolPref("autoStarted", true);
				this.sync();
			}
		}
  	//Something has requested that the application be shutdown.
  	//You can cancel the shutdown from here
		else if (topic == "quit-application-requested") {
			var observer = this.Cc["@mozilla.org/observer-service;1"]
												 .getService(this.Ci.nsIObserverService);
	    observer.removeObserver(this, "quit-application-requested");
			prefs.setBoolPref("startAutoSend", false);
			prefs.setBoolPref("startAutoReceive", false);

			if (prefs.getBoolPref("auto_send")) {
				//If OSX then cancel the shutdown (cos it doesnt appear to work)
				//and do it in the app instead
				//TODO: Could try 'modal' instead??
				var os = "WINNT";
				try {
					os = this.Cc["@mozilla.org/xre/app-info;1"]
									 .createInstance(this.Ci.nsIXULRuntime).OS;

				} catch (exception) {
				}
				if ((os.indexOf("Darwin") == 0 ||
						 prefs.getCharPref("shutdown_detection") == "shutdown_crude") &&
						subject instanceof this.Ci.nsISupportsPRBool)
							subject.data = true;

				prefs.setBoolPref("startAutoSend", true);
				this.sync();
			}
		}
  },

  sync: function() {
		//TODO can't pass params so set a preference instead
		//var params = {inn:{status:"auto_send"}, out:null};
		var ww = this.Cc["@mozilla.org/embedcomp/window-watcher;1"]
								 .getService(this.Ci.nsIWindowWatcher);
		ww.openWindow(null, 'chrome://syncplaces/content/transfer.xul',
									'_blank', 'chrome,resizable,centerscreen', null);
	},

	register: function() {
    var observer = this.Cc["@mozilla.org/observer-service;1"]
    									 .getService(this.Ci.nsIObserverService);
    observer.addObserver(this, "app-startup", false);
  },

  QueryInterface: function(iid) {
		if (iid.equals(this.Ci.nsIObserver) || iid.equals(this.Ci.nsISupports))
			return this;

		Components.returnCode = this.Cr.NS_ERROR_NO_INTERFACE;
		return null;
	},
};

var spModule = {
	Ci: Components.interfaces,
	Cc: Components.classes,
	Cr: Components.results,
  firstTime : true,
	spCID: 		Components.ID("{2fe1793a-7519-11dd-b203-f06a56d89593}"),
	spProgID: "@andyhalford.com/spObserver;1",
	spName:   "SyncPlaces",

	registerSelf: function(compMgr, fileSpec, location, type) {
		if (this.firstTime) {
			this.firstTime = false;

			var compMgr = compMgr.QueryInterface(this.Ci.nsIComponentRegistrar);
			compMgr.registerFactoryLocation(this.spCID, this.spName, this.spProgID,
																			fileSpec, location, type);

			//Must register for app-startup to be sent to me
			var categoryManager = this.Cc["@mozilla.org/categorymanager;1"]
																.getService(this.Ci.nsICategoryManager);
			//Persist across browser restarts
			categoryManager.addCategoryEntry("app-startup", this.spName,
																			 "service," + this.spProgID, true, true);
		}
	},

	unregisterSelf: function(compMgr, fileSpec, location) {
		var compMgr = compMgr.QueryInterface(this.Ci.nsIComponentRegistrar);
		compMgr.unregisterFactoryLocation(this.spCID, fileSpec);

		var categoryManager = this.Cc["@mozilla.org/categorymanager;1"]
															.getService(this.Ci.nsICategoryManager);
		categoryManager.deleteCategoryEntry("app-startup", this.spName, true);
	},

	getClassObject: function(compMgr, cid, iid) {
		if (cid.equals(this.spCID))
			return this.spFactory;

		if (!iid.equals(this.Ci.nsIFactory))
			throw this.Cr.NS_ERROR_NOT_IMPLEMENTED;

		throw this.Cr.NS_ERROR_NO_INTERFACE;
	},

	spFactory: {
		QueryInterface: function(iiD) {
			if (!iiD.equals(this.Ci.nsISupports) && !iiD.equals(this.Ci.nsIFactory))
				throw this.Cr.NS_ERROR_NO_INTERFACE;
			return this;
		},

		createInstance: function(outer, iid) {
			return new spObserver();
		}
	},

	canUnload: function(compMgr) {
		return true;
	}
};

function NSGetModule(compMgr, fileSpec) {
	return spModule;
}