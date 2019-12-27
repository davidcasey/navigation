
/**
 * Navigation Module
 *
 * This script makes the following navigation items interactive and accessible:
 *   Tabs, Accordions, Toggles
 *
 * @module    IpcNavigation
 * @author    David R. Casey, https://studiocasey.com
 * @copyright David R. Casey, 2019 All Rights Reserved.
 * @license   Use of this source code is governed by an MIT-style license that
 *            can be found in the LICENSE file.
 *            https://github.com/davidcasey/navigation/blob/master/LICENSE
 */



/**
 * IpcNavigation factory function
 *
 * @param  {object}   el       The HTML element on which to apply IpcNavigation
 * @param  {object}   options  Optional: The options to override the defaults
 * @param  {function} callback Optional: Callback function to call after item
 *                             has been added
 * @return {object}            The IpcNavigation object
 */
var IpcNavigation = function(el, options, callback) {
	'use strict';

	// Override these default options to customize navigation functionality
	var defaults = {
		multipleActive      : false,  // Allows multiple panes to be active at the same time
		noneActive          : false,  // Allows all panes to be inactive
		topPadding          : 0,      // If accordion scrolls off viewport, scroll to top - topPadding
		windowResizeRefresh : true,   // Send notifications to observers of current active state after window refresh
	};


	if (typeof options === 'function') {
		callback = options;
		options = {};
	}

	var opts = Object.assign({}, defaults, options);

	var ba = new BindActive(new Observable());

	var obj = {
		el           : { wrapper: el },
		addPane      : addPane,
		removePane   : removePane,
		isActive     : isActive,
		setActive    : setActive,
		bindActive   : bindActive,
		unbindActive : unbindActive,
		subscribe    : ba.subscribe,
		unsubscribe  : ba.unsubscribe,
		refresh      : ba.notify,
	};

	init();

	typeof callback === 'function' && callback(); // jshint ignore:line

	return obj;


	/**
	 * Build Initial DOM required for IpcNavigation
	 */
	function init() {
		// Panes wrapper
		var panesEl = document.createElement('div');
		panesEl.className = 'nav-content';
		el.insertBefore(panesEl, el.firstChild);
		obj.el.panes = panesEl;

		// Nav wrapper
		var navEl = document.createElement('ul');
		navEl.className = 'nav';
		navEl.setAttribute('role', 'tablist');
		el.insertBefore(navEl, el.firstChild);
		obj.el.nav = navEl;

		// Get direct children panes: (> .nav-pane)
		var panes = [].slice.call(el.children).filter(function(c) {
			return c.classList.contains('nav-pane');
		});

		// Reverse order, last set active wins when !opts.multipleActive
		var ids = [];
		Object.keys(panes).reverse().forEach(
			function(i) {
				ids.push(addPane(panes[i], 0));
			}
		);

		// Ensure one pane is active if !opts.noneActive
		if (!opts.noneActive && !isActive(ids, 1).includes(true)) {
			// TODO: Remove setTimeout hack. Wait for or cancel transition complete?
			setTimeout(function() { ba.setActive(panes[0].getAttribute('id')); }, 800);
		}

		// After window refreshed, if the pane is active send notifications to
		// observers of current state--this is necessary for responsive tabs.
		if (opts.windowResizeRefresh) {
			window.addEventListener('resize', debounce(300, function() {
				// TODO: should I get panes as done above?
				var panes = obj.el.panes.querySelectorAll('.nav-pane');
				Object.keys(panes).forEach(function(i) {
					if (isActive(panes[i])) {
						ba.notify(panes[i].getAttribute('id'));
					}
				});
			}));
		}
	}


	/**
	 * Add a pane to IpcNavigation and build an interactive button.
	 * @param {object}   el       The pane element to add to the navigation. A
	 *                            child element with a class .nav-title is required.
	 * @param {number}   position Optional: The position index to append item,
	 *                            defaults to end.
	 * @param {function} callback Optional: Callback function to call after item
	 *                            has been added. el and position are passed as
	 *                            arguments to the callback function.
	 */
	function addPane(el, position, callback) {
		// Ensure we are working with vanilla js element
		el = normalizeElementArray(el, 'el')[0];

		// a.nav-title is required
		var title = el.querySelector('a.nav-title');
		if (!title) { return false; }

		if (typeof position === 'function') {
			callback = position;
			position = null;
		}

		// Build navigation items DOM
		var id = el.id;
		var li = document.createElement('li');
		li.className = 'nav-item';

		var link = document.createElement('a');
		link.id = id + '-link';
		link.className = 'nav-link';
		link.innerHTML = '<span>' + title.innerText + '</span>';
		link.setAttribute('href', '#' + id);
		link.setAttribute('aria-controls', id);
		link.setAttribute('aria-selected', 'false');
		link.setAttribute('role', 'tab');
		var icon = title.getAttribute('data-icon');
		if (icon) { link.setAttribute('data-icon', icon); }
		li.appendChild(link);

		el.setAttribute('aria-labelledby', link.id);
		el.setAttribute('role', 'tabpanel');
		if (!title.getAttribute('tabindex')) { title.setAttribute('tabindex', 0); }
		if (!title.getAttribute('href')) { title.setAttribute('href', '#' + id); }

		// Add listeners
		link.addEventListener('click', linkClickEvent, false);
		title.addEventListener('click', paneClickEvent, false);

		// Data binding active state
		ba.bind(id, el);
		ba.bind(id, link);

		// Append to position
		obj.el.nav.insertBefore(li, obj.el.nav.children[position]);
		obj.el.panes.insertBefore(el, obj.el.panes.children[position]);

		// Set initial active state (last active wins if !opts.multipleActive)
		ba.setActive(id, el.classList.contains('active'));

		typeof callback === 'function' && callback(el, position); // jshint ignore:line
		return id;
	}


	/**
	 * Remove a pane from IpcNavigation and remove its interactive button.
	 * @param {object}   el       The pane element to remove from the navigation.
	 * @param {function} callback Optional: Callback function to call after item
	 *                            has been removed. el is passed as an argument to
	 *                            the callback function.
	 */
	function removePane(el, callback) {
		// Ensure we are working with vanilla js element
		el = normalizeElementArray(el, 'el')[0];

		var contentWrapper = el.closest('.nav-content');

		// If isActive and noneActive is not allowed, change active to adjacent
		if (!opts.noneActive && isActive(el)) {
			var prev;
			var panes = contentWrapper.querySelectorAll('.nav-pane');
			Object.keys(panes).some(function(key, i) {
				if (panes[i] === el) {
					// Set previous active, else next if first
					setActive(prev ? prev : panes[i+1]);
					return true;
				}
				prev = panes[i];
			});
		}

		// Remove from ViewModel and Model, return false if fail
		if (!ba.removeKey(el.id)) { return false; }

		// Remove event listeners
		var link = document.getElementById(el.id + '-link');
		link.removeEventListener('click', linkClickEvent, false);
		var title = el.querySelector('.nav-title');
		title.removeEventListener('click', paneClickEvent, false);

		// Remove from View
		var li = link.closest('li');
		li.closest('ul').removeChild(li);
		contentWrapper.removeChild(el);

		typeof callback === 'function' && callback(el); // jshint ignore:line
		return el;
	}


	/**
	 * Click event handler: activates pane from link click.
	 * @param {object} e Event object
	 */
	function linkClickEvent(e) {
		e.preventDefault();
		var link = e.target.closest('.nav-link');
		var id   = link.getAttribute('href').replace(/^#/, '');
		ba.setActive(id);
	}


	/**
	 * Click event handler: activates pane from internal pane item click.
	 * @param {object} e Event object
	 */
	function paneClickEvent(e) {
		e.preventDefault();
		var pane = e.target.closest('.nav-pane');
		var id   = pane.getAttribute('id');
		ba.setActive(id);
	}


	/**
	 * Returns the active state of a pane(s).
	 * @param  {string|array|object} items The pane(s) to check if active. Accepts a single
	 *                                     or array of string ids or JS elements, or a jQuery
	 *                                     object for the id(s)
	 * @param  {boolean}             array true - Force return of array
	 * @return {boolean|array}             The boolean isActive state(s) of the pane(s)
	 *                                     true | false
	 */
	function isActive(items, array) {
		var activeState = normalizeElementArray(items).map(function(id, i) {
			return ba.isActive(id);
		});
		return activeState.length === 1 && !array ? activeState[0] : activeState;
	}


	/**
	 * Set the active state of a pane(s).
	 * @param  {string|array|object} items    The pane(s) to activate. Accepts a single or
	 *                                        array of string ids or JS elements, or a jQuery
	 *                                        object for the id(s)
	 * @param  {boolean}             state    Optional: true-active, false-inactive,
	 *                                        undefined-toggle active state
	 * @param  {function}            callback Optional: Callback function to call after item's
	 *                                        active state has been changed. Passes the id(s) and
	 *                                        activeState to the callback as arguments.
	 * @return {boolean|array}                The new isActive state of the pane true | false
	 */
	function setActive(items, state, callback) {
		if (typeof state === 'function') {
			callback = state;
			state = undefined;
		}

		var el = normalizeElementArray(items);
		var activeState = el.map(function(id, i) {
			return ba.setActive(id, state);
		});
		activeState = activeState.length === 1 ? activeState[0] : activeState;

		typeof callback === 'function' && callback(el, activeState); // jshint ignore:line

		return activeState;
	}


	/**
	 * Bind element active state to other elements
	 * @param {string} id    The common pane id to bind the element(s)
	 * @param {object} items The pane element(s) to bind to the active state
	 */
	function bindActive(id, items) {
		return normalizeElementArray(items, 'el').map(function(el, i) {
			var l = ba.bind(id, el);
			ba.notify(id);
			return l;
		});
	}


	/**
	 * Unbind element active state from other elements
	 * @param {string} id    The common pane id to unbind the element(s)
	 * @param {object} items The pane element(s) to unbind the active state
	 */
	function unbindActive(id, items) {
		normalizeElementArray(items, 'el').forEach(function(item) {
			ba.unbind(id, item);
		});
	}


	/**
	 * Converts ids, jQuery objects, elements, into a common data set with which
	 * IpcNavigation can utilize: a consistent array of string ids or elements.
	 * @param  {string|array|object} items The pane(s) to convert to an array. Accepts
	 *                                     a single or array of string ids or JS
	 *                                     elements, or a jQuery object for the ids
	 * @param  {string}              type  If the array will have ids or elements.
	 *                                     Allowed type: 'id', 'el'; Defaults to 'id'.
	 * @return {array}                     An array of ids or elements.
	 */
	function normalizeElementArray(items, type) {
		type = type === undefined ? 'id' : type;
		var arr = [];

		// jQuery object
		if (window.jQuery && items instanceof jQuery) {
			arr = items.map(function(i) {
				switch (type) {
					case 'id':
						return typeof items[i] === 'object' ? items[i].getAttribute('id') : items[i];
					case 'el':
						return items[i];
				}
			}).get();

		// Array of items
		} else if (Array.isArray(items)) {
			arr = items.map(function(o, i) {
				switch (type) {
					case 'id':
						return typeof items[i] === 'object' ? items[i].getAttribute('id') : items[i];
					case 'el':
						return typeof items[i] === 'object' ? items[i] : document.getElementById(items[i]);
				}
			});

		// Single item
		} else {
			switch (type) {
				case 'id':
					arr.push(typeof items === 'object' ? items.getAttribute('id') : items); break;
				case 'el':
					arr.push(typeof items === 'object' ? items : document.getElementById(items)); break;
			}
		}

		return arr;
	}


	/**
	 * Collapse an element, a fix for CSS transition not working on height:auto
	 * https://codepen.io/brundolf/pen/dvoGyw
	 * @param {object} el The element to collapse
	 */
	function collapseSection(el) {
		// get the height of the element's inner content, regardless of its actual size
		var sectionHeight = el.scrollHeight;
		// temporarily disable all css transitions
		var elTransition = el.style.transition;
		el.style.transition = '';
		// on the next frame (as soon as the previous style change has taken effect),
		// explicitly set the element's height to its current pixel height, so we
		// aren't transitioning out of 'auto'
		requestAnimationFrame(function() {
			el.style.height = sectionHeight + 'px';
			el.style.transition = elTransition;
			// on the next frame (as soon as the previous style change has taken effect),
			// have the element transition to height: 0
			requestAnimationFrame(function() {
				el.style.height = 0 + 'px';
			});
		});
	}


	/**
	 * Expand an element, a fix for CSS transition not working on height:auto
	 * https://codepen.io/brundolf/pen/dvoGyw
	 * @param {object} el The element to expand
	 */
	function expandSection(el) {
		// reset height style to allow for window resize
		el.style.height = null;
		// get the height of the element's inner content, regardless of its actual size
		var sectionHeight = el.scrollHeight;
		// have the element transition to the height of its inner content
		el.style.height = sectionHeight + 'px';
		// if there is a transition...
		if (parseFloat(getComputedStyle(el)['transitionDuration'])) {
			// when the next css transition finishes (which should be the one we just triggered)
			el.addEventListener('transitionend', function handler(e) {
				// remove this event listener so it only gets triggered once
				el.removeEventListener('transitionend', handler);
				// remove "height" from the element's inline styles, so it can return to its initial value
				el.style.height = null;
				// ensure pane is still in viewport
				var rect = el.closest('.nav-pane').getBoundingClientRect();
				// setTimeout: if scroll is at the end of the page, scrollBy does not activate.
				setTimeout(function() {
					if (rect.y && rect.y < 0 + opts.topPadding) {
						window.scrollBy({
							top: rect.y - opts.topPadding,
							left: 0,
							behavior: 'smooth'
						});
					} else if (rect.top && rect.top < 0 + opts.topPadding) { // IE
						window.scrollBy(0, rect.top - opts.topPadding);
					}
				}, 50);
			});
		}
	}


	/**
	 * Debounce a callback
	 * @param {number}   latency  The timeout of the callback/debounce
	 * @param {function} callback The function to call afer debouncing
	 */
	function debounce(latency, callback) {
		return function() {
			clearTimeout(callback.debounceState);
			callback.debounceState = setTimeout(callback, latency);
		};
	}



	/**
	 * Observable Model
	 */
	function Observable() {
		var data = {};
		var listeners = [];

		// Custom Events
		var changeEvent  = new CustomEvent('change.ipc.nav');
		var changedEvent = new CustomEvent('changed.ipc.nav');

		/**
		 * Notify the listeners of a data change
		 * @param {string}  key      The id of the observable data
		 * @param {boolean} newValue The value associated with the key
		 */
		function notify(key, newValue) {
			listeners.forEach(function(listener) {
				listener(key, newValue);
			});
		}


		/**
		 * The accessor for the observable model
		 * @param {string}  key       The id of the observable data
		 * @param {boolean} newValue  The value associated with the key
		 * @param {boolean} recursive Optional, if this is a recursive call
		 */
		function accessor(key, newValue, recursive) {
			recursive = recursive === 'undefined' ? false : recursive;

			if (arguments.length >= 2 && newValue !== data[key]) {
				if (!recursive) {
					obj.el.wrapper.dispatchEvent(changeEvent);
				}

				// opts.multipleActive
				if (newValue && !opts.multipleActive) {
					data[key] = newValue;
					for (var k1 in data) {
						if (data.hasOwnProperty(k1) && k1 !== key) {
							accessor(k1, false, true);
						}
					}
					notify(key, newValue);

				// opts.noneActive
				} else if (!newValue && !opts.noneActive) {
					// Get an array of active ids
					var active = Object.keys(data).filter(function(k) {
						return data[k] === true;
					});
					if (!(active.length <= 1 && active.includes(key)) || data[key] === undefined) {
						data[key] = newValue;
						notify(key, newValue);
					}

				// default condition
				} else {
					data[key] = newValue;
					notify(key, newValue);
				}

				if (!recursive) {
					obj.el.wrapper.dispatchEvent(changedEvent);
				}
			}
			return data[key];
		}


		/**
		 * Subscribe a listener to be notified on data change
		 * @param {function} fn The function to be called upon a data change. The
		 *                      listener will recieve two arguments:
		 *                      - {string}  The id of the data that changed
		 *                      - {boolean} The new value
		 */
		accessor.subscribe = function(fn) {
			listeners.push(fn);
		};


		/**
		 * Unsubscribe a listener
		 * @param {function} fn The listener to be removed.
		 */
		accessor.unsubscribe = function(fn) {
			listeners = listeners.filter(function(l) {
				return l !== fn;
			});
		};


		/**
		 * Remove an id from the Observable data
		 * @param  {string}  key The id to be removed
		 * @return {boolean}     If the id was removed
		 */
		accessor.removeKey = function(key) {
			return delete data[key];
		};


		/**
		 * Manually fire a notification to listeners of current state
		 * @param {string} key Optional: The identifier of the data listeners to
		 *                     notify. If no key, all keys will be notified
		 *                     through the listeners.
		 */
		accessor.notify = function(key) {
			if (key === undefined) {
				Object.keys(data).forEach(function(key) {
					notify(key, data[key]);
				});
			} else {
				notify(key, data[key]);
			}
		};


		// console.log the object data and listeners
		accessor.log = function() { console.log(data, listeners); };


		return accessor;
	}



	/**
	 * BindActive ViewModel
	 * @param {object} observable The Observable object to bind to
	 */
	function BindActive(observable) {

		// Interface elements that are bound to Observable data
		var bound = {};

		// Custom Events
		var showEvent   = new CustomEvent('show.ipc.nav');
		var hideEvent   = new CustomEvent('hide.ipc.nav');
		var shownEvent  = new CustomEvent('shown.ipc.nav');
		var hiddenEvent = new CustomEvent('hidden.ipc.nav');

		// The default active/inactive listener
		observable.subscribe(
			function(key, newValue) {
				bound[key].forEach(function(el) {
					var pane = el.className.indexOf('nav-pane') !== -1 ? el.querySelector('div') : false;
					// console.log(pane, el.offsetTop, window.pageYOffset);

					if (newValue) {
						if (pane) {
							el.dispatchEvent(showEvent);
							expandSection(pane);
						}
						// Allow cycle to add active so transition will function properly
						setTimeout(function() { el.classList.add('active'); }, 5);
						// ARIA
						if (el.hasAttribute('aria-selected')) {
							el.setAttribute('aria-selected', 'true');
						}
						if (el.hasAttribute('aria-hidden')) {
							el.setAttribute('aria-hidden', 'false');
						}
						if (pane) {
							el.dispatchEvent(shownEvent);
						}

					} else {
						if (pane) {
							el.dispatchEvent(hideEvent);
							collapseSection(pane);
						}
						// Allow cycle to remove active so transition will function properly
						setTimeout(function() { el.classList.remove('active'); }, 5);
						// ARIA
						if (el.hasAttribute('aria-selected')) {
							el.setAttribute('aria-selected', 'false');
						}
						if (el.hasAttribute('aria-hidden')) {
							el.setAttribute('aria-hidden', 'true');
						}
						if (pane) {
							el.dispatchEvent(hiddenEvent);
						}
					}
				});
			}
		);


		/**
		 * Bind element data to key
		 * @param {string} key The common identifier of the elements to bind
		 * @param {object} el  The element
		 */
		function bind(key, el) {
			if (arguments.length !== 2) { return false; }

			// add el to obj
			if (!bound[key]) {
				bound[key] = [];
			}
			if (!bound[key].includes(el)) {
				bound[key].push(el);
			}
		}


		/**
		 * Remvove a bind element data to key
		 * @param {string} key The common identifier of the elements to unbind
		 * @param {object} el  The element
		 */
		function unbind(key, el) {
			bound[key] = bound[key].filter(function(element) {
				return element !== el;
			});
		}


		/**
		 * Remove an id from the element data
		 * @param  {string}  key The id to be removed
		 * @return {boolean}     If the id was removed
		 */
		function removeKey(key) {
			if (!bound[key]) { return false; }
			var removed = observable.removeKey(key);
			if (removed) {
				delete bound[key];
			}
			return removed;
		}


		/**
		 * Returns the active state of a pane.
		 * @param  {string}  id The id of the pane to modify active state
		 * @return {boolean}    The isActive state of the pane true | false
		 */
		function isActive(key) {
			return observable(key);
		}


		/**
		 * Set the active state of a pane.
		 * @param  {string}  id    The id of the pane to modify active state
		 * @param  {boolean} state Optional: true-active, false-inactive,
		 *                         undefined-toggle active state
		 * @return {boolean}       The new isActive state of the pane true | false
		 */
		function setActive(key, state) {
			state = state === undefined ? !observable(key) : state;
			return observable(key, state);
		}


		return {
			bind        : bind,
			unbind      : unbind,
			removeKey   : removeKey,
			subscribe   : observable.subscribe,
			unsubscribe : observable.unsubscribe,
			notify      : observable.notify,
			isActive    : isActive,
			setActive   : setActive,
			logData     : observable.log,
		};
	}

};



/**
 * For jQuery
 */
if (window.jQuery) {
	jQuery.fn.ipcNavigation = function(options, callback) {
		'use strict';
		if (typeof options === 'function') {
			callback = options;
			options = {};
		}
		jQuery(this).each(function() {
			this.ipcNavigation = new IpcNavigation(this, options, callback);
		});
		return this;
	};
}
