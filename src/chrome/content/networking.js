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

var SyncPlacesNetworking = {
	Cc: Components.classes,
	Ci: Components.interfaces,
	Cr: Components.results,
	timeout: 500,
	running: false,

	onTransferLoad: function() {
		var transferThread = function() {
		};
		transferThread.prototype = {
			run: function() {
				try {
					//Parameter passing from spObserver doesn't seem to work
					//so use a preference instead
					SyncPlacesOptions.shutdown = false;
					var autoSend = SyncPlacesOptions.prefs.getBoolPref("startAutoSend");
					var autoReceive = SyncPlacesOptions.prefs
																						 .getBoolPref("startAutoReceive");

					//May as well do the same thing for 'manual' send/receive
					var manualSend = SyncPlacesOptions.prefs
																					  .getBoolPref("startManualSend");
					var manualReceive = SyncPlacesOptions.prefs
																						.getBoolPref("startManualReceive");
					if (autoSend) {
						SyncPlacesOptions.shutdown = true;
						SyncPlacesOptions.prefs.setBoolPref("startAutoSend", false);
						SyncPlacesSend.send(true, true);
					}
					else if (autoReceive) {
						//If 'send safe' on startup then do a send immediately afterwards
						if (SyncPlacesOptions.prefs.getBoolPref("send_safe")) {
							SyncPlacesOptions.prefs.setBoolPref("startAutoSend", false);
							SyncPlacesSend.send(true, true);
						}
						else {
							SyncPlacesOptions.prefs.setBoolPref("startAutoReceive", false);
							SyncPlacesReceive.receive(true, false);
						}
					}

					else if (manualSend) {
						SyncPlacesOptions.prefs.setBoolPref("startManualSend", false);
						SyncPlacesSend.send(false, true);
					}
					else if (manualReceive) {
						SyncPlacesOptions.prefs.setBoolPref("startManualReceive", false);
						SyncPlacesReceive.receive(false, false);
					}
				} catch(exception) {
					SyncPlacesNetworking.running = false;
					Components.utils.reportError(exception);
				}
			},

			QueryInterface: function(iid) {
				if (iid.equals(SyncPlacesNetworking.Ci.nsIRunnable) ||
						iid.equals(SyncPlacesNetworking.Ci.nsISupports))
				{
					return this;
				}
				throw SyncPlacesNetworking.Cr.NS_ERROR_NO_INTERFACE;
			}
		}

		//Prevent concurrent running
		//If already running then abort the sync (because not required)
		if (!this.running) {
			this.running = true;

			//Start a thread for all of this work so UI doesn't get hung up
			var main = this.Cc["@mozilla.org/thread-manager;1"]
										 .getService(this.Ci.nsIThreadManager).mainThread;
			main.dispatch(new transferThread(), main.DISPATCH_NORMAL);
		}
	},

	//Abort transfer
	onTransferCancel: function() {
		//If in middle of transfer then abort it and close dialog
		if (SyncPlacesComms.inProgress()) {
			SyncPlacesComms.cancel();
			return false;
		}
		if (SyncPlacesOptions.shutdown) {
			this.Cc["@mozilla.org/toolkit/app-startup;1"]
					.getService(this.Ci.nsIAppStartup)
					.quit(this.Ci.nsIAppStartup.eAttemptQuit);
		}

		return true;
	},

	//Close the transfer dialog
	closeSPDialog: function() {
		SyncPlacesNetworking.running = false;

		if (SyncPlaces.anySPDialogs()) {
			setTimeout(window.close, this.timeout);
		}

		//If auto-send on shutdown then forcibly quit when OS X
		if (SyncPlacesOptions.shutdown) {
			var os = "WINNT";
			try {
				os = this.Cc["@mozilla.org/xre/app-info;1"]
								 .createInstance(this.Ci.nsIXULRuntime).OS;

			} catch (exception) {
			}
			if (os.indexOf("Darwin") == 0 ||
					SyncPlacesOptions.prefs
												.getCharPref("shutdown_detection") == "shutdown_crude")
			{
				setTimeout(this.Cc["@mozilla.org/toolkit/app-startup;1"]
											 .getService(this.Ci.nsIAppStartup)
											 .quit(this.Ci.nsIAppStartup.eAttemptQuit),
											 this.timeout);
			}
		}
	}
};

