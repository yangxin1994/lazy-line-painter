/*
 * Lazy Line Painter
 * SVG Stroke animation.
 *
 * https://github.com/camoconnell/lazy-line-painter
 * http://www.camoconnell.com
 *
 * Copyright 2013-2018 Cam O'Connell
 * All rights reserved.
 *
 * Licensed under the MIT license.
 *
 */

import Events from './events';
import Easing from './easing';

class LazyLinePainter {

  /**
   * init
   * Responsible for caching user options,
   * @public
   * @param  {object} opts user defined options
   */

  constructor(el, config) {

    this.el = el;
    this.config = Object.assign({

      paths: [],

      strokeWidth: null,
      strokeDash: null,
      strokeColor: null,
      strokeOverColor: null,
      strokeCap: null,
      strokeJoin: null,
      strokeOpacity: null,

      delay: 0,
      ease: null,
      drawSequential: false,
      speedMultiplier: 1,
      reverse: false,
      paused: false,
      progress: 0,

      longestDuration: 0,
      playhead: 0,
      log: true,
      offset: this.el.getBoundingClientRect(),
      initialised: false

    }, config, {});
    Object.assign(this, Events, {});

    this.__raf = null;

    let paths;
    let composed = Boolean(this.el.dataset.llpComposed);

    if (composed) {
      paths = this.el.querySelectorAll('[data-llp-id]');
    } else {
      paths = this.uncomposed();
    }

    let i;

    for (i = 0; i < paths.length; i++) {
      this.config.paths.push({
        el: paths[i]
      });
    }

    this.className = 'lazy-line-painter';
    this.el.classList.add(this.className);

    this._parseDataAttrs();
    this._updateDuration();

  }

  init(resolve, reject) {
    return new Promise((resolve, reject) => {
      this._setupPaths();
      resolve();
    });
  }

  uncomposed() {
    let paths = this.el.querySelectorAll('path, polygon, circle, ellipse, polyline, line, rect');
    let i;

    for (i = 0; i < paths.length; i++) {
      let id = this.el.id.replace(/ /g, '');

      id = id.replace('.', '');
      id = id.replace('-', '');
      paths[i].dataset.llpId = id + '-' + i;
      paths[i].dataset.llpDuration = 5000;
      paths[i].dataset.llpDelay = 0;
    }

    if (this.config.log) {
      console.log('This lazy line is uncomposed! Visit http://lazylinepainter.info to compose your masterpiece!');
    }

    return paths;
  }

  /**
   * paint
   * Responsible for drawing path.
   * @public
   */

  paint() {

    this.erase();

    // begin animation
    this._paint();

    // fire onStart callback
    this.emit('start');
  }

  /**
   * pause
   * Responsible for pausing path animation.
   * @public
   */
  pause() {
    if (!this.config.paused) {
      this.config.paused = true;
      cancelAnimationFrame(this.__raf);
    }
  }

  /**
   * resume
   * Responsible for resuming path animation.
   * @public
   */
  resume() {
    if (this.config.paused) {
      requestAnimationFrame((timestamp) => {
        this.adjustStartTime(timestamp);
      });
      this.config.paused = false;
    }
  }

  /**
   * erase
   * Responsible for clearing path,
   * paint can still be called on the element after it has been erased.
   * @public
   */
  erase() {

    // reset / cancel rAF
    this.config.startTime = null;
    this.config.elapsedTime = null;
    cancelAnimationFrame(this.__raf);

    // reset callback
    this.config.onStrokeCompleteDone = false;

    // reset paused
    this.config.paused = false;

    // empty contents of svg
    for (let i = 0; i < this.config.paths.length; i++) {
      let path = this.config.paths[i];

      path.el.style.strokeDashoffset = path.length;
      path.onStrokeCompleteDone = false;
      path.onStrokeStartDone = false;
    }
  }

  /**
   * destroy
   * Responsible for removing lazyline data and element from DOM
   * @public
   */
  destroy() {

    // retrieve / remove data object
    this.config = null;

    // remove class
    this.el.classList.remove(this.className);

    // empty container element
    this.el.remove();
    this.el = null;

  }

  /**
   * set
   * @public
   */
  set(prop, value) {
    switch (prop) {
      case 'progress':
        this._setProgress(value);
        break;
      case 'delay':
        this._setDelay(value);
        break;
      default:
        if (this.config.log) {
          console.log('property ' + prop + ' can not be set');
        }
    }
  }

  _setProgress(progress) {
    this.config.progress = progress;
    this._updatePaths();
  }

  _setDelay(delay) {
    this.config.delay = delay;
    this._updateDuration();
  }

  _updateDuration() {

    let totalDuration = this._getTotalDuration();
    let longestDuration = this._getLongestDuration();

    this.config.totalDuration = this.config.drawSequential ? totalDuration : longestDuration;
    this.config.totalDuration += this.config.delay;

    this._calcPathDurations();
  }

