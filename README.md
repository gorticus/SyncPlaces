# SyncPlaces Firefox extension

SyncPlaces is the most excellent [Firefox](http://getfirefox.com)
extension that provides for bookmark and password synchronization to a
self-hosted server, external device, or commercially hosted service,
e.g., [Dropbox](http://dropbox.com).  Originally developed and published
by [Andy Halford](http://andyhaldford.com) (AH), the author stopped
distributing it in June 2012 and removed it from from Firefox add-ons,
citing displeasure at Mozilla's treatment of add-on developers. [Daniel
Lange](http://daniel-lange.com) (DL) maintains a page dedicated to
[SyncPlaces, SortPlaces (CheckPlaces, SearchPlaces)... preserving these
and other excellent Firefox add-ons](http://goo.gl/utAO3P).

# What this is ...

I rely on AH's SyncPlaces. It is an essential add-on for me.  

This repository will:
* host `.xpi` releases for easy user use,
* host the source for development by user community,
* aggregate minimal updates, scrounged from various places, to enable
  continued use in fast moving Firefox updates.

I will attempt to update it as my limited time permits.

# What this is not ...

I _will not_:
* add features, so please, refrain from asking,
* plan regular updates

# xpi file info

The `.xpi` prior to `v5.1.0B` were obtained from the `belnet.be` Mozilla
mirror, as suggested by [DL](http://goo.gl/utAO3P), before it's layout
was reworked and the plugins deleted due to resync.  As of 2014/10/31,
`ftp://ftp.belnet.be/mirror/ftp.mozilla.org/` no longer mirrors Mozilla.

`v5.1.0{B,C}` were obtained from [DL's site](http://goo.gl/utAO3P); see
the [change log](http://daniel-lange.com/software/syncplaces_changelog).

`v5.2.0`, which can be obtained from DL's site
[syncplaces520.xpi](http://daniel-lange.com/software/syncplaces520.xpi),
is not included here.

## SHA1 sums

```shell
7310659ca91e231678206d22eda3ffff26d2316f  xpi/syncplaces-3.6.1-fx.xpi
d5e0ec181172eaa4fbaf8814ee618f69bd629df9  xpi/syncplaces-4.0.3-fx.xpi
94aed67dffb9c139ffe9659baff1060a85f9793f  xpi/syncplaces-4.0.5-fx.xpi
b4a161e53d90e4115ac74f2b26e70336be4e159e  xpi/syncplaces-4.0.7-fx.xpi
a9c328d08b35537ea82fe7e087a711d1f179ba8b  xpi/syncplaces-4.0.8-fx.xpi
aff70eda27188ea11caa91df4a22442cec228299  xpi/syncplaces-4.1.0-fx.xpi
b8a77793235d7a776cff3a3eb0280cf42260aff4  xpi/syncplaces-4.1.1-fx.xpi
c7bbc528f80ba9ab33f2f66206c9742f27db5676  xpi/syncplaces-4.1.2-fx.xpi
d492826bcfa405ea68ee3a624c5e180a6f758481  xpi/syncplaces-4.2.0-sm+fx.xpi
dfbbab5791dc0f6a0ad58f866fecf4c9457dd34e  xpi/syncplaces-4.3.0-sm+fx.xpi
2c6ffe3c5547bda2ef6f2491d2b31635ac8eed23  xpi/syncplaces-5.0.0-sm+fx.xpi
6b0919c19ec29d9e8508fab6c89250388a1275f1  xpi/syncplaces-5.0.1-sm+fx.xpi
bfd9d5603b5740cf3c7777037ebcf21d100da4a8  xpi/syncplaces-5.1.0-sm+fx.xpi
d8e77c670f66fe18d09d6fc4fdae2684610b8d84  xpi/syncplaces-5.1.0B-sm+fx.xpi
46c7567a5a77e045dd110f94d582245b7fd71c69  xpi/syncplaces-5.1.0C-sm+fx.xpi
```

# License

AH's original work was published under a
[MPL 1.1](http://www.opensource.org/licenses/MPL-1.1) / 
[GPL 2.0](http://www.opensource.org/licenses/GPL-2.0) / 
[LGPL 2.1](http://www.opensource.org/licenses/LGPL-2.1)
tri-license, with [LGPL](http://www.opensource.org/licenses/LGPL-2.1)
covering [Chris Veness'](http://www.movable-type.co.uk/)
AES and TEA implementations, and can be re-distributed.

My contributions, beyond AH's originally published work, are licensed
under the [MPL 2.0](http://opensource.org/licenses/MPL-2.0).

# Contributors

* Andy Halford &mdash; thanks for such a useful Firefox add-on! 
* Daniel Lange &mdash; curating and preservation
* Community developers and users on [DL's site](http://goo.gl/utAO3P)
  * Graham
  * TheChief 
  * Strony Internetowe
  * Frank Kirchner
  * Klaus
  * V 