//Send/Receive functionality
var SyncPlacesComms = {
	sp_channel: null,
  sp_data: "",
	sp_callBack: null,
	sp_startupShutdown: false,
	sp_sendSafe: false,
	sp_doHash: false,
	sp_type: SyncPlaces.JSON,
	sp_streamLoader: null,
	sp_normal_conversion: true,
	sp_gzip: false,
	sp_gunzip: false,
	sp_old_gzip: false,
	sp_start_data: false,
	sp_gzipFileName: "syncplaces.json.gz",
  sp_dataToSend: "",
	sp_send: true,
	sp_status: "",
	sp_uri: null,
	sp_debug: false,
	Cc: Components.classes,
	Ci: Components.interfaces,
	Cr: Components.results,

	/**
	 * Initialise the comms setup
	 *
	 * @param send  if true sending, else receiving
	 * @param uriString  the url to send to/receive from (without user/pwd)
	 * @param fulluri  the url to send to/receive from (with user/pwd)
	 * @param dataToSend  the data being sent
	 * @param type  type of file being sent
	 * @param callBack  the function to call when comms has completed
	 * @param startupShutdown, safeSend, doHash  parameters to pass through
	 *				to the callBack function
	 */
  init: function(send, uriString, fulluri, dataToSend, type, callBack,
  							 startupShutdown,	safeSend, doHash)
  {
		this.sp_channel = null;
		this.sp_compress = SyncPlacesOptions.prefs.getBoolPref("gzip") &&
											 type == SyncPlaces.JSON;
		this.sp_callBack = callBack;
		this.sp_startupShutdown = startupShutdown;
		this.sp_sendSafe = safeSend;
		this.sp_doHash = doHash;
		this.sp_type = type;
		this.sp_normal_conversion = true;
		this.sp_gzip = false;
		this.sp_gunzip = false;
		this.sp_old_gzip = false;
		this.sp_send = send;
		this.sp_dataToSend = dataToSend;
		this.sp_debug = SyncPlacesOptions.prefs.getBoolPref("debug");

		//Connection details
		var uri = SyncPlacesIO.makeURI(uriString + (this.sp_compress ? ".gz" : ""));
if (this.sp_debug) SyncPlacesOptions.message("Normal URI: " + uri.spec);
		var furi = SyncPlacesIO.makeURI(fulluri + (this.sp_compress ? ".gz" : ""));
if (this.sp_debug) SyncPlacesOptions.message("Full URI: " + furi.spec);

		//If skipping authentication altogether force inline use
		//file and ftp schemes don't require authentication so move on
		if (SyncPlacesOptions.prefs.getBoolPref("skip_auth") ||
				uri.scheme == "file" || uri.scheme == "ftp")
		{
			this.transmit(furi);
		}
		else {
			//Do a HEAD first to get any authentication out of the way
			try {
				SyncPlacesAuthListener.init(uri, this.sp_compress, type, this.sp_debug, this);

			} catch(e) {
//Components.utils.reportError(e);

				//If fails then use the inlined URI with userid/password within it
				this.transmit(furi);
			}
		}
	},

	/**
	 * Do the real send/receive
	 */
	transmit: function(uri) {
		var ioService = this.Cc["@mozilla.org/network/io-service;1"]
												.getService(this.Ci.nsIIOService);
		this.sp_uri = uri;

		if (this.sp_send)
			this.sp_channel = ioService.newChannelFromURI(uri)
																 .QueryInterface(this.Ci.nsIUploadChannel);
		else
			this.sp_channel = ioService.newChannelFromURI(uri);

		//Come to me for any callbacks
		this.sp_channel.notificationCallbacks = this;

		if (this.sp_send) {
			//Convert to UTF8
			var converter = this.Cc["@mozilla.org/intl/scriptableunicodeconverter"]
												.createInstance(this.Ci.nsIScriptableUnicodeConverter);
			converter.charset = "UTF-8";
			var stream = converter.convertToInputStream(this.sp_dataToSend);

			//If compressing then write out as .gz file
			//and read it back in as a stream
			if (this.sp_compress) {
if (this.sp_debug) SyncPlacesOptions.message("Using compression");
				this.convertGzip(stream, true);
				stream = this.getGzipFile();
			}

			//Transfer text
			try {
				var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
												.getService(Components.interfaces.nsIStringBundleService)
												.createBundle("chrome://syncplaces/locale/syncplaces.properties");
			} catch(e) {}

			//Set the content type appropriately
			var contentType = "";
			switch(this.sp_type) {
				case SyncPlaces.JSON:
					contentType = this.sp_compress ? "application/x-gzip" :
															 			 			 "application/json; charset='UTF-8'";
					if (bundle) this.sp_status = bundle.GetStringFromName('sending_bookmarks');
				break;

				case SyncPlaces.HASH:
				case SyncPlaces.PWD_HASH:
					contentType = "text/plain; charset='UTF-8'";
					if (bundle) this.sp_status = bundle.GetStringFromName('sending_hash');
				break;

				case SyncPlaces.HTML:
					contentType = "text/html; charset='UTF-8'";
					if (bundle) this.sp_status = bundle.GetStringFromName('sending_html');
				break;

				case SyncPlaces.XBEL:
					contentType = "text/xml; charset='UTF-8'";
					if (bundle) this.sp_status = bundle.GetStringFromName('sending_xbel');
				break;

				case SyncPlaces.PWD:
					contentType = "text/xml; charset='UTF-8'";
					if (bundle) this.sp_status = bundle.GetStringFromName('sending_passwords');
				break;
			}
if (this.sp_debug) SyncPlacesOptions.message("Sending type: " + this.sp_type);

			//Get an upload channel to send through
			this.sp_channel.setUploadStream(stream, contentType, -1);

			//Option to try the old style approach when sending
			//(normally used with ftp)
			var technique = SyncPlacesOptions.prefs.getCharPref("send_mechanism");
			if (technique == 'old_send') {
if (this.sp_debug) SyncPlacesOptions.message("Using 'old_send'");
				this.sp_streamLoader = this.Cc["@mozilla.org/network/stream-loader;1"]
      														 .createInstance(this.Ci.nsIStreamLoader);
      	this.sp_streamLoader.init(this);
      	this.sp_channel.asyncOpen(this.sp_streamLoader, null);
			}
			else {
				//Old conversion system? - required for FTP with ISA server
				//or else browser hangs
				if (technique == 'old_send_conversion')
if (this.sp_debug) SyncPlacesOptions.message("Using 'old_send_conversion'");
					this.sp_normal_conversion = false;

				//NB See MDC: This will do a 'PUT' by default with http
				this.sp_channel.asyncOpen(this, null);
			}
		}

		//Receiving ...
		else {
			//Transfer text
			try {
				var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
												.getService(Components.interfaces.nsIStringBundleService)
												.createBundle("chrome://syncplaces/locale/syncplaces.properties");
				switch(this.sp_type) {
					case SyncPlaces.JSON:
						this.sp_status = bundle.GetStringFromName('receiving_bookmarks');
					break;

					case SyncPlaces.HASH:
					case SyncPlaces.PWD_HASH:
						this.sp_status = bundle.GetStringFromName('receiving_hash');
					break;

					case SyncPlaces.HTML:
						this.sp_status = bundle.GetStringFromName('receiving_html');
					break;

					case SyncPlaces.XBEL:
						this.sp_status = bundle.GetStringFromName('receiving_xbel');
					break;

					case SyncPlaces.PWD:
						this.sp_status = bundle.GetStringFromName('receiving_passwords');
					break;
				}
			} catch(e) {}
if (this.sp_debug) SyncPlacesOptions.message("Receiving type: " + this.sp_type);

			//Option to try the old style approach when receiving ftp
			//doesn't always attempt to connect for me though!
			var technique = SyncPlacesOptions.prefs.getCharPref("receive_mechanism");
			if (technique == 'old_receive') {
if (this.sp_debug) SyncPlacesOptions.message("Using 'old_receive'");
				if (this.sp_compress) {
if (this.sp_debug) SyncPlacesOptions.message("Using compression");
					this.sp_old_gzip = true;
				}
      	this.sp_streamLoader = this.Cc["@mozilla.org/network/stream-loader;1"]
      														 .createInstance(this.Ci.nsIStreamLoader);
      	this.sp_streamLoader.init(this);
      	this.sp_channel.asyncOpen(this.sp_streamLoader, null);
			}

			//Normal/Officially documented technique
			else {
				//Old conversion system?
				//required for FTP with ISA server or else browser hangs
				if (technique == 'old_receive_conversion') {
if (this.sp_debug) SyncPlacesOptions.message("Using 'old_receive_conversion'");
					this.sp_normal_conversion = false;
				}

				//Set up the channel as MDC tells you to
				this.sp_channel.loadFlags |= this.Ci.nsIRequest.LOAD_BYPASS_CACHE |
														 				 this.Ci.nsIRequest.INHIBIT_CACHING;

				//Receiving a gzip file
				if (this.sp_compress) {
if (this.sp_debug) SyncPlacesOptions.message("Using compression");
					var converterService = this.Cc["@mozilla.org/streamConverters;1"]
																		 .getService(this.Ci
																		 							 .nsIStreamConverterService);
					var converter = converterService.asyncConvertData("x-gzip",
																														"uncompressed",
																														this, null);
				  this.receive(converter);
				}
				else {
				  this.receive(this);
				}
			}
		}
	},

	//Do the receive
	receive: function(converter) {
		try {
			this.sp_channel.asyncOpen(converter, null);

		} catch (e) {

			//If using file protocol and file doesn't exist
			//then pretend it's a 404 error
			if (e.message && e.message.match(/0x80520012/)) {
					this.sp_callBack(0x80520012, null, this.sp_startupShutdown,
													 this.sp_sendSafe,this.sp_doHash, this.sp_type);
			}
			else {
				throw e;
			}
		}
	},

	//Is the transfer in progress?
	inProgress: function() {
		return this.sp_channel && this.sp_channel.isPending();
	},

	//Cancel the transfer
	cancel: function() {
		//NS_BINDING_ABORTED
		if (this.sp_channel) this.sp_channel.cancel(0x804B0002);
	},

  //nsIStreamListener - called when request is started
  onStartRequest: function(request, context) {
		if (this.sp_gzip) {
			this.makeGzipFile();
			this.bos.writeByteArray([0x1f, 0x8b, 0x08, 0x08, 0x00, 0x00, 0x00,
															 0x00, 0x00, 0x0b, 115, 112, 46, 106, 115, 111,
															 110, 0x00], 18);
		}
		else if (this.sp_gunzip) {
	    this.sp_data = null;
	    this.sp_start_data = true;
		}
		else {
	    this.sp_data = "";
		}
  },

	//Use this whole thing as a GZIP converter
	//(should really be separated out for clarity)
  convertGzip: function(stream, toGzip) {
		if (toGzip)
			this.sp_gzip = true;
		else
			this.sp_gunzip = true;

		var converterService = this.Cc["@mozilla.org/streamConverters;1"]
															 .getService(this.Ci.nsIStreamConverterService);
		var gzipConverter = converterService.asyncConvertData(
													toGzip ? "uncompressed" : "x-gzip",
													toGzip ? "x-gzip" : "uncompressed", this, null);
		gzipConverter.onStartRequest(this, null);
		var offset = 0;
		while(stream.available() != 0) {
			var count = stream.available();
			gzipConverter.onDataAvailable(this, null, stream, offset, count);
			offset += count;
		}
		gzipConverter.onStopRequest(this, null, 0);

		this.sp_gunzip = false;
		this.sp_gzip = false;
	},

  makeGzipFile: function() {
		var filePath = SyncPlacesIO.getDefaultFolder();
		filePath.append(this.sp_gzipFileName);
		//Create the output file
		if (!filePath.exists()) {
			filePath.create(this.Ci.nsILocalFile.NORMAL_FILE_TYPE, 0600);
		}

		this.fos = this.Cc["@mozilla.org/network/file-output-stream;1"]
									 .createInstance(this.Ci.nsIFileOutputStream);
		//0x02 = open for writing, 0x08 = create if doesn't exist
		//0x20 = overwrite if does exist
		//0666 = rw-rw-rw-
		this.fos.init(filePath, 0x02 | 0x08 | 0x20, 0666, null);
		this.bos = this.Cc["@mozilla.org/binaryoutputstream;1"]
									 .createInstance(this.Ci.nsIBinaryOutputStream);
		this.bos.setOutputStream(this.fos);
	},

	getGzipFile: function() {
		var gzipFilePath = SyncPlacesIO.getDefaultFolder();
		gzipFilePath.append(this.sp_gzipFileName);
		var fis = this.Cc["@mozilla.org/network/file-input-stream;1"]
									.createInstance(this.Ci.nsIFileInputStream);
		fis.init(gzipFilePath, -1, 0, 0);
		var bis = this.Cc["@mozilla.org/network/buffered-input-stream;1"]
									.createInstance(this.Ci.nsIBufferedInputStream);
		bis.init(fis, 1024);
		return bis;
	},

	//Data has been returned - may be called many times
  onDataAvailable: function(request, context, stream, sourceOffset, length) {
		if (this.sp_gzip) {
			var bis = this.Cc["@mozilla.org/binaryinputstream;1"]
										.createInstance(this.Ci.nsIBinaryInputStream);
			bis.setInputStream(stream);
			this.bos.writeByteArray(bis.readByteArray(length), length);
	    bis.close();
		}

		else if (this.sp_gunzip) {
			var bis = this.Cc["@mozilla.org/binaryinputstream;1"]
										.createInstance(this.Ci.nsIBinaryInputStream);
      bis.setInputStream(stream);
      if (this.sp_start_data) {
      	this.sp_data = bis.readBytes(length);
      	this.sp_start_data = false;
			}
      else {
      	this.sp_data += bis.readBytes(length);
			}
      bis.close();
		}

		//This is the official way of doing things
		//but doesn't work with some proxy servers (eg ISA server)
		//talking to an FTP server
		else if (this.sp_normal_conversion) {
			var charset = "UTF-8";
			var is = this.Cc["@mozilla.org/intl/converter-input-stream;1"]
									 .createInstance(this.Ci.nsIConverterInputStream);
			is.init(stream, charset, 1024,
							this.Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
			var str = {};
			while (is.readString(4096, str) != 0) {
				this.sp_data += str.value;
			}
		}

		//Read all the data in and convert to UTF-8 afterwards
		//required for ISA server or else hangs browser
		//NB This is also used when converting from gzip from onStreamComplete()
		else {
	    var sis = this.Cc["@mozilla.org/scriptableinputstream;1"]
	    							.createInstance(this.Ci.nsIScriptableInputStream);
	    sis.init(stream);
	    this.sp_data += sis.read(length);
		}
  },

	//Called when request has finished
  onStopRequest: function(request, context, status) {
		if (this.sp_gzip) {
		  this.fos.close();
		}
		else if (this.sp_gunzip) {
			//do nothing when converting from gzip from onStreamComplete()
		}
    else {
			try {
				if (document.getElementById("sp_meter")) {
					document.getElementById("sp_meter").value = 100;
				}
			} catch(e) {}

			if (Components.isSuccessCode(status)) {
				if (!this.sp_normal_conversion) {
					var converter = this.Cc["@mozilla.org/intl/scriptableunicodeconverter"]
															.createInstance(this.Ci
																								.nsIScriptableUnicodeConverter);
					converter.charset = "UTF-8";
					this.sp_data = converter.ConvertToUnicode(this.sp_data);
				}
				this.sp_callBack(this.sp_data, this.sp_channel, this.sp_startupShutdown,
												 this.sp_sendSafe, this.sp_doHash, this.sp_type);
			}
			//New authentication prompt system for inlined connect
			else if (status == 0x80470002) {
				this.transmit(this.sp_uri);
			}
			else {
				this.sp_callBack(status, null, this.sp_startupShutdown, this.sp_sendSafe,
												 this.sp_doHash, this.sp_type);
			}
		}
	},

	//Old style ftp processing
  onStreamComplete: function(loader, context, status, length, data) {
    if (Components.isSuccessCode(status)) {
			var converter = this.Cc["@mozilla.org/intl/scriptableunicodeconverter"]
												.createInstance(this.Ci.nsIScriptableUnicodeConverter);
			converter.charset = "UTF-8";
			if (this.sp_old_gzip) {
				this.makeGzipFile();
				this.bos.writeByteArray(data, length);
			  this.fos.close();
			  var stream = this.getGzipFile();
				this.convertGzip(stream, false);
				this.sp_data = converter.ConvertToUnicode(this.sp_data);
		    this.sp_old_gzip = false;
			}
			else {
				this.sp_data = converter.convertFromByteArray(data, length);
			}
			this.sp_callBack(this.sp_data, this.sp_channel, this.sp_startupShutdown,
											 this.sp_sendSafe, this.sp_doHash, this.sp_type);
		}
		//Bypass new authentication prompt system for inlined connect from 3.0.11+
		else if (status == 0x80470002) {
			this.transmit(this.sp_uri);
		}
    else {
      this.sp_callBack(status, null, this.sp_startupShutdown, this.sp_sendSafe,
      								 this.sp_doHash, this.sp_type);
		}
  },

  //nsIChannelEventSink
  onChannelRedirect: function(oldChannel, newChannel, flags) {
    //if redirecting, store the new channel
    this.sp_channel = newChannel;
  },
  asyncOnChannelRedirect: function(oldChannel, newChannel, flags, callback) {
		this.onChannelRedirect(oldChannel, newChannel, flags);
		callback.onRedirectVerifyCallback(0);
  },

	//Status
  onStatus: function(request, context, status, statusArg) { },

  //nsIProgressEventSink - not implementing will cause annoying exceptions
  onProgress: function(request, context, progress, progressMax) {
		try {
			if (document.getElementById("sp_meter")) {
				document.getElementById("sp_meter").mode="determined";
				document.getElementById("sp_meter").value = (100 * progress)/progressMax;
				if (this.sp_status) document.getElementById("status").value= this.sp_status;
			}
		} catch(e) {}
	},

  //nsIHttpEventSink - not implementing will cause annoying exceptions
  onRedirect: function(oldChannel, newChannel) { },

  //nsIInterfaceRequestor
  getInterface: function(iid) {
    try {
      return this.QueryInterface(iid);

    } catch (exception) {
      throw this.Cr.NS_NOINTERFACE;
    }
  },

  //We are faking an XPCOM interface, so we need to implement QI
  QueryInterface: function(iid) {
    if (iid.equals(this.Ci.nsISupports) ||
        iid.equals(this.Ci.nsIInterfaceRequestor) ||
        iid.equals(this.Ci.nsIChannelEventSink) ||
        iid.equals(this.Ci.nsIProgressEventSink) ||
        iid.equals(this.Ci.nsIHttpEventSink) ||
        iid.equals(this.Ci.nsIStreamLoader) ||
        iid.equals(this.Ci.nsIStreamListener))
      return this;

		//Always add an authentication prompt as a fallback
    else if (iid.equals(this.Ci.nsIAuthPrompt) ||
    				 iid.equals(this.Ci.nsIAuthPrompt2))
			return this.Cc["@mozilla.org/embedcomp/window-watcher;1"]
								 .getService(this.Ci.nsIWindowWatcher)
								 .getNewAuthPrompter(null);

    throw this.Cr.NS_NOINTERFACE;
  }
};

//Do a HEAD purely to get the Web Server authentication out of the way
//Proxy server authentication is dealt with by prompting
var SyncPlacesAuthListener = {
	Cc: Components.classes,
	Ci: Components.interfaces,
	Cr: Components.results,
	sp_callback: null,
	sp_challenge: null,
	sp_authType: null,
	sp_isProxy: false,
	sp_httpCount: 0,
	sp_proxyCount: 0,
	sp_uri: null,
	sp_compress: null,
	sp_type: null,
	sp_userid: "",
	sp_password: "",
	sp_realm: "",
	sp_onceMore: false,
	sp_channel: null,
	sp_debug: false,

	init: function(uri, compress, type, debug, callback) {
		this.sp_uri = uri;
		this.sp_compress = compress;
		this.sp_type = type;
		this.sp_debug = debug;
		this.sp_callback = callback;
		this.transmit();
	},

	transmit: function() {
		var ioService = this.Cc["@mozilla.org/network/io-service;1"]
												.getService(this.Ci.nsIIOService);
		this.sp_channel = null;
		this.sp_channel = ioService.newChannelFromURI(this.sp_uri)
													 		 .QueryInterface(this.Ci.nsIHttpChannel);
		this.sp_channel.notificationCallbacks = this;

if (this.sp_debug) SyncPlacesOptions.message("Challenge: " + this.sp_challenge);

		//Add authentication info
		//Prompt for proxy authentication dealt with in getInterface()
		if (this.sp_challenge && !this.sp_isProxy) {
if (this.sp_debug) SyncPlacesOptions.message("Adding authorisation");
			var authenticator = this.Cc["@mozilla.org/network/http-authenticator;1?scheme="
																	+ this.sp_authType]
															.getService(this.Ci.nsIHttpAuthenticator);


			try {
				var loginManager = this.Cc["@mozilla.org/login-manager;1"]
															 .getService(this.Ci.nsILoginManager);
				var logins = loginManager.findLogins({}, this.sp_uri.prePath, null, this.sp_realm);

				//Find user from returned array of nsILoginInfo objects
				//Always get the last one as this is the most recent one added for this realm
				for (var i = 0; i < logins.length; i++) {
					this.sp_userid = logins[i].username;
					this.sp_password = logins[i].password;
if (this.sp_debug) SyncPlacesOptions.message("Found login: " + logins[i].username + ":" + logins[i].password + ":" + logins[i].httpRealm);
				}
			} catch (exception) {
//Components.utils.reportError(e);
			}

			var sessionState = {};
			var continuationState = {};
			var credentials = authenticator.generateCredentials(this.sp_channel,
																							 this.sp_challenge,
																							 false, null,
																							 this.sp_userid,
																							 this.sp_password, sessionState,
																							 continuationState);
			this.sp_channel.setRequestHeader("Authorization", credentials, true);
		}

		this.sp_channel.requestMethod = "HEAD";
		this.sp_channel.loadFlags |= this.Ci.nsIRequest.LOAD_BYPASS_CACHE |
												 				 this.Ci.nsIRequest.INHIBIT_CACHING;
		this.sp_channel.asyncOpen(this, null);
	},

	//You MUST read any data received or else may fail
	onDataAvailable: function(aRequest, aContext, aInputStream, aOffset, aCount) {
	    var sis = this.Cc["@mozilla.org/scriptableinputstream;1"]
	    							.createInstance(this.Ci.nsIScriptableInputStream);
	    sis.init(stream);
	    sis.read(length);
	},

	onStopRequest: function(aRequest, aContext, aStatusCode) {
	  var challenges = [];
	  this.sp_isProxy = false;
if (this.sp_debug) SyncPlacesOptions.message("Status code: " + aStatusCode.toString(16));

		try {
			var http = aRequest.QueryInterface(this.Ci.nsIHttpChannel);
if (this.sp_debug) SyncPlacesOptions.message("HTTP Code: " + http.responseStatus);
			if (this.sp_proxyCount == 0 && http.responseStatus == 407) {
				this.sp_isProxy = true;
				challenges = http.getResponseHeader("Proxy-Authenticate").split("\n");
				this.sp_proxyCount++;
if (this.sp_debug) SyncPlacesOptions.message("Proxy count: " + this.sp_proxyCount);
			}
			else if (this.sp_httpCount == 0 && http.responseStatus == 401) {
				challenges = http.getResponseHeader("WWW-Authenticate").split("\n");
				this.sp_httpCount++;
if (this.sp_debug) SyncPlacesOptions.message("HTTP Count: " + this.sp_httpCount);
			}
			//Failed after multiple tries or bad status
			else if (http.responseStatus > 299 && http.responseStatus != 404) {
if (this.sp_debug) SyncPlacesOptions.message("Using inlined method");
				//It's possible that furi was populated with the wrong user/pass
				//in SyncPlaces.getURI (from the wrong realm), so recalc it here
				this.sp_callback.transmit(SyncPlacesIO.makeURI(
																	SyncPlaces.getURI(this.sp_type, true, this.sp_realm)
																	+ (this.sp_compress ? ".gz" : "")));
				return;
			}

			//What type of challenge was it?
			if (challenges.length > 0) {
				this.sp_challenge = challenges[0];
				this.sp_authType = (this.sp_challenge.split(/\s/))[0].toLowerCase();
				switch (this.sp_authType) {
					case "digest":
//Uncomment this and it will prompt you for the login!
//						this.sp_callback.transmit(this.sp_uri);
//						return;
					case "ntlm":
					case "negotiate":
					case "basic":
						break;
					default:
					 throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
				}

				this.sp_realm = this.sp_uri.host;
				var index1 = this.sp_challenge.indexOf("realm=\"");
				if (index1 != -1) {
					index1 += 7;
					if (index1 < this.sp_challenge.length) {
							var index2 = this.sp_challenge.indexOf("\"", index1);
							if (index2 != -1 && index2 > index1) {
								this.sp_realm = this.sp_challenge.substring(index1, index2);
							}
					}
				}
if (this.sp_debug) SyncPlacesOptions.message("Realm: " + this.sp_realm);
if (this.sp_debug) SyncPlacesOptions.message("Auth type: " + this.sp_authType);
				this.transmit();
				return;
			}

if (this.sp_debug) SyncPlacesOptions.message("Summary: " + http.responseStatus + ":" +  http.requestSucceeded + ":" + this.sp_challenge + ":" + this.sp_httpCount + ":" + this.sp_proxyCount);

			//If it worked and this was a result of my adding a response
			//store this in the auth cache system for subsequent requests
			if (this.sp_httpCount > 0 && !this.sp_onceMore) {
				try {
					var authManager = this.Cc["@mozilla.org/network/http-auth-manager;1"]
																.getService(this.Ci.nsIHttpAuthManager);
					var port = this.sp_uri.port
					if (this.sp_uri.port == -1) {
						port = this.sp_uri.scheme == "http" ? 80 : 443;
					}
					authManager.setAuthIdentity(this.sp_uri.scheme, this.sp_uri.host, port,
																			this.sp_authType, this.sp_realm, this.sp_uri.path, "",
																			this.sp_userid, this.sp_password);

if (this.sp_debug) SyncPlacesOptions.message("Auth cached");

				} catch(e) {
//Components.utils.reportError(e);
				}
			}

		} catch(exception) {
			this.sp_callback.transmit(SyncPlacesIO.makeURI(
																SyncPlaces.getURI(this.sp_type, true, this.sp_realm)
																+ (this.sp_compress ? ".gz" : "")));
			return;
		}

		//Authentication worked, so do the usual thing
		//Note that may get here even if sp_challenge is null
		//because not required (or already provided by Firefox) or 404
		//or caught exception
		this.sp_callback.transmit(this.sp_uri);
	},

	onStartRequest: function(aRequest, aContext) { },

  //nsIChannelEventSink
  onChannelRedirect: function(oldChannel, newChannel, flags) {
//Components.utils.reportError("Redirect Request");
    //if redirecting, store the new channel
    this.sp_channel = newChannel;
  },
  asyncOnChannelRedirect: function(oldChannel, newChannel, flags, callback) {
		this.onChannelRedirect(oldChannel, newChannel, flags);
		callback.onRedirectVerifyCallback(0);
  },

	//Status
  onStatus: function(request, context, status, statusArg) { },

  //nsIProgressEventSink - not implementing will cause annoying exceptions
  onProgress: function(request, context, progress, progressMax) { },

  //nsIHttpEventSink - not implementing will cause annoying exceptions
  onRedirect: function(oldChannel, newChannel) { },

	//nsIInterfaceRequestor
  getInterface: function(iid) {
    try {
      return this.QueryInterface(iid);

    } catch (exception) {
      throw this.Cr.NS_NOINTERFACE;
    }
  },

  //We are faking an XPCOM interface, so we need to implement QI
  QueryInterface: function(iid) {
    if (iid.equals(this.Ci.nsISupports) ||
        iid.equals(this.Ci.nsIInterfaceRequestor) ||
        iid.equals(this.Ci.nsIChannelEventSink) ||
        iid.equals(this.Ci.nsIProgressEventSink) ||
        iid.equals(this.Ci.nsIHttpEventSink) ||
        iid.equals(this.Ci.nsIStreamLoader))
      return this;

		//Always add an authentication prompt for proxies
    else if (iid.equals(this.Ci.nsIAuthPrompt) ||
    				 iid.equals(this.Ci.nsIAuthPrompt2))
    {
			if (this.sp_isProxy) {
				this.sp_proxy = false;
				return this.Cc["@mozilla.org/embedcomp/window-watcher;1"]
									 .getService(this.Ci.nsIWindowWatcher)
									 .getNewAuthPrompter(null);
			}
			else
				return null;
		}
//    else if (iid.equals(this.Ci.nsIBadCertListener2)) {
//Components.utils.reportError("Bad Cert Request");
//	 			return this;
//		}
//    else if (iid.equals(this.Ci.nsIPrompt)) {
//			return this.Cc["@mozilla.org/embedcomp/window-watcher;1"]
//								 .getService(this.Ci.nsIWindowWatcher)
//								 .getNewPrompter(null);
//		}
		else {
//Components.utils.reportError(iid);
		}

    throw this.Cr.NS_NOINTERFACE;
  }
};