  /**
   * get
   * @public
   */
  get() {
    return this.config;
  }

  /**
   * resize
   * @public
   */
  resize() {

    this.config.offset = this.el.getBoundingClientRect();
    // this.config.scale = this.config.offset.width / this.config.width;

    for (let i = 0; i < this.config.paths.length; i++) {
      let path = this.config.paths[i];

      path.el.getBoundingClientRect();
      path.positions = this._getPathPoints(path.el, path.length);
      this._updatePosition(path);
    }
  }

  _parseDataAttrs() {
    for (let i = 0; i < this.config.paths.length; i++) {
      let path = this.config.paths[i];

      path.id = path.el.dataset.llpId;
      path.delay = Number(path.el.dataset.llpDelay) || 0;
      path.duration = Number(path.el.dataset.llpDuration) || 0;
      path.reverse = Boolean(path.el.dataset.llpReverse) || false;
      path.ease = Number(path.el.dataset.llpEase) || null;
      // path.strokeDash = path.el.dataset.llpStrokeDash || null;
      path.delay *= this.config.speedMultiplier;
      path.duration *= this.config.speedMultiplier;

      this._setStyleAttrs(path);
    }
  }

  _setStyleAttrs(path) {

    path.strokeColor = (path.el.dataset.llpStrokeColor || this.config.strokeColor);

    if (path.strokeColor) {
      path.el.setAttributeNS(null, 'stroke', path.strokeColor);
    }

    path.strokeOpacity = (path.el.dataset.llpStrokeOpacity || this.config.strokeOpacity);
    if (path.strokeOpacity) {
      path.el.setAttributeNS(null, 'stroke-opacity', path.strokeOpacity);
    }

    path.strokeWidth = (path.el.dataset.llpStrokeWidth || this.config.strokeWidth);
    if (path.strokeWidth) {
      path.el.setAttributeNS(null, 'stroke-width', path.strokeWidth);
    }

    path.strokeCap = (path.el.dataset.llpStrokeCap || this.config.strokeCap);
    if (path.strokeCap) {
      path.el.setAttributeNS(null, 'stroke-linecap', path.strokeCap);
    }

    path.strokeJoin = (path.el.dataset.llpStrokeJoin || this.config.strokeJoin);
    if (path.strokeJoin) {
      path.el.setAttributeNS(null, 'stroke-linejoin', path.strokeJoin);
    }
  }

  _setupPaths() {

    for (let i = 0; i < this.config.paths.length; i++) {

      let path = this.config.paths[i];

      path.index = i;
      path.length = this._getPathLength(path.el);
      path.positions = this._getPathPoints(path.el, path.length);

      path.el.style.strokeDashoffset = path.length;
      path.el.style.strokeDasharray = path.length;

      path.onStrokeStartDone = false;
      path.onStrokeCompleteDone = false;
    }
  };

  _calcPathDurations() {
    let startTime =/* this.config.reverse ? this.config.totalDuration : */this.config.delay;

    for (let i = 0; i < this.config.paths.length; i++) {

      let path = this.config.paths[i];

      path.progress = 0;

      // if (this.config.reverse) {
      //   startTime -= path.duration;
      // } else {
      if (this.config.drawSequential) {
        startTime = 0;
      } else {
        startTime = path.delay;
      }
      // }

      path.startTime = startTime;
      path.startProgress = (path.startTime / this.config.totalDuration);
      path.durationProgress = (path.duration / this.config.totalDuration);
    }
  }

  /**
   * adjustStartTime
   * Responsible for managing time.
   * @private
   * @param  {number} timestamp identifies current time
   * @param  {object} data      contains options set on init() and paint()
   */
  adjustStartTime(timestamp) {
    this.config.startTime = timestamp - this.config.elapsedTime;
    requestAnimationFrame((timestamp) => {
      this._paint(timestamp);
    });
  }

  /**
   * _paint
   * Responsible for animating paths.
   * Path incrementation is performed using requestAnimationFrame.
   * @private
   * @param  {number} timestamp   identifies current time
   * @param  {object} data        contains options set on init() and paint()
   */
  _paint() {

    if (!this.config) {
      return;
    }

    // set startTime
    if (!this.config.startTime) {
      this.config.startTime = 0;
    }

    this.emit('update');

    // set elapsedTime
    let timestamp = performance.now();

    this.config.elapsedTime = (timestamp - this.config.startTime);
    let progress;

    if (this.config.reverse) {
      progress = (1 - (this.config.elapsedTime / this.config.totalDuration));
    } else {
      progress = (this.config.elapsedTime / this.config.totalDuration);
    }

    this.config.progress = this._getProgress(progress, this.config.ease);

    this._updatePaths();

    if (progress > 0 && progress < 1) {
      this.__raf = requestAnimationFrame(() => {
        this._paint();
      });
    } else {
      this.emit('complete');
    }
  }

