/* ***** BEGIN LICENSE BLOCK *****
 *
 * The code in this file was taken from the following web page on 22/10/2008:
 * http://www.movable-type.co.uk/scripts/tea.html
 *
 * I've encapsulated all the functions and variables to prevent namespace
 * collisions with other extensions
 *
 * In accordance with the intructions on the site I've added the following
 * LGPL license block to it:
 *
 * TEA Encryption/Decryption utilities
 *
 * Copyright (C) 2002-2005 Chris Veness
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * ***** END LICENSE BLOCK ***** */

var SyncPlacesTEA = {
	//
	// TEAencrypt: Use Corrected Block TEA to encrypt plaintext using password
	//             (note plaintext & password must be strings not string objects)
	//
	// Return encrypted text as string
	//
	TEAencrypt: function(plaintext, password)
	{
		function escCtrlCh(str) {  // escape control chars etc which might cause problems with encrypted texts
			return str.replace(/[\0\t\n\v\f\r\xa0'"!]/g, function(c) { return '!' + c.charCodeAt(0) + '!'; });
		}

		if (plaintext.length == 0) return('');  // nothing to encrypt
		// 'escape' plaintext so chars outside ISO-8859-1 work in single-byte packing, but keep
		// spaces as spaces (not '%20') so encrypted text doesn't grow too long (quick & dirty)
		var asciitext = escape(plaintext).replace(/%20/g,' ');
		var v = this.strToLongs(asciitext);  // convert string to array of longs
		if (v.length <= 1) v[1] = 0;  // algorithm doesn't work for n<2 so fudge by adding a null
		var k = this.strToLongs(password.slice(0,16));  // simply convert first 16 chars of password as key
		var n = v.length;

		var z = v[n-1], y = v[0], delta = 0x9E3779B9;
		var mx, e, q = Math.floor(6 + 52/n), sum = 0;

		while (q-- > 0) {  // 6 + 52/n operations gives between 6 & 32 mixes on each word
			sum += delta;
			e = sum>>>2 & 3;
			for (var p = 0; p < n; p++) {
				y = v[(p+1)%n];
				mx = (z>>>5 ^ y<<2) + (y>>>3 ^ z<<4) ^ (sum^y) + (k[p&3 ^ e] ^ z);
				z = v[p] += mx;
			}
		}

		var ciphertext = this.longsToStr(v);

		return escCtrlCh(ciphertext);
	},

	//
	// TEAdecrypt: Use Corrected Block TEA to decrypt ciphertext using password
	//
	TEAdecrypt: function(ciphertext, password)
	{
		function unescCtrlCh(str) {  // unescape potentially problematic nulls and control characters
    	return str.replace(/!\d\d?\d?!/g, function(c) { return String.fromCharCode(c.slice(1,-1)); });
		}

		if (ciphertext.length == 0) return('');
    var v = this.strToLongs(unescCtrlCh(ciphertext));
		var k = this.strToLongs(password.slice(0,16));
		var n = v.length;

		var z = v[n-1], y = v[0], delta = 0x9E3779B9;
		var mx, e, q = Math.floor(6 + 52/n), sum = q*delta;

		while (sum != 0) {
			e = sum>>>2 & 3;
			for (var p = n-1; p >= 0; p--) {
				z = v[p>0 ? p-1 : n-1];
				mx = (z>>>5 ^ y<<2) + (y>>>3 ^ z<<4) ^ (sum^y) + (k[p&3 ^ e] ^ z);
				y = v[p] -= mx;
			}
			sum -= delta;
		}

		var plaintext = this.longsToStr(v);

		// strip trailing null chars resulting from filling 4-char blocks:
		plaintext = plaintext.replace(/\0+$/,'');

    return unescape(plaintext);
	},

	// supporting functions
	strToLongs: function(s) {  // convert string to array of longs, each containing 4 chars
		// note chars must be within ISO-8859-1 (with Unicode code-point < 256) to fit 4/long
		var l = new Array(Math.ceil(s.length/4));
		for (var i=0; i<l.length; i++) {
			// note little-endian encoding - endianness is irrelevant as long as
			// it is the same in longsToStr()
			l[i] = s.charCodeAt(i*4) + (s.charCodeAt(i*4+1)<<8) +
						 (s.charCodeAt(i*4+2)<<16) + (s.charCodeAt(i*4+3)<<24);
		}
		return l;  // note running off the end of the string generates nulls since
	},           // bitwise operators treat NaN as 0

	longsToStr: function(l) {  // convert array of longs back to string
		var a = new Array(l.length);
		for (var i=0; i<l.length; i++) {
			a[i] = String.fromCharCode(l[i] & 0xFF, l[i]>>>8 & 0xFF,
																 l[i]>>>16 & 0xFF, l[i]>>>24 & 0xFF);
		}
		return a.join('');  // use Array.join() rather than repeated string appends for efficiency
	}
};