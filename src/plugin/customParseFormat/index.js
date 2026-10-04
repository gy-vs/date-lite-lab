import { u } from '../localizedFormat/utils'
import { MILLISECONDS_A_MINUTE, MILLISECONDS_A_WEEK } from '../../constant'

const formattingTokens = /(\[[^[]*\])|([-_:/.,()\s]+)|(A|a|Q|YYYY|YY?|MM?M?M?|Do|DD?|ww?|hh?|HH?|mm?|ss?|S{1,3}|z|ZZ?)/g

const match1 = /\d/ // 0 - 9
const match2 = /\d\d/ // 00 - 99
const match3 = /\d{3}/ // 000 - 999
const match4 = /\d{4}/ // 0000 - 9999
const match1to2 = /\d\d?/ // 0 - 99
const matchSigned = /[+-]?\d+/ // -inf - inf
const matchOffset = /[+-]\d\d:?(\d\d)?|Z/ // +00:00 -00:00 +0000 or -0000 +00 or Z
const matchWord = /\d*[^-_:/,()\s\d]+/ // Word

let locale = {}

let parseTwoDigitYear = function (input) {
  input = +input
  return input + (input > 68 ? 1900 : 2000)
}

function offsetFromString(string) {
  if (!string) return 0
  if (string === 'Z') return 0
  const parts = string.match(/([+-]|\d\d)/g)
  const minutes = +(parts[1] * 60) + (+parts[2] || 0)
  return minutes === 0 ? 0 : parts[0] === '+' ? -minutes : minutes // eslint-disable-line no-nested-ternary
}

const addInput = function (property) {
  return function (input) {
    this[property] = +input
  }
}

const zoneExpressions = [matchOffset, function (input) {
  const zone = this.zone || (this.zone = {})
  zone.offset = offsetFromString(input)
}]

const getLocalePart = (name) => {
  const part = locale[name]
  return part && (
    part.indexOf ? part : part.s.concat(part.f)
  )
}
const meridiemMatch = (input, isLowerCase) => {
  let isAfternoon
  const { meridiem } = locale
  if (!meridiem) {
    isAfternoon = input === (isLowerCase ? 'pm' : 'PM')
  } else {
    for (let i = 1; i <= 24; i += 1) {
      // todo: fix input === meridiem(i, 0, isLowerCase)
      if (input.indexOf(meridiem(i, 0, isLowerCase)) > -1) {
        isAfternoon = i > 12
        break
      }
    }
  }
  return isAfternoon
}
const expressions = {
  A: [matchWord, function (input) {
    this.afternoon = meridiemMatch(input, false)
  }],
  a: [matchWord, function (input) {
    this.afternoon = meridiemMatch(input, true)
  }],
  S: [match1, function (input) {
    this.milliseconds = +input * 100
  }],
  SS: [match2, function (input) {
    this.milliseconds = +input * 10
  }],
  SSS: [match3, function (input) {
    this.milliseconds = +input
  }],
  s: [match1to2, addInput('seconds')],
  ss: [match1to2, addInput('seconds')],
  m: [match1to2, addInput('minutes')],
  mm: [match1to2, addInput('minutes')],
  H: [match1to2, addInput('hours')],
  h: [match1to2, addInput('hours')],
  HH: [match1to2, addInput('hours')],
  hh: [match1to2, addInput('hours')],
  D: [match1to2, addInput('day')],
  DD: [match2, addInput('day')],
  Do: [matchWord, function (input) {
    const { ordinal } = locale;
    [this.day] = input.match(/\d+/)
    if (!ordinal) return
    for (let i = 1; i <= 31; i += 1) {
      if (ordinal(i).replace(/\[|\]/g, '') === input) {
        this.day = i
      }
    }
  }],
  M: [match1to2, addInput('month')],
  MM: [match2, addInput('month')],
  MMM: [matchWord, function (input) {
    const months = getLocalePart('months')
    const monthsShort = getLocalePart('monthsShort')
    const matchIndex = (monthsShort || months.map(_ => _.slice(0, 3))).indexOf(input) + 1
    if (matchIndex < 1) {
      throw new Error()
    }
    this.month = (matchIndex % 12) || matchIndex
  }],
  MMMM: [matchWord, function (input) {
    const months = getLocalePart('months')
    const matchIndex = months.indexOf(input) + 1
    if (matchIndex < 1) {
      throw new Error()
    }
    this.month = (matchIndex % 12) || matchIndex
  }],
  Q: [match1to2, function (input) {
    const quarter = +input
    if (quarter < 1 || quarter > 4) {
      throw new Error()
    }
    this.month = ((quarter - 1) * 3) + 1
  }],
  w: [match1to2, addInput('week')],
  ww: [match2, addInput('week')],
  Y: [matchSigned, addInput('year')],
  YY: [match2, function (input) {
    this.year = parseTwoDigitYear(input)
  }],
  YYYY: [match4, addInput('year')],
  Z: zoneExpressions,
  ZZ: zoneExpressions
}

function correctHours(time) {
  const { afternoon } = time
  if (afternoon !== undefined) {
    const { hours } = time
    if (afternoon) {
      if (hours < 12) {
        time.hours += 12
      }
    } else if (hours === 12) {
      time.hours = 0
    }
    delete time.afternoon
  }
}

// The week of year calculations below mirror the weekOfYear plugin,
// so parsing 'w' / 'ww' stays consistent with formatting, even when
// the weekOfYear plugin itself is not loaded.
const getLocaleYearStart = () => (locale && locale.yearStart) || 1
const getLocaleWeekStart = () => (locale && locale.weekStart) || 0

const makeDate = (y, m, d, utc) => (utc ? new Date(Date.UTC(y, m, d)) : new Date(y, m, d))

const addDays = (date, days, utc) => {
  const result = new Date(date.getTime())
  if (utc) {
    result.setUTCDate(result.getUTCDate() + days)
  } else {
    result.setDate(result.getDate() + days)
  }
  return result
}

const startOfWeek = (date, utc) => {
  const weekStart = getLocaleWeekStart()
  const dayOfWeek = utc ? date.getUTCDay() : date.getDay()
  const gap = (dayOfWeek < weekStart ? dayOfWeek + 7 : dayOfWeek) - weekStart
  return addDays(date, -gap, utc)
}

const getUtcOffset = date => -Math.round(date.getTimezoneOffset() / 15) * 15

// same algorithm as the weekOfYear plugin
const weekOfYear = (date, utc) => {
  const yearStart = getLocaleYearStart()
  const y = utc ? date.getUTCFullYear() : date.getFullYear()
  const month = utc ? date.getUTCMonth() : date.getMonth()
  const day = utc ? date.getUTCDate() : date.getDate()
  if (month === 11 && day > 25) {
    const nextYearStartDay = makeDate(y + 1, 0, yearStart, utc)
    const thisEndOfWeek = addDays(startOfWeek(date, utc), 6, utc)
    if (nextYearStartDay.getTime() <= thisEndOfWeek.getTime()) {
      return 1
    }
  }
  const yearStartDay = makeDate(y, 0, yearStart, utc)
  const yearStartWeek = new Date(startOfWeek(yearStartDay, utc).getTime() - 1)
  let zoneDelta = 0
  if (!utc) {
    zoneDelta = (getUtcOffset(yearStartWeek) - getUtcOffset(date)) * MILLISECONDS_A_MINUTE
  }
  const diffInWeek = ((date.getTime() - yearStartWeek.getTime()) - zoneDelta) / MILLISECONDS_A_WEEK
  if (diffInWeek < 0) {
    return weekOfYear(startOfWeek(date, utc), utc)
  }
  return Math.ceil(diffInWeek)
}

// First day (in the current locale) of the given week of the year.
// Returns null when the week does not exist in that year.
const dateFromWeek = (y, week, utc) => {
  if (week < 1) return null
  const firstDayOfYear = makeDate(y, 0, 1, utc)
  // Dates of early January may belong to the last week of the previous
  // year's cycle, so try the previous year as a fallback. In both cases
  // the result is clamped to the first day of the year, so that it still
  // formats back to the input year.
  for (let i = 0; i < 2; i += 1) {
    const yearStartDay = makeDate(y - i, 0, getLocaleYearStart(), utc)
    let date = addDays(startOfWeek(yearStartDay, utc), (week - 1) * 7, utc)
    if (date.getTime() < firstDayOfYear.getTime()) {
      date = firstDayOfYear
    }
    const dateYear = utc ? date.getUTCFullYear() : date.getFullYear()
    if (dateYear === y && weekOfYear(date, utc) === week) {
      return date
    }
  }
  return null
}

function makeParser(format) {
  format = u(format, locale && locale.formats)
  const array = format.match(formattingTokens)
  const { length } = array
  for (let i = 0; i < length; i += 1) {
    const token = array[i]
    const parseTo = expressions[token]
    const regex = parseTo && parseTo[0]
    const parser = parseTo && parseTo[1]
    if (parser) {
      array[i] = { regex, parser }
    } else {
      array[i] = token.replace(/^\[|\]$/g, '')
    }
  }
  return function (input) {
    const time = {}
    for (let i = 0, start = 0; i < length; i += 1) {
      const token = array[i]
      if (typeof token === 'string') {
        start += token.length
      } else {
        const { regex, parser } = token
        const part = input.slice(start)
        const match = regex.exec(part)
        const value = match[0]
        parser.call(time, value)
        input = input.replace(value, '')
      }
    }
    correctHours(time)
    return time
  }
}

const parseFormattedInput = (input, format, utc) => {
  try {
    if (['x', 'X'].indexOf(format) > -1) return new Date((format === 'X' ? 1000 : 1) * input)
    const parser = makeParser(format)
    const {
      year, month, day, hours, minutes, seconds, milliseconds, zone, week
    } = parser(input)
    const now = new Date()
    let d = day || ((!year && !month) ? now.getDate() : 1)
    const y = year || now.getFullYear()
    let M = 0
    if (!(year && !month)) {
      M = month > 0 ? month - 1 : now.getMonth()
    }
    if (week !== undefined && month === undefined && day === undefined) {
      // like moment.js, the week of year is only used
      // when no month and no day of month are given
      const weekDate = dateFromWeek(y, week, utc)
      if (!weekDate) {
        throw new Error()
      }
      M = utc ? weekDate.getUTCMonth() : weekDate.getMonth()
      d = utc ? weekDate.getUTCDate() : weekDate.getDate()
    }
    const h = hours || 0
    const m = minutes || 0
    const s = seconds || 0
    const ms = milliseconds || 0
    if (zone) {
      return new Date(Date.UTC(y, M, d, h, m, s, ms + (zone.offset * 60 * 1000)))
    }
    if (utc) {
      return new Date(Date.UTC(y, M, d, h, m, s, ms))
    }
    return new Date(y, M, d, h, m, s, ms)
  } catch (e) {
    return new Date('') // Invalid Date
  }
}


export default (o, C, d) => {
  d.p.customParseFormat = true
  if (o && o.parseTwoDigitYear) {
    ({ parseTwoDigitYear } = o)
  }
  const proto = C.prototype
  const oldParse = proto.parse
  proto.parse = function (cfg) {
    const {
      date,
      utc,
      args
    } = cfg
    this.$u = utc
    const format = args[1]
    if (typeof format === 'string') {
      const isStrictWithoutLocale = args[2] === true
      const isStrictWithLocale = args[3] === true
      const isStrict = isStrictWithoutLocale || isStrictWithLocale
      let pl = args[2]
      if (isStrictWithLocale) [,, pl] = args
      locale = this.$locale()
      if (!isStrictWithoutLocale && pl) {
        locale = d.Ls[pl]
      }
      this.$d = parseFormattedInput(date, format, utc)
      this.init()
      if (pl && pl !== true) this.$L = this.locale(pl).$L
      if (isStrict) {
        let strictMatch = false
        try {
          // use == to treat
          // input number 1410715640579 and format string '1410715640579' equal
          // eslint-disable-next-line eqeqeq
          strictMatch = date == this.format(format)
        } catch (e) {
          // format() may throw when a token needs a plugin that is not
          // loaded (e.g. 'w' without weekOfYear), treat it as a mismatch
        }
        if (!strictMatch) {
          this.$d = new Date('')
        }
      }
      // reset global locale to make parallel unit test
      locale = {}
    } else if (format instanceof Array) {
      const len = format.length
      for (let i = 1; i <= len; i += 1) {
        args[1] = format[i - 1]
        const result = d.apply(this, args)
        if (result.isValid()) {
          this.$d = result.$d
          this.$L = result.$L
          this.init()
          break
        }
        if (i === len) this.$d = new Date('')
      }
    } else {
      oldParse.call(this, cfg)
    }
  }
}