  _updatePaths() {

    for (let i = 0; i < this.config.paths.length; i++) {
      let path = this.config.paths[i];
      let pathProgress = this._getElapsedProgress(path);

      path.progress = this._getProgress(pathProgress, path.ease);
      this._setLine(path);
      this._updatePosition(path);
      this._updateStrokeCallbacks(path);
    }
  }

  _getElapsedProgress(path) {

    let elapsedProgress;

    if (
      this.config.progress >= path.startProgress &&
      this.config.progress <= (path.startProgress + path.durationProgress)
    ) {
      elapsedProgress = (this.config.progress - path.startProgress) / path.durationProgress;
    } else if (this.config.progress >= (path.startProgress + path.durationProgress)) {
      elapsedProgress = 1;
    } else if (this.config.progress <= path.startProgress) {
      elapsedProgress = 0;
    }

    return elapsedProgress;
  }

  _getProgress(linear_progress, ease) {

    let progress = linear_progress;

    if (ease) {
      progress = Easing[ease](linear_progress);
    }
    return progress;
  }

  _setLine(path) {

    let el = path.el;
    let length = path.progress * path.length;

    if (/* this.config.reverse || */path.reverse) {
      el.style.strokeDashoffset = -path.length + length;
    } else {
      el.style.strokeDashoffset = path.length - length;
    }
  }

  _updateStrokeCallbacks(path) {

    if (path.progress === 1) {

      if (!path.onStrokeCompleteDone) {
        path.onStrokeCompleteDone = true;

        this.emit('complete:' + path.id, path);
        this.emit('complete:all', path);
      }

    } else if (path.progress > 0.00001) {

      if (!path.onStrokeStartDone) {
        this.emit('start:' + path.id, path);
        this.emit('start:all', path);
        path.onStrokeStartDone = true;
      }

      this.emit('update:' + path.id, path);
      this.emit('update:all', path);
    }
  }

  /**
   * _updatePosition
   * Responsible for updating the paths x / y position.
   * @private
   */
  _updatePosition(path) {
    let index = Math.round((path.progress * (path.length - 1)));
    let position = path.positions[index];

    path.position = {
      x: this.config.offset.left + position.x,
      y: this.config.offset.top + position.y
    };
  }

  _getTotalDuration() {

    let totalDuration = 0;
    let paths = this.config.paths;

    for (let i = 0; i < paths.length; i++) {
      let pathDelay = paths[i].delay || 0;

      totalDuration += (paths[i].duration + pathDelay);
    }

    return totalDuration;
  }

  _getLongestDuration() {

    let longestDuration = 0;
    let paths = this.config.paths;

    for (let i = 0; i < paths.length; i++) {
      let pathTotalDuration = paths[i].delay + paths[i].duration;

      if (pathTotalDuration > longestDuration) {
        longestDuration = pathTotalDuration;
      }
    }

    return longestDuration;
  };

  /**
   * _getPathLength
   * Responsible for returning a svg path length.
   * @return {number} path length
   */
  _getPathLength(el) {
    return Math.ceil(el.getTotalLength());
  }

  /**
   * _getPathPoints
   * Responsible for returning a svg path coords.
   * @return {array} path coords
   */
  _getPathPoints(el, length) {

    let arr = [];

    for (let i = 0; i < length; i++) {
      let position = el.getPointAtLength(i);

      arr.push({
        x: position.x,
        y: position.y
      });
    };
    return arr;
  }

  /**
   * _getStrokeDashArray
   * @private
   */
  _getStrokeDashArray(path, length) {
    let strokeDash;

    if (path.strokeDash) {
      strokeDash = this._getStrokeDashString(path.strokeDash, length);
    } else if (this.config.strokeDash) {
      strokeDash = this._getStrokeDashString(this.config.strokeDash, length);
    } else {
      strokeDash = length + ' ' + length;
    };
    return strokeDash;
  }

  /**
   * _getStrokeDashString
   * @private
   */
  _getStrokeDashString(dashArray, length) {
    let strokeDashString = '';
    let strokeDashArray = dashArray.split(',');
    let strokeDashTotal = 0;
    let strokeDashNum;
    let strokeDashRemainder;

    for (let i = strokeDashArray.length - 1; i >= 0; i--) {
      strokeDashTotal += Number(strokeDashArray[i]);
    };
    strokeDashNum = Math.floor(length / strokeDashTotal);
    strokeDashRemainder = length - (strokeDashNum * strokeDashTotal);
    for (let i = strokeDashNum - 1; i >= 0; i--) {
      strokeDashString += (dashArray + ', ');
    };
    let preArray = strokeDashString + strokeDashRemainder + ', ' + length;

    return preArray.split(',').join('px,') + 'px';
  }

}
window.LazyLinePainter = LazyLinePainter;
export default LazyLinePainter;
