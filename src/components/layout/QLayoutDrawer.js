import TouchPan from '../../directives/touch-pan'
import { css, cssTransform } from '../../utils/dom'
import { between } from '../../utils/format'
import { QResizeObservable } from '../observables'
import ModelToggleMixin from '../../mixins/model-toggle'
import { stopAndPrevent, getMouseWheelDistance, wheelEvent } from '../../utils/event'

const
  bodyClass = 'q-drawer-scroll',
  duration = 150

export default {
  name: 'QLayoutDrawer',
  inject: {
    layout: {
      default () {
        console.error('QLayoutDrawer needs to be child of QLayout')
      }
    }
  },
  mixins: [ModelToggleMixin],
  directives: {
    TouchPan
  },
  props: {
    overlay: Boolean,
    side: {
      type: String,
      default: 'left',
      validator: v => ['left', 'right'].includes(v)
    },
    breakpoint: {
      type: Number,
      default: 992
    },
    behavior: {
      type: String,
      validator: v => ['default', 'desktop', 'mobile'].includes(v),
      default: 'default'
    },
    contentStyle: Object,
    contentClass: [String, Object, Array],
    noHideOnRouteChange: Boolean,
    noSwipeOpen: Boolean,
    noSwipeClose: Boolean
  },
  data () {
    const
      largeScreenState = this.value !== void 0 ? this.value : true,
      showing = this.behavior !== 'mobile' && this.breakpoint < this.layout.width && !this.overlay
        ? largeScreenState
        : false

    if (this.value !== void 0 && this.value !== showing) {
      this.$emit('input', showing)
    }

    return {
      showing,
      belowBreakpoint: (
        this.behavior === 'mobile' ||
        (this.behavior !== 'desktop' && this.breakpoint >= this.layout.width)
      ),
      largeScreenState,
      mobileOpened: false,

      size: 300
    }
  },
  watch: {
    belowBreakpoint (val, old) {
      if (this.mobileOpened) {
        return
      }

      if (val) { // from lg to xs
        if (!this.overlay) {
          this.largeScreenState = this.showing
        }
        // ensure we close it for small screen
        this.hide()
      }
      else if (!this.overlay) { // from xs to lg
        this[this.largeScreenState ? 'show' : 'hide']()
      }
    },
    behavior (val) {
      this.__updateLocal('belowBreakpoint', (
        val === 'mobile' ||
        (val !== 'desktop' && this.breakpoint >= this.layout.width)
      ))
    },
    breakpoint (val) {
      this.__updateLocal('belowBreakpoint', (
        this.behavior === 'mobile' ||
        (this.behavior !== 'desktop' && val >= this.layout.width)
      ))
    },
    'layout.width' (val) {
      this.__updateLocal('belowBreakpoint', (
        this.behavior === 'mobile' ||
        (this.behavior !== 'desktop' && this.breakpoint >= val)
      ))
    },
    offset (val) {
      this.__update('offset', val)
    },
    onLayout (val) {
      this.__update('space', val)
      this.layout.__animate()
    },
    $route () {
      if (this.noHideOnRouteChange) {
        return
      }

      if (this.mobileOpened || this.onScreenOverlay) {
        this.hide()
      }
    },
    rightSide () {
      this.applyPosition()
    },
    size () {
      this.applyPosition()
    },
    '$q.i18n.rtl' () {
      this.applyPosition()
    }
  },
  computed: {
    rightSide () {
      return this.side === 'right'
    },
    offset () {
      return this.showing && !this.mobileOpened && !this.overlay
        ? this.size
        : 0
    },
    fixed () {
      return this.overlay || this.layout.view.indexOf(this.rightSide ? 'R' : 'L') > -1
    },
    onLayout () {
      return this.showing && !this.mobileView && !this.overlay
    },
    onScreenOverlay () {
      return this.showing && !this.mobileView && this.overlay
    },
    backdropClass () {
      return {
        'no-pointer-events': !this.showing
      }
    },
    mobileView () {
      return this.belowBreakpoint || this.mobileOpened
    },
    headerSlot () {
      return this.overlay
        ? false
        : (this.rightSide
          ? this.layout.rows.top[2] === 'r'
          : this.layout.rows.top[0] === 'l'
        )
    },
    footerSlot () {
      return this.overlay
        ? false
        : (this.rightSide
          ? this.layout.rows.bottom[2] === 'r'
          : this.layout.rows.bottom[0] === 'l'
        )
    },
    belowClass () {
      return {
        'fixed': true,
        'on-top': true,
        'q-layout-drawer-delimiter': this.fixed && this.showing,
        'top-padding': true
      }
    },
    aboveClass () {
      return {
        'fixed': this.fixed || !this.onLayout,
        'q-layout-drawer-delimiter': this.fixed && this.showing,
        'top-padding': this.headerSlot
      }
    },
    aboveStyle () {
      const css = {}

      if (this.layout.header.space && !this.headerSlot) {
        if (this.fixed) {
          css.top = `${this.layout.header.offset}px`
        }
        else if (this.layout.header.space) {
          css.top = `${this.layout.header.size}px`
        }
      }

      if (this.layout.footer.space && !this.footerSlot) {
        if (this.fixed) {
          css.bottom = `${this.layout.footer.offset}px`
        }
        else if (this.layout.footer.space) {
          css.bottom = `${this.layout.footer.size}px`
        }
      }

      return css
    },
    computedStyle () {
      return [this.contentStyle, this.mobileView ? '' : this.aboveStyle]
    },
    computedClass () {
      return [this.contentClass, this.mobileView ? this.belowClass : this.aboveClass]
    },
    stateDirection () {
      return (this.$q.i18n.rtl ? -1 : 1) * (this.rightSide ? 1 : -1)
    },
    containerOn () {
      if (this.$q.platform.is.desktop) {
        return { [wheelEvent.name]: this.__onWheel }
      }
    }
  },
  render (h) {
    const child = []

    if (this.mobileView) {
      if (!this.noSwipeOpen) {
        child.push(h('div', {
          staticClass: `q-layout-drawer-opener fixed-${this.side}`,
          directives: [{
            name: 'touch-pan',
            modifiers: { horizontal: true },
            value: this.__openByTouch
          }]
        }))
      }
      child.push(h('div', {
        ref: 'backdrop',
        staticClass: 'fullscreen q-layout-backdrop',
        'class': this.backdropClass,
        on: { click: this.hide },
        directives: [{
          name: 'touch-pan',
          modifiers: { horizontal: true },
          value: this.__closeByTouch
        }]
      }))
    }

    return h('div', {
      staticClass: 'q-drawer-container',
      on: this.containerOn
    }, child.concat([
      h('aside', {
        ref: 'content',
        staticClass: `q-layout-drawer q-layout-transition q-layout-drawer-${this.side} scroll`,
        'class': this.computedClass,
        style: this.computedStyle,
        attrs: this.$attrs,
        listeners: this.$listeners,
        directives: this.mobileView && !this.noSwipeClose ? [{
          name: 'touch-pan',
          modifiers: { horizontal: true },
          value: this.__closeByTouch
        }] : null
      }, [
        h(QResizeObservable, {
          props: { debounce: 0 },
          on: { resize: this.__onResize }
        }),
        this.$slots.default
      ])
    ]))
  },
  created () {
    this.layout.instances[this.side] = this
    this.__update('space', this.onLayout)
    this.__update('offset', this.offset)

    this.$nextTick(() => {
      this.animateOverlay = true
    })
  },
  mounted () {
    if (this.showing) {
      this.applyPosition(0)
    }
  },
  beforeDestroy () {
    clearTimeout(this.timer)
    if (this.layout.instances[this.side] === this) {
      this.layout.instances[this.side] = null
      this.__update('size', 0)
      this.__update('offset', 0)
      this.__update('space', false)
    }
  },
  methods: {
    applyPosition (position) {
      if (position === void 0) {
        this.$nextTick(() => {
          position = this.showing
            ? 0
            : (this.$q.i18n.rtl ? -1 : 1) * (this.rightSide ? 1 : -1) * this.size

          this.applyPosition(position)
        })
        return
      }
      css(this.$refs.content, cssTransform(`translateX(${position}px)`))
    },
    applyBackdrop (x) {
      this.$refs.backdrop && css(this.$refs.backdrop, { backgroundColor: `rgba(0,0,0,${x * 0.4})` })
    },
    __onWheel (e) {
      if (this.fixed) {
        stopAndPrevent(e)
        this.$refs.content.scrollTop += getMouseWheelDistance(e).pixelY
      }
    },
    __openByTouch (evt) {
      if (!this.belowBreakpoint) {
        return
      }
      const
        width = this.size,
        position = between(evt.distance.x, 0, width)

      if (evt.isFinal) {
        const
          el = this.$refs.content,
          opened = position >= Math.min(75, width)

        el.classList.remove('no-transition')
        this.layout.__animate()
        this.$nextTick(() => {
          if (opened) {
            this.show()
          }
          else {
            this.applyBackdrop(0)
            this.applyPosition(this.stateDirection * width)
            el.classList.remove('q-layout-drawer-delimiter')
          }
        })
        return
      }

      this.applyPosition(
        (this.$q.i18n.rtl ? !this.rightSide : this.rightSide)
          ? Math.max(width - position, 0)
          : Math.min(0, position - width)
      )
      this.applyBackdrop(
        between(position / width, 0, 1)
      )

      if (evt.isFirst) {
        const el = this.$refs.content
        el.classList.add('no-transition')
        el.classList.add('q-layout-drawer-delimiter')
      }
    },
    __closeByTouch (evt) {
      if (!this.mobileOpened) {
        return
      }

      const
        width = this.size,
        dir = evt.direction === this.side,
        position = (this.$q.i18n.rtl ? !dir : dir)
          ? between(evt.distance.x, 0, width)
          : 0

      if (evt.isFinal) {
        const opened = Math.abs(position) < Math.min(75, width)
        this.$refs.content.classList.remove('no-transition')
        this.layout.__animate()
        this.$nextTick(() => {
          if (opened) {
            this.applyBackdrop(1)
            this.applyPosition(0)
          }
          else {
            this.hide()
          }
        })
        return
      }

      this.applyPosition(this.stateDirection * position)
      this.applyBackdrop(between(1 - position / width, 0, 1))

      if (evt.isFirst) {
        this.$refs.content.classList.add('no-transition')
      }
    },
    __show () {
      this.layout.__animate()
      this.applyPosition(0)

      const otherSide = this.layout.instances[this.rightSide ? 'left' : 'right']
      if (otherSide && otherSide.mobileOpened) {
        otherSide.hide()
      }
      if (this.belowBreakpoint) {
        this.mobileOpened = true
        this.applyBackdrop(1)
      }
      else {
        document.body.classList.add(bodyClass)
      }

      clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        if (this.showPromise) {
          this.showPromise.then(() => {
            document.body.classList.remove(bodyClass)
          })
          this.showPromiseResolve()
        }
      }, duration)
    },
    __hide () {
      this.layout.__animate()
      clearTimeout(this.timer)

      this.mobileOpened = false
      this.applyPosition((this.$q.i18n.rtl ? -1 : 1) * (this.rightSide ? 1 : -1) * this.size)
      this.applyBackdrop(0)

      document.body.classList.remove(bodyClass)

      this.timer = setTimeout(() => {
        this.hidePromise && this.hidePromiseResolve()
      }, duration)
    },

    __onResize ({ width }) {
      this.__update('size', width)
      this.__updateLocal('size', width)
    },
    __update (prop, val) {
      if (this.layout[this.side][prop] !== val) {
        this.layout[this.side][prop] = val
      }
    },
    __updateLocal (prop, val) {
      if (this[prop] !== val) {
        this[prop] = val
      }
    }
  }
}
